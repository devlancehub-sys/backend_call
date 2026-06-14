import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WithdrawService {
  constructor(private db: DatabaseService) {}

  async request(hostId: number, amount: number, method: string, accountDetails: any) {
    if (amount < 100) throw new BadRequestException('Minimum withdraw is ₹100');

    const [total] = await this.db.query<any[]>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM earnings WHERE host_id = ?`,
      [hostId],
    );
    const [withdrawn] = await this.db.query<any[]>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM withdraw_requests
       WHERE host_id = ? AND status IN ('pending', 'processing', 'completed')`,
      [hostId],
    );

    const available = parseFloat(total[0].total) - parseFloat(withdrawn[0].total);
    if (amount > available) throw new BadRequestException('Insufficient withdraw balance');

    const result = await this.db.query<any>(
      `INSERT INTO withdraw_requests (host_id, amount, method, account_details) VALUES (?, ?, ?, ?)`,
      [hostId, amount, method, JSON.stringify(accountDetails)],
    );

    return { success: true, data: { id: result.insertId, status: 'pending' } };
  }

  async getHistory(hostId: number) {
    const requests = await this.db.query(
      `SELECT id, amount, method, status, created_at, processed_at FROM withdraw_requests
       WHERE host_id = ? ORDER BY created_at DESC`,
      [hostId],
    );
    return { success: true, data: requests };
  }
}
