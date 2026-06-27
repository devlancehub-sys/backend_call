import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(private db: DatabaseService) {}

  async request(hostId: number, amount: number, method: string, accountDetails: any) {
    const normalizedAmount = Math.round(Number(amount));
    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 100) {
      throw new BadRequestException('Minimum withdraw is ₹100');
    }

    const [balanceRow] = await this.db.query<any[]>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM earnings WHERE host_id = ? AND status = ?), 0) AS total,
         COALESCE((SELECT SUM(amount) FROM withdraw_requests
           WHERE host_id = ? AND status IN ('pending', 'processing', 'completed')), 0) AS withdrawn`,
      [hostId, RECORD_STATUS.ACTIVE, hostId],
    );

    const available =
      parseFloat(balanceRow?.total ?? 0) - parseFloat(balanceRow?.withdrawn ?? 0);
    if (normalizedAmount > available) {
      throw new BadRequestException('Insufficient withdraw balance');
    }

    try {
      const result = await this.db.query<any>(
        `INSERT INTO withdraw_requests (host_id, amount, method, account_details) VALUES (?, ?, ?, ?)`,
        [hostId, normalizedAmount, method, JSON.stringify(accountDetails ?? {})],
      );

      return { success: true, data: { id: result.insertId, status: 'pending' } };
    } catch (err) {
      this.logger.error(`withdraw request failed: ${(err as Error)?.message || err}`);
      throw new InternalServerErrorException('Withdraw request failed. Please try again.');
    }
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
