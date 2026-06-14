import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class EarningsService {
  constructor(private db: DatabaseService) {}

  async getSummary(hostId: number) {
    const [today] = await this.db.query<any[]>(
      `SELECT COALESCE(SUM(amount), 0) as today_earnings FROM earnings
       WHERE host_id = ? AND DATE(created_at) = CURDATE()`,
      [hostId],
    );
    const [week] = await this.db.query<any[]>(
      `SELECT COALESCE(SUM(amount), 0) as weekly_earnings FROM earnings
       WHERE host_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [hostId],
    );
    const [month] = await this.db.query<any[]>(
      `SELECT COALESCE(SUM(amount), 0) as monthly_earnings FROM earnings
       WHERE host_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [hostId],
    );
    const [total] = await this.db.query<any[]>(
      `SELECT COALESCE(SUM(amount), 0) as total_earnings FROM earnings WHERE host_id = ?`,
      [hostId],
    );
    const [withdrawn] = await this.db.query<any[]>(
      `SELECT COALESCE(SUM(amount), 0) as withdrawn FROM withdraw_requests
       WHERE host_id = ? AND status = 'completed'`,
      [hostId],
    );

    const totalEarnings = parseFloat(total[0].total_earnings);
    const withdrawnAmount = parseFloat(withdrawn[0].withdrawn);

    return {
      success: true,
      data: {
        today_earnings: parseFloat(today[0].today_earnings),
        weekly_earnings: parseFloat(week[0].weekly_earnings),
        monthly_earnings: parseFloat(month[0].monthly_earnings),
        total_earnings: totalEarnings,
        withdraw_balance: totalEarnings - withdrawnAmount,
      },
    };
  }

  async getHistory(hostId: number, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const earnings = await this.db.query(
      `SELECT e.*, u.name as caller_name FROM earnings e
       LEFT JOIN calls c ON c.id = e.call_id
       LEFT JOIN users u ON u.id = c.caller_id
       WHERE e.host_id = ? ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [hostId, limit, offset],
    );
    return { success: true, data: earnings };
  }
}
