import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type WeeklyTalkStats = {
  host_id: number;
  week_start: string;
  week_end: string;
  total_talk_minutes: number;
  total_talk_seconds: number;
  completed_calls: number;
};

@Injectable()
export class HostWeeklyStatsService {
  constructor(private db: DatabaseService) {}

  async getCurrentWeekStats(hostId: number) {
    const range = await this.getCurrentWeekRange();
    const stats = await this.getTalkStatsForRange(hostId, range.week_start, range.week_end);

    const data: WeeklyTalkStats = {
      host_id: hostId,
      week_start: range.week_start,
      week_end: range.week_end,
      total_talk_minutes: stats.total_talk_minutes,
      total_talk_seconds: stats.total_talk_seconds,
      completed_calls: stats.completed_calls,
    };

    return { success: true, data };
  }

  private async getTalkStatsForRange(hostId: number, weekStart: string, weekEnd: string) {
    const rows = await this.db.query<any[]>(
      `SELECT
         COUNT(*) AS completed_calls,
         COALESCE(SUM(duration_seconds), 0) AS total_talk_seconds
       FROM calls
       WHERE host_id = ? AND status = 'ended'
         AND DATE(COALESCE(ended_at, created_at)) >= ?
         AND DATE(COALESCE(ended_at, created_at)) <= ?`,
      [hostId, weekStart, weekEnd],
    );

    const totalTalkSeconds = Number(rows[0]?.total_talk_seconds ?? 0);
    return {
      completed_calls: Number(rows[0]?.completed_calls ?? 0),
      total_talk_seconds: totalTalkSeconds,
      total_talk_minutes: Math.floor(totalTalkSeconds / 60),
    };
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
}
