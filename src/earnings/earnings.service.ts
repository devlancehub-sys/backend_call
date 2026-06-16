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
      const todayRows = await this.db.query<any[]>(
        `SELECT COALESCE(SUM(amount), 0) as today_earnings FROM earnings
         WHERE host_id = ? AND DATE(created_at) = CURDATE()`,
        [hostId],
      );
      const weekRows = await this.db.query<any[]>(
        `SELECT COALESCE(SUM(amount), 0) as weekly_earnings FROM earnings
         WHERE host_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
        [hostId],
      );
      const monthRows = await this.db.query<any[]>(
        `SELECT COALESCE(SUM(amount), 0) as monthly_earnings FROM earnings
         WHERE host_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
        [hostId],
      );
      const totalRows = await this.db.query<any[]>(
        `SELECT COALESCE(SUM(amount), 0) as total_earnings FROM earnings WHERE host_id = ?`,
        [hostId],
      );
      const withdrawnRows = await this.db.query<any[]>(
        `SELECT COALESCE(SUM(amount), 0) as withdrawn FROM withdraw_requests
         WHERE host_id = ? AND status IN ('pending', 'processing', 'completed')`,
        [hostId],
      );

      const todayRow = this.firstRow(todayRows);
      const weekRow = this.firstRow(weekRows);
      const monthRow = this.firstRow(monthRows);
      const totalRow = this.firstRow(totalRows);
      const withdrawnRow = this.firstRow(withdrawnRows);

      const totalEarnings = this.toAmount(totalRow?.total_earnings);
      const withdrawnAmount = this.toAmount(withdrawnRow?.withdrawn);

      const data: EarningsSummaryData = {
        today_earnings: this.toAmount(todayRow?.today_earnings),
        weekly_earnings: this.toAmount(weekRow?.weekly_earnings),
        monthly_earnings: this.toAmount(monthRow?.monthly_earnings),
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
