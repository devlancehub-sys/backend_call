import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type LeaderboardEntry = {
  rank: number;
  host_id: number;
  name: string;
  avatar_url: string | null;
  total_talk_minutes: number;
  total_talk_seconds: number;
  completed_calls: number;
  is_promoted: boolean;
};

@Injectable()
export class HostLeaderboardService {
  constructor(private db: DatabaseService) {}

  async getCurrentWeekLeaderboard(limit = 50) {
    const range = await this.getCurrentWeekRange();
    const rows = await this.queryWeeklyRanking(range.week_start, range.week_end, limit);

    const data = rows.map((row, index) => ({
      rank: index + 1,
      host_id: Number(row.host_id),
      name: row.name as string,
      avatar_url: row.avatar_url ?? null,
      total_talk_minutes: Math.floor(Number(row.total_talk_seconds ?? 0) / 60),
      total_talk_seconds: Number(row.total_talk_seconds ?? 0),
      completed_calls: Number(row.completed_calls ?? 0),
      is_promoted: !!row.is_featured,
    }));

    return {
      success: true,
      data: {
        week_start: range.week_start,
        week_end: range.week_end,
        entries: data,
      },
    };
  }

  async getHostRank(hostId: number) {
    const range = await this.getCurrentWeekRange();
    const rows = await this.queryWeeklyRanking(range.week_start, range.week_end, 500);
    const index = rows.findIndex((row) => Number(row.host_id) === hostId);

    if (index < 0) {
      return {
        success: true,
        data: {
          week_start: range.week_start,
          week_end: range.week_end,
          rank: null,
          total_talk_minutes: 0,
          completed_calls: 0,
          is_promoted: false,
        },
      };
    }

    const row = rows[index];
    return {
      success: true,
      data: {
        week_start: range.week_start,
        week_end: range.week_end,
        rank: index + 1,
        total_talk_minutes: Math.floor(Number(row.total_talk_seconds ?? 0) / 60),
        completed_calls: Number(row.completed_calls ?? 0),
        is_promoted: !!row.is_featured,
      },
    };
  }

  private async queryWeeklyRanking(weekStart: string, weekEnd: string, limit: number) {
    return this.db.query<any[]>(
      `SELECT
         u.id AS host_id,
         u.name,
         u.avatar_url,
         fh.is_featured,
         COUNT(c.id) AS completed_calls,
         COALESCE(SUM(c.duration_seconds), 0) AS total_talk_seconds
       FROM users u
       JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = 'active'
       LEFT JOIN calls c ON c.host_id = u.id
         AND c.status = 'ended'
         AND DATE(COALESCE(c.ended_at, c.created_at)) >= ?
         AND DATE(COALESCE(c.ended_at, c.created_at)) <= ?
       WHERE u.role = 'female' AND u.status = 'active'
       GROUP BY u.id, u.name, u.avatar_url, fh.is_featured
       HAVING total_talk_seconds > 0
       ORDER BY total_talk_seconds DESC, completed_calls DESC, u.name ASC
       LIMIT ?`,
      [weekStart, weekEnd, limit],
    );
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
