import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RECORD_STATUS } from '../common/constants/record-status';
import { getRechargePack, listRechargePacks } from '../common/utils/recharge-packs.util';
import { FreeCallService } from './free-call.service';
import { FREE_CALL_MAX_SECONDS } from '../common/utils/billing.util';
import { ReferralsService } from '../referrals/referrals.service';

@Injectable()
export class WalletService {
  constructor(
    private db: DatabaseService,
    private freeCall: FreeCallService,
    private referrals: ReferralsService,
  ) {}

  async getBalance(userId: number) {
    const wallets = await this.db.query<any[]>(
      'SELECT balance, currency FROM wallets WHERE user_id = ? AND status = ?',
      [userId, RECORD_STATUS.ACTIVE],
    );
    const freeCallAvailable = await this.freeCall.isAvailable(userId);

    return {
      success: true,
      data: {
        ...(wallets[0] || { balance: 0, currency: 'INR' }),
        free_call_available: freeCallAvailable,
        free_call_minutes: freeCallAvailable ? 1 : 0,
      },
    };
  }

  getRechargePacks() {
    return { success: true, data: listRechargePacks() };
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
    const pack = getRechargePack(amount);
    if (!pack) {
      throw new BadRequestException('Invalid recharge amount');
    }

    const orderId = `order_${Date.now()}`;
    const description =
      pack.bonus_amount > 0
        ? `Recharge ₹${pack.pay_amount} (+₹${pack.bonus_amount} bonus → ₹${pack.credit_amount})`
        : `Recharge ₹${pack.pay_amount}`;

    await this.db.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, payment_gateway, payment_id, status, description)
       SELECT ?, 'recharge', ?, balance, ?, ?, 'pending', ? FROM wallets WHERE user_id = ? AND status = ?`,
      [userId, pack.pay_amount, gateway, orderId, description, userId, RECORD_STATUS.ACTIVE],
    );

    return {
      success: true,
      data: {
        order_id: orderId,
        pay_amount: pack.pay_amount,
        credit_amount: pack.credit_amount,
        bonus_amount: pack.bonus_amount,
        gateway,
      },
    };
  }

  async confirmRecharge(userId: number, paymentId: string, amount: number) {
    const pack = getRechargePack(amount);
    if (!pack) {
      throw new BadRequestException('Invalid recharge amount');
    }

    const pool = this.db.getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [wallets] = await conn.query<any[]>(
        'SELECT balance FROM wallets WHERE user_id = ? AND status = ? FOR UPDATE',
        [userId, RECORD_STATUS.ACTIVE],
      );
      const newBalance = parseFloat(wallets[0].balance) + pack.credit_amount;

      await conn.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [newBalance, userId]);
      const [result] = await conn.query<any>(
        `UPDATE wallet_transactions SET status = 'completed', balance_after = ?, amount = ?
         WHERE user_id = ? AND payment_id = ? AND status = 'pending'`,
        [newBalance, pack.credit_amount, userId, paymentId],
      );

      await conn.commit();

      const transactionId = result.insertId;
      const referral = await this.referrals.getReferralByReferredUser(userId);
      if (referral) {
        await this.referrals.processCommission(referral.id, transactionId, pack.pay_amount);
      }

      return {
        success: true,
        data: {
          balance: newBalance,
          pay_amount: pack.pay_amount,
          credit_amount: pack.credit_amount,
          bonus_amount: pack.bonus_amount,
        },
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  hasFreeCallAvailable(userId: number): Promise<boolean> {
    return this.freeCall.isAvailable(userId);
  }

  getFreeCallMaxSeconds() {
    return FREE_CALL_MAX_SECONDS;
  }
}
