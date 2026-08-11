import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import Razorpay from 'razorpay';
import { AppSettingsService } from '../app-config/app-settings.service';
import { DatabaseService } from '../database/database.service';
import {
  paginate,
  paginationOffset,
  PaginatedResult,
} from '../common/dto/pagination.dto';

interface WalletRow extends RowDataPacket {
  balance: number;
}

interface WalletTxRow extends RowDataPacket {
  id: number;
  type: 'credit' | 'debit';
  amount: number;
  description: string | null;
  created_at: Date;
}

interface RechargeRow extends RowDataPacket {
  id: number;
  user_id: number;
  amount_inr: number;
  coins_added: number;
  razorpay_order_id: string | null;
  status: string;
}

@Injectable()
export class WalletService {
  private razorpay: Razorpay | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly settings: AppSettingsService,
  ) {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (keyId && keySecret) {
      this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
  }

  async getBalance(userId: number): Promise<{ balance: number }> {
    const balance = await this.fetchBalance(userId);
    return { balance };
  }

  async fetchBalance(userId: number): Promise<number> {
    const [rows] = await this.db.query<WalletRow[]>(
      'SELECT balance FROM wallets WHERE user_id = ? LIMIT 1',
      [userId],
    );
    return rows[0]?.balance ?? 0;
  }

  async getHistory(
    userId: number,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const offset = paginationOffset(page, limit);

    const [countRows] = await this.db.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM wallet_transactions WHERE user_id = ?',
      [userId],
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await this.db.query<WalletTxRow[]>(
      `SELECT id, type, amount, description, created_at
       FROM wallet_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );

    const data = rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      description: row.description,
      createdAt: row.created_at.toISOString(),
    }));

    return paginate(data, page, limit, total);
  }

  async createRechargeOrder(userId: number, amountInr: number) {
    const coinsAdded = Math.floor(amountInr * this.settings.getCoinsPerInr());
    const amountPaise = Math.round(amountInr * 100);

    const [insertResult] = await this.db.query<ResultSetHeader>(
      `INSERT INTO recharge_history (user_id, amount_inr, coins_added, status)
       VALUES (?, ?, ?, 'pending')`,
      [userId, amountInr, coinsAdded],
    );

    const rechargeId = insertResult.insertId;
    let orderId = `order_stub_${rechargeId}`;

    if (this.razorpay) {
      const order = await this.razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: `recharge_${rechargeId}`,
      });
      orderId = order.id;

      await this.db.query(
        'UPDATE recharge_history SET razorpay_order_id = ? WHERE id = ?',
        [orderId, rechargeId],
      );
    }

    return {
      rechargeId,
      orderId,
      amountInr,
      coinsAdded,
      keyId: this.config.get<string>('RAZORPAY_KEY_ID', ''),
    };
  }

  async verifyRecharge(userId: number, dto: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) {
    const [rows] = await this.db.query<RechargeRow[]>(
      `SELECT id, user_id, amount_inr, coins_added, razorpay_order_id, status
       FROM recharge_history
       WHERE user_id = ? AND razorpay_order_id = ?
       LIMIT 1`,
      [userId, dto.razorpayOrderId],
    );

    const recharge = rows[0];
    if (!recharge) {
      throw new NotFoundException('Recharge order not found');
    }

    if (recharge.status === 'success') {
      return { balance: await this.fetchBalance(userId) };
    }

    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET', '');
    if (secret) {
      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
        .digest('hex');

      if (expected !== dto.razorpaySignature) {
        throw new BadRequestException('Invalid payment signature');
      }
    }

    const connection = await this.db.getPool().getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE recharge_history
         SET status = 'success', razorpay_payment_id = ?
         WHERE id = ? AND status = 'pending'`,
        [dto.razorpayPaymentId, recharge.id],
      );

      await connection.query(
        'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
        [recharge.coins_added, userId],
      );

      await connection.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, description)
         VALUES (?, 'credit', ?, ?)`,
        [
          userId,
          recharge.coins_added,
          `Recharge ₹${recharge.amount_inr}`,
        ],
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return { balance: await this.fetchBalance(userId) };
  }

  async failRecharge(userId: number, razorpayOrderId: string) {
    const [result] = await this.db.query<ResultSetHeader>(
      `UPDATE recharge_history
       SET status = 'failed'
       WHERE user_id = ? AND razorpay_order_id = ? AND status = 'pending'`,
      [userId, razorpayOrderId],
    );

    if (result.affectedRows === 0) {
      throw new NotFoundException('Pending recharge order not found');
    }

    return { status: 'failed' };
  }

  async creditCoins(
    userId: number,
    amount: number,
    description: string,
    referenceType = 'admin',
    referenceId = 0,
  ): Promise<number> {
    const connection = await this.db.getPool().getConnection();
    try {
      await connection.beginTransaction();

      const [walletRows] = await connection.query<WalletRow[]>(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      if (!walletRows[0]) {
        throw new NotFoundException('Wallet not found');
      }

      await connection.query(
        'UPDATE wallets SET balance = balance + ? WHERE user_id = ?',
        [amount, userId],
      );

      await connection.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, description)
         VALUES (?, 'credit', ?, ?)`,
        [userId, amount, description],
      );

      await connection.commit();
      return Number(walletRows[0].balance ?? 0) + amount;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async debitCoins(
    userId: number,
    amount: number,
    description: string,
    referenceType: string,
    referenceId: number,
  ): Promise<number> {
    const connection = await this.db.getPool().getConnection();
    try {
      await connection.beginTransaction();

      const [walletRows] = await connection.query<WalletRow[]>(
        'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [userId],
      );
      const balance = walletRows[0]?.balance ?? 0;

      if (balance < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      await connection.query(
        'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
        [amount, userId],
      );

      await connection.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, description)
         VALUES (?, 'debit', ?, ?)`,
        [userId, amount, description],
      );

      await connection.commit();
      return balance - amount;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
