import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type EarningsSummaryData = {
  today_earnings: number;
  weekly_earnings: number;
  monthly_earnings: number;
  total_earnings: number;
  withdraw_balance: number;
};

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);

  constructor(private db: DatabaseService) {}

  private static emptySummary(): EarningsSummaryData {
    return {
      today_earnings: 0,
      weekly_earnings: 0,
      monthly_earnings: 0,
      total_earnings: 0,
      withdraw_balance: 0,
    };
  }

  /** First row from a mysql2 result set, or undefined when the query returns no rows. */
  private firstRow<T extends Record<string, unknown>>(
    rows: T[] | null | undefined,
  ): T | undefined {
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : undefined;
  }

  /** Parse DECIMAL/string/null values to a finite number; invalid values become 0. */
  private toAmount(value: unknown): number {
    if (value == null) return 0;
    const parsed = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async getSummary(hostId: number) {
    try {
      const [summaryRows, withdrawnRows] = await Promise.all([
        this.db.query<any[]>(
          `SELECT
             COALESCE(SUM(CASE
               WHEN created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY
               THEN amount ELSE 0 END), 0) AS today_earnings,
             COALESCE(SUM(CASE
               WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
               THEN amount ELSE 0 END), 0) AS weekly_earnings,
             COALESCE(SUM(CASE
               WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
               THEN amount ELSE 0 END), 0) AS monthly_earnings,
             COALESCE(SUM(amount), 0) AS total_earnings
           FROM earnings
           WHERE host_id = ?`,
          [hostId],
        ),
        this.db.query<any[]>(
          `SELECT COALESCE(SUM(amount), 0) as withdrawn FROM withdraw_requests
           WHERE host_id = ? AND status IN ('pending', 'processing', 'completed')`,
          [hostId],
        ),
      ]);

      const summaryRow = this.firstRow(summaryRows);
      const withdrawnRow = this.firstRow(withdrawnRows);

      const totalEarnings = this.toAmount(summaryRow?.total_earnings);
      const withdrawnAmount = this.toAmount(withdrawnRow?.withdrawn);

      const data: EarningsSummaryData = {
        today_earnings: this.toAmount(summaryRow?.today_earnings),
        weekly_earnings: this.toAmount(summaryRow?.weekly_earnings),
        monthly_earnings: this.toAmount(summaryRow?.monthly_earnings),
        total_earnings: totalEarnings,
        withdraw_balance: Math.max(0, totalEarnings - withdrawnAmount),
      };

      return { success: true, data };
    } catch (error) {
      this.logger.error(
        `getSummary failed for host ${hostId}: ${(error as Error)?.message || error}`,
      );
      return { success: true, data: EarningsService.emptySummary() };
    }
  }

  async getHistory(hostId: number, page = 1, limit = 20) {
    try {
      const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;
      const offset = (safePage - 1) * safeLimit;

      const earnings = await this.db.query(
        `SELECT e.*, u.name as caller_name FROM earnings e
         LEFT JOIN calls c ON c.id = e.call_id
         LEFT JOIN users u ON u.id = c.caller_id
         WHERE e.host_id = ? ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
        [hostId, safeLimit, offset],
      );

      return { success: true, data: Array.isArray(earnings) ? earnings : [] };
    } catch (error) {
      this.logger.error(
        `getHistory failed for host ${hostId}: ${(error as Error)?.message || error}`,
      );
      return { success: true, data: [] };
    }
  }
}
