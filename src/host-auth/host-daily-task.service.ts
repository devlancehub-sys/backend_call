import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import { SocketGateway } from '../socket/socket.gateway';
import { RECORD_STATUS } from '../common/constants/record-status';

export type EarningStatus = 'inactive' | 'active';

export type WeeklyDayStatus = {
  date: string;
  day_label: string;
  completed: boolean;
  completed_calls: number;
  completed_minutes: number;
};

export type DailyTaskProgress = {
  host_id: number;
  task_date: string;
  completed_calls: number;
  completed_minutes: number;
  daily_min_calls: number;
  daily_min_minutes: number;
  target_met: boolean;
  earning_status: EarningStatus;
  streak_count: number;
  reward_amount: number;
  reward_claimed: boolean;
  can_claim_reward: boolean;
  progress_calls_percent: number;
  progress_minutes_percent: number;
  weekly_bonus_amount: number;
  weekly_days_completed: number;
  weekly_days_required: number;
  weekly_bonus_granted: boolean;
  can_claim_weekly_bonus: boolean;
  week_start: string;
  week_end: string;
  weekly_day_status: WeeklyDayStatus[];
  previous_week_bonus_pending: boolean;
};

@Injectable()
export class HostDailyTaskService {
  private readonly logger = new Logger(HostDailyTaskService.name);

  constructor(
    private db: DatabaseService,
    private platformSettings: PlatformSettingsService,
    private socket: SocketGateway,
  ) {}

  getDailyMinCalls(): number {
    return Math.max(1, Math.floor(this.platformSettings.getNumber('daily_min_calls', 'DAILY_MIN_CALLS', 6)));
  }

  getDailyMinMinutes(): number {
    return Math.max(1, Math.floor(this.platformSettings.getNumber('daily_min_minutes', 'DAILY_MIN_MINUTES', 60)));
  }

  getDailyTaskReward(): number {
    return Math.max(0, this.platformSettings.getNumber('daily_task_reward', 'DAILY_TASK_REWARD', 50));
  }

  getWeeklyTaskBonus(): number {
    return Math.max(0, this.platformSettings.getNumber('weekly_task_bonus', 'WEEKLY_TASK_BONUS', 200));
  }

  getWeeklyDaysRequired(): number {
    return 7;
  }

  isTargetMet(completedCalls: number, completedMinutes: number): boolean {
    return (
      completedCalls >= this.getDailyMinCalls() ||
      completedMinutes >= this.getDailyMinMinutes()
    );
  }

  async getProgress(hostId: number) {
    await this.rolloverPreviousDay(hostId);
    const data = await this.buildProgress(hostId);
    return { success: true, data };
  }

  async evaluateAfterCall(hostId: number) {
    await this.rolloverPreviousDay(hostId);
    const today = await this.getTodayDate();
    const progress = await this.getStatsForDate(hostId, today);
    await this.upsertDayRow(hostId, today, progress);

    if (!this.isTargetMet(progress.completed_calls, progress.completed_minutes)) {
      return null;
    }

    return this.applyTargetMet(hostId, today, progress);
  }

  async claimReward(hostId: number) {
    await this.rolloverPreviousDay(hostId);
    const today = await this.getTodayDate();
    const progress = await this.getStatsForDate(hostId, today);

    if (!this.isTargetMet(progress.completed_calls, progress.completed_minutes)) {
      throw new BadRequestException('Daily task not completed yet');
    }

    const row = await this.getDayRow(hostId, today);
    if (row?.reward_claimed) {
      throw new BadRequestException('Reward already claimed for today');
    }

    const result = await this.applyTargetMet(hostId, today, progress, true);
    if (!result?.reward_granted) {
      throw new BadRequestException('No reward available to claim');
    }

    return {
      success: true,
      message: 'Daily reward claimed',
      data: await this.buildProgress(hostId),
    };
  }

  async claimWeeklyBonus(hostId: number) {
    await this.rolloverPreviousDay(hostId);
    const previousWeek = await this.getPreviousWeekRange();

    const finalized = await this.finalizeWeekBonus(hostId, previousWeek.week_start, previousWeek.week_end);
    if (!finalized?.granted) {
      const weekly = await this.getWeeklyProgress(hostId);
      if (weekly.days_completed < this.getWeeklyDaysRequired()) {
        throw new BadRequestException(
          `Complete daily task all ${this.getWeeklyDaysRequired()} days in a week to unlock weekly bonus`,
        );
      }
      throw new BadRequestException('Weekly bonus already claimed or not available yet');
    }

    return {
      success: true,
      message: 'Weekly bonus claimed',
      data: await this.buildProgress(hostId),
    };
  }

  /** Runs on each new calendar day per host — locks yesterday & closes previous week. */
  private async rolloverPreviousDay(hostId: number) {
    const host = await this.getHostRow(hostId);
    const today = await this.getTodayDate();
    const lastEval = host.last_task_eval_date
      ? this.toDateString(host.last_task_eval_date)
      : null;

    if (lastEval === today) return;

    if (lastEval) {
      const yesterday = lastEval;
      const yesterdayStats = await this.getStatsForDate(hostId, yesterday);
      const met = this.isTargetMet(yesterdayStats.completed_calls, yesterdayStats.completed_minutes);

      await this.upsertDayRow(hostId, yesterday, yesterdayStats, met);

      if (!met) {
        await this.db.query(
          `UPDATE female_hosts SET earning_status = 'inactive', streak_count = 0 WHERE user_id = ?`,
          [hostId],
        );
        this.logger.log(`Host ${hostId} missed daily task on ${yesterday} — streak reset`);
      }
    }

    await this.finalizeCompletedWeeks(hostId, today);

    await this.db.query(
      `UPDATE female_hosts SET earning_status = 'inactive', last_task_eval_date = ? WHERE user_id = ?`,
      [today, hostId],
    );
  }

  /** Close any finished weeks that have not been evaluated yet for this host. */
  private async finalizeCompletedWeeks(hostId: number, today: string) {
    const currentWeekStart = await this.getWeekStartForDate(today);

    const pendingWeeks = await this.db.query<any[]>(
      `SELECT DISTINCT DATE_SUB(task_date, INTERVAL WEEKDAY(task_date) DAY) AS week_start
       FROM host_daily_tasks
       WHERE host_id = ?
         AND DATE_SUB(task_date, INTERVAL WEEKDAY(task_date) DAY) < ?`,
      [hostId, currentWeekStart],
    );

    for (const row of pendingWeeks) {
      const weekStart = this.toDateString(row.week_start);
      const weekEnd = await this.getWeekEndForDate(weekStart);
      await this.finalizeWeekBonus(hostId, weekStart, weekEnd);
    }
  }

  private async applyTargetMet(
    hostId: number,
    date: string,
    progress: { completed_calls: number; completed_minutes: number },
    forceClaim = false,
  ) {
    const row = await this.getDayRow(hostId, date);
    const alreadyMet = !!row?.target_met;
    const rewardClaimed = !!row?.reward_claimed;

    await this.upsertDayRow(hostId, date, progress, true);

    const host = await this.getHostRow(hostId);
    let newStreak = Number(host.streak_count ?? 0);

    if (!alreadyMet) {
      newStreak += 1;
      await this.db.query(
        `UPDATE female_hosts SET earning_status = 'active', streak_count = ? WHERE user_id = ?`,
        [newStreak, hostId],
      );
    } else {
      await this.db.query(
        `UPDATE female_hosts SET earning_status = 'active' WHERE user_id = ?`,
        [hostId],
      );
    }

    const rewardAmount = this.getDailyTaskReward();
    let rewardGranted = false;

    if (rewardAmount > 0 && !rewardClaimed && (!alreadyMet || forceClaim)) {
      await this.db.query(
        `INSERT INTO earnings (host_id, call_id, amount, type, description, status)
         VALUES (?, NULL, ?, 'bonus', ?, ?)`,
        [hostId, rewardAmount, `Daily task reward — ${date} (streak ${newStreak})`, RECORD_STATUS.ACTIVE],
      );

      await this.db.query(
        `UPDATE host_daily_tasks SET reward_claimed = 1, reward_amount = ? WHERE host_id = ? AND task_date = ?`,
        [rewardAmount, hostId, date],
      );

      rewardGranted = true;
      this.socket.notifyUser(hostId, 'earning_updated', {
        host_id: hostId,
        amount: rewardAmount,
        type: 'daily_task_bonus',
      });
      this.socket.notifyUser(hostId, 'daily_task_completed', {
        host_id: hostId,
        streak_count: newStreak,
        reward_amount: rewardAmount,
      });
    }

    return {
      target_met: true,
      streak_count: newStreak,
      earning_status: 'active' as EarningStatus,
      reward_granted: rewardGranted,
      reward_amount: rewardGranted ? rewardAmount : 0,
    };
  }

  /**
   * End-of-week evaluation per host_id:
   * Count days with target_met=1 in that week. Bonus only if ALL 7 days completed.
   */
  private async finalizeWeekBonus(hostId: number, weekStart: string, weekEnd: string) {
    const existing = await this.db.query<any[]>(
      `SELECT id, bonus_granted FROM host_weekly_bonuses WHERE host_id = ? AND week_start = ?`,
      [hostId, weekStart],
    );
    if (existing.length) {
      return existing[0].bonus_granted ? { granted: true, amount: 0, already: true } : null;
    }

    const dayRows = await this.db.query<any[]>(
      `SELECT task_date, target_met, completed_calls, completed_minutes
       FROM host_daily_tasks
       WHERE host_id = ? AND task_date >= ? AND task_date <= ?
       ORDER BY task_date`,
      [hostId, weekStart, weekEnd],
    );

    const daysCompleted = dayRows.filter((d) => Number(d.target_met) === 1).length;
    const required = this.getWeeklyDaysRequired();
    const qualifies = daysCompleted >= required;

    if (!qualifies) {
      await this.db.query(
        `INSERT INTO host_weekly_bonuses (host_id, week_start, days_completed, bonus_granted, bonus_amount)
         VALUES (?, ?, ?, 0, 0)`,
        [hostId, weekStart, daysCompleted],
      );
      this.logger.log(
        `Host ${hostId} week ${weekStart}: ${daysCompleted}/${required} days — no weekly bonus`,
      );
      return { granted: false, amount: 0, days_completed: daysCompleted };
    }

    const bonusAmount = this.getWeeklyTaskBonus();
    if (bonusAmount <= 0) {
      await this.db.query(
        `INSERT INTO host_weekly_bonuses (host_id, week_start, days_completed, bonus_granted, bonus_amount)
         VALUES (?, ?, ?, 0, 0)`,
        [hostId, weekStart, daysCompleted],
      );
      return { granted: false, amount: 0 };
    }

    await this.db.query(
      `INSERT INTO host_weekly_bonuses (host_id, week_start, days_completed, bonus_granted, bonus_amount)
       VALUES (?, ?, ?, 1, ?)`,
      [hostId, weekStart, daysCompleted, bonusAmount],
    );

    await this.db.query(
      `INSERT INTO earnings (host_id, call_id, amount, type, description, status)
       VALUES (?, NULL, ?, 'bonus', ?, ?)`,
      [
        hostId,
        bonusAmount,
        `Weekly task bonus — week ${weekStart} to ${weekEnd} (7/7 days)`,
        RECORD_STATUS.ACTIVE,
      ],
    );

    this.socket.notifyUser(hostId, 'earning_updated', {
      host_id: hostId,
      amount: bonusAmount,
      type: 'weekly_task_bonus',
    });
    this.socket.notifyUser(hostId, 'weekly_bonus_granted', {
      host_id: hostId,
      week_start: weekStart,
      week_end: weekEnd,
      bonus_amount: bonusAmount,
      days_completed: daysCompleted,
    });

    this.logger.log(`Host ${hostId} earned weekly bonus ₹${bonusAmount} for week ${weekStart}`);
    return { granted: true, amount: bonusAmount, days_completed: daysCompleted };
  }

  private async buildProgress(hostId: number): Promise<DailyTaskProgress> {
    const today = await this.getTodayDate();
    const stats = await this.getStatsForDate(hostId, today);
    const host = await this.getHostRow(hostId);
    const row = await this.getDayRow(hostId, today);
    const minCalls = this.getDailyMinCalls();
    const minMinutes = this.getDailyMinMinutes();
    const targetMet =
      !!row?.target_met ||
      this.isTargetMet(stats.completed_calls, stats.completed_minutes);
    const rewardAmount = this.getDailyTaskReward();

    await this.upsertDayRow(hostId, today, stats, targetMet);

    const weekly = await this.getWeeklyProgress(hostId);
    const previousWeek = await this.getPreviousWeekRange();

    return {
      host_id: hostId,
      task_date: today,
      completed_calls: stats.completed_calls,
      completed_minutes: stats.completed_minutes,
      daily_min_calls: minCalls,
      daily_min_minutes: minMinutes,
      target_met: targetMet,
      earning_status: (host.earning_status as EarningStatus) ?? 'inactive',
      streak_count: Number(host.streak_count ?? 0),
      reward_amount: rewardAmount,
      reward_claimed: !!row?.reward_claimed,
      can_claim_reward: targetMet && !row?.reward_claimed && rewardAmount > 0,
      progress_calls_percent: Math.min(100, Math.round((stats.completed_calls / minCalls) * 100)),
      progress_minutes_percent: Math.min(
        100,
        Math.round((stats.completed_minutes / minMinutes) * 100),
      ),
      weekly_bonus_amount: this.getWeeklyTaskBonus(),
      weekly_days_completed: weekly.days_completed,
      weekly_days_required: this.getWeeklyDaysRequired(),
      weekly_bonus_granted: weekly.bonus_granted,
      can_claim_weekly_bonus: await this.canClaimPreviousWeekBonus(hostId, previousWeek),
      week_start: weekly.week_start,
      week_end: weekly.week_end,
      weekly_day_status: weekly.day_status,
      previous_week_bonus_pending: await this.canClaimPreviousWeekBonus(hostId, previousWeek),
    };
  }

  private async canClaimPreviousWeekBonus(
    hostId: number,
    previousWeek: { week_start: string; week_end: string },
  ): Promise<boolean> {
    const rows = await this.db.query<any[]>(
      `SELECT bonus_granted FROM host_weekly_bonuses WHERE host_id = ? AND week_start = ?`,
      [hostId, previousWeek.week_start],
    );
    if (rows.length) return false;

    const countRows = await this.db.query<any[]>(
      `SELECT COUNT(*) AS days_completed FROM host_daily_tasks
       WHERE host_id = ? AND target_met = 1 AND task_date >= ? AND task_date <= ?`,
      [hostId, previousWeek.week_start, previousWeek.week_end],
    );

    return Number(countRows[0]?.days_completed ?? 0) >= this.getWeeklyDaysRequired();
  }

  private async getWeeklyProgress(hostId: number) {
    const range = await this.getCurrentWeekRange();
    const dayStatus = await this.getWeeklyDayStatus(hostId, range.week_start, range.week_end);

    const daysCompleted = dayStatus.filter((d) => d.completed).length;

    const bonusRows = await this.db.query<any[]>(
      `SELECT bonus_granted, bonus_amount FROM host_weekly_bonuses
       WHERE host_id = ? AND week_start = ?`,
      [hostId, range.week_start],
    );

    return {
      week_start: range.week_start,
      week_end: range.week_end,
      days_completed: daysCompleted,
      bonus_granted: !!bonusRows[0]?.bonus_granted,
      bonus_amount: Number(bonusRows[0]?.bonus_amount ?? 0),
      day_status: dayStatus,
    };
  }

  private async getWeeklyDayStatus(
    hostId: number,
    weekStart: string,
    weekEnd: string,
  ): Promise<WeeklyDayStatus[]> {
    const rows = await this.db.query<any[]>(
      `SELECT task_date, target_met, completed_calls, completed_minutes
       FROM host_daily_tasks
       WHERE host_id = ? AND task_date >= ? AND task_date <= ?`,
      [hostId, weekStart, weekEnd],
    );

    const byDate = new Map(
      rows.map((r) => [this.toDateString(r.task_date), r]),
    );

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const result: WeeklyDayStatus[] = [];

    const startRows = await this.db.query<any[]>(
      `SELECT task_date FROM (
         SELECT DATE_ADD(?, INTERVAL seq DAY) AS task_date
         FROM (
           SELECT 0 AS seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3
           UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
         ) AS days
       ) AS week_days`,
      [weekStart],
    );

    for (let i = 0; i < startRows.length; i++) {
      const date = this.toDateString(startRows[i].task_date);
      const row = byDate.get(date);
      const completed = row ? Number(row.target_met) === 1 : false;
      result.push({
        date,
        day_label: dayLabels[i] ?? `D${i + 1}`,
        completed,
        completed_calls: Number(row?.completed_calls ?? 0),
        completed_minutes: Number(row?.completed_minutes ?? 0),
      });
    }

    return result;
  }

  private async getStatsForDate(hostId: number, date: string) {
    const rows = await this.db.query<any[]>(
      `SELECT
         COUNT(*) AS completed_calls,
         COALESCE(SUM(FLOOR(duration_seconds / 60)), 0) AS completed_minutes
       FROM calls
       WHERE host_id = ? AND status = 'ended' AND DATE(COALESCE(ended_at, created_at)) = ?`,
      [hostId, date],
    );

    return {
      completed_calls: Number(rows[0]?.completed_calls ?? 0),
      completed_minutes: Number(rows[0]?.completed_minutes ?? 0),
    };
  }

  private async upsertDayRow(
    hostId: number,
    date: string,
    stats: { completed_calls: number; completed_minutes: number },
    targetMet?: boolean,
  ) {
    const met =
      targetMet ?? this.isTargetMet(stats.completed_calls, stats.completed_minutes);
    await this.db.query(
      `INSERT INTO host_daily_tasks (host_id, task_date, completed_calls, completed_minutes, target_met)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         completed_calls = VALUES(completed_calls),
         completed_minutes = VALUES(completed_minutes),
         target_met = GREATEST(target_met, VALUES(target_met))`,
      [hostId, date, stats.completed_calls, stats.completed_minutes, met ? 1 : 0],
    );
  }

  private async getDayRow(hostId: number, date: string) {
    const rows = await this.db.query<any[]>(
      'SELECT * FROM host_daily_tasks WHERE host_id = ? AND task_date = ?',
      [hostId, date],
    );
    return rows[0];
  }

  private async getHostRow(hostId: number) {
    const rows = await this.db.query<any[]>(
      'SELECT earning_status, streak_count, last_task_eval_date FROM female_hosts WHERE user_id = ?',
      [hostId],
    );
    return rows[0] ?? { earning_status: 'inactive', streak_count: 0, last_task_eval_date: null };
  }

  private async getTodayDate(): Promise<string> {
    const rows = await this.db.query<any[]>(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d`);
    return rows[0]?.d as string;
  }

  private async getCurrentWeekRange() {
    const rows = await this.db.query<any[]>(
      `SELECT
         DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), '%Y-%m-%d') AS week_start,
         DATE_FORMAT(DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY), '%Y-%m-%d') AS week_end`,
    );
    return {
      week_start: rows[0]?.week_start as string,
      week_end: rows[0]?.week_end as string,
    };
  }

  private async getPreviousWeekRange() {
    const rows = await this.db.query<any[]>(
      `SELECT
         DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 7 DAY), '%Y-%m-%d') AS week_start,
         DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) + 1 DAY), '%Y-%m-%d') AS week_end`,
    );
    return {
      week_start: rows[0]?.week_start as string,
      week_end: rows[0]?.week_end as string,
    };
  }

  private async getWeekStartForDate(date: string): Promise<string> {
    const rows = await this.db.query<any[]>(
      `SELECT DATE_FORMAT(DATE_SUB(?, INTERVAL WEEKDAY(?) DAY), '%Y-%m-%d') AS week_start`,
      [date, date],
    );
    return rows[0]?.week_start as string;
  }

  private async getWeekEndForDate(weekStart: string): Promise<string> {
    const rows = await this.db.query<any[]>(
      `SELECT DATE_FORMAT(DATE_ADD(?, INTERVAL 6 DAY), '%Y-%m-%d') AS week_end`,
      [weekStart],
    );
    return rows[0]?.week_end as string;
  }

  private toDateString(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 10);
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(value).slice(0, 10);
  }
}
