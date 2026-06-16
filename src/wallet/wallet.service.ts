import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class WalletService {
  constructor(private db: DatabaseService) {}

  async getBalance(userId: number) {
    const wallets = await this.db.query<any[]>(
      'SELECT balance, currency FROM wallets WHERE user_id = ? AND status = ?',
      [userId, RECORD_STATUS.ACTIVE],
    );
    return { success: true, data: wallets[0] || { balance: 0, currency: 'INR' } };
  }

  async getTransactions(userId: number, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const transactions = await this.db.query(
      `SELECT * FROM wallet_transactions WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );
    return { success: true, data: transactions };
  }

  async recharge(userId: number, amount: number, gateway = 'razorpay') {
    const validAmounts = [100, 200, 500, 1000, 2000];
    if (!validAmounts.includes(amount)) {
      throw new BadRequestException('Invalid recharge amount');
    }

    const orderId = `order_${Date.now()}`;
    await this.db.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, payment_gateway, payment_id, status, description)
       SELECT ?, 'recharge', ?, balance, ?, ?, 'pending', ? FROM wallets WHERE user_id = ? AND status = ?`,
      [userId, amount, gateway, orderId, `Recharge ₹${amount}`, userId, RECORD_STATUS.ACTIVE],
    );

    return { success: true, data: { order_id: orderId, amount, gateway } };
  }

  async confirmRecharge(userId: number, paymentId: string, amount: number) {
    const pool = this.db.getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [wallets] = await conn.query<any[]>(
        'SELECT balance FROM wallets WHERE user_id = ? AND status = ? FOR UPDATE',
        [userId, RECORD_STATUS.ACTIVE],
      );
      const newBalance = parseFloat(wallets[0].balance) + amount;

      await conn.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [newBalance, userId]);
      await conn.query(
        `UPDATE wallet_transactions SET status = 'completed', balance_after = ?
         WHERE user_id = ? AND payment_id = ?`,
        [newBalance, userId, paymentId],
      );
      await conn.commit();
      return { success: true, data: { balance: newBalance } };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
