import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { RECORD_STATUS } from '../common/constants/record-status';
import {
  AssignPromoCodeDto,
  GeneratePromoCodeDto,
  PromoCodeActionDto,
} from './dto/promo-codes.dto';

@Injectable()
export class PromoCodesService {
  private readonly logger = new Logger(PromoCodesService.name);

  constructor(private db: DatabaseService) {}

  private generateCode(): string {
    const segment = randomBytes(3).toString('hex').toUpperCase();
    return `GIRL-${segment}-${randomBytes(2).toString('hex').toUpperCase()}`;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async findPromoRow(code: string) {
    const rows = await this.db.query<any[]>(
      'SELECT * FROM promo_codes WHERE promo_code = ?',
      [this.normalizeCode(code)],
    );
    return rows[0] ?? null;
  }

  /** Promo apply/validate is girls-app only — must be an active female host. */
  private async assertFemaleHost(userId: number) {
    const rows = await this.db.query<any[]>(
      `SELECT u.id FROM users u
       JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
       WHERE u.id = ? AND u.role = 'female' AND u.status = ?`,
      [RECORD_STATUS.ACTIVE, userId, RECORD_STATUS.ACTIVE],
    );
    if (!rows.length) {
      throw new ForbiddenException('Promo codes can only be used in the Girls app');
    }
  }

  private validatePromoForUser(row: any, userId: number, checkOnly: boolean) {
    if (!row) {
      throw new NotFoundException('Promo code not found');
    }

    if (row.is_used) {
      throw new BadRequestException('Promo code has already been used');
    }

    if (new Date(row.expiry_date) < new Date()) {
      throw new BadRequestException('Promo code has expired');
    }

    if (row.user_id == null) {
      throw new BadRequestException('This promo code is not assigned to any host');
    }

    if (row.user_id !== userId) {
      throw new BadRequestException('This promo code is not assigned to your account');
    }

    const bonusAmount = parseFloat(row.discount_value);

    return {
      id: row.id,
      promoCode: row.promo_code,
      bonusAmount,
      expiryDate: row.expiry_date,
      isUsed: !!row.is_used,
      userId: row.user_id,
      valid: true,
      message: checkOnly
        ? 'Promo code is valid'
        : 'Bonus added to your wallet successfully',
    };
  }

  async generate(dto: GeneratePromoCodeDto) {
    const promoCode = this.normalizeCode(dto.promo_code ?? this.generateCode());
    const expiryDate = new Date(dto.expiry_date);

    if (Number.isNaN(expiryDate.getTime())) {
      throw new BadRequestException('Invalid expiry date');
    }

    if (expiryDate <= new Date()) {
      throw new BadRequestException('Expiry date must be in the future');
    }

    const user = await this.db.query<any[]>(
      'SELECT id FROM users WHERE id = ? AND role = ? AND status = ?',
      [dto.user_id, 'female', RECORD_STATUS.ACTIVE],
    );
    if (!user.length) {
      throw new NotFoundException('Female host user not found');
    }

    const existing = await this.findPromoRow(promoCode);
    if (existing) {
      throw new ConflictException('Promo code already exists');
    }

    const [result] = await this.db.getPool().query<any>(
      `INSERT INTO promo_codes (promo_code, user_id, discount_value, expiry_date, is_used)
       VALUES (?, ?, ?, ?, 0)`,
      [promoCode, dto.user_id, dto.bonus_amount, expiryDate],
    );

    this.logger.log(
      `Generated promo code ${promoCode} for host ${dto.user_id} (bonus ₹${dto.bonus_amount})`,
    );

    return {
      success: true,
      message: 'Promo code generated for host',
      data: {
        id: result.insertId,
        promoCode,
        userId: dto.user_id,
        bonusAmount: dto.bonus_amount,
        expiryDate: expiryDate.toISOString(),
        isUsed: false,
      },
    };
  }

  async list() {
    const rows = await this.db.query<any[]>(
      `SELECT pc.id, pc.promo_code, pc.user_id, pc.discount_value, pc.expiry_date,
              pc.is_used, pc.used_at, pc.created_at,
              u.name AS host_name, u.username AS host_username
       FROM promo_codes pc
       LEFT JOIN users u ON u.id = pc.user_id
       ORDER BY pc.created_at DESC
       LIMIT 200`,
    );

    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        promo_code: row.promo_code,
        user_id: row.user_id,
        host_name: row.host_name ?? null,
        host_username: row.host_username ?? null,
        bonus_amount: parseFloat(row.discount_value),
        expiry_date: row.expiry_date,
        is_used: !!row.is_used,
        used_at: row.used_at,
        created_at: row.created_at,
      })),
    };
  }

  async assign(dto: AssignPromoCodeDto) {
    const promoCode = this.normalizeCode(dto.promo_code);

    const user = await this.db.query<any[]>(
      'SELECT id FROM users WHERE id = ? AND role = ?',
      [dto.user_id, 'female'],
    );
    if (!user.length) {
      throw new NotFoundException('Female host user not found');
    }

    const row = await this.findPromoRow(promoCode);
    if (!row) {
      throw new NotFoundException('Promo code not found');
    }

    if (row.is_used) {
      throw new BadRequestException('Cannot assign a used promo code');
    }

    if (row.user_id != null && row.user_id !== dto.user_id) {
      throw new ConflictException('Promo code is already assigned to another user');
    }

    await this.db.query('UPDATE promo_codes SET user_id = ? WHERE id = ?', [
      dto.user_id,
      row.id,
    ]);

    return {
      success: true,
      message: 'Promo code assigned to user',
      data: { promoCode, userId: dto.user_id },
    };
  }

  async validate(userId: number, dto: PromoCodeActionDto) {
    await this.assertFemaleHost(userId);
    const row = await this.findPromoRow(dto.promo_code);
    const result = this.validatePromoForUser(row, userId, true);

    return {
      success: true,
      data: result,
    };
  }

  async apply(userId: number, dto: PromoCodeActionDto) {
    await this.assertFemaleHost(userId);
    const promoCode = this.normalizeCode(dto.promo_code);
    const pool = this.db.getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [rows] = await conn.query<any[]>(
        'SELECT * FROM promo_codes WHERE promo_code = ? FOR UPDATE',
        [promoCode],
      );

      const row = rows[0];
      this.validatePromoForUser(row, userId, false);

      const bonusAmount = parseFloat(row.discount_value);

      await conn.query(
        'UPDATE promo_codes SET is_used = 1, used_at = NOW() WHERE id = ? AND is_used = 0',
        [row.id],
      );

      const [checkRows] = await conn.query<any[]>(
        'SELECT is_used FROM promo_codes WHERE id = ?',
        [row.id],
      );
      if (!checkRows[0]?.is_used) {
        throw new ConflictException('Promo code was already redeemed');
      }

      await conn.query(
        `INSERT INTO promo_code_redemptions (promo_code_id, user_id, promo_code, discount_value)
         VALUES (?, ?, ?, ?)`,
        [row.id, userId, promoCode, bonusAmount],
      );

      const [wallets] = await conn.query<any[]>(
        'SELECT balance FROM wallets WHERE user_id = ? AND status = ? FOR UPDATE',
        [userId, RECORD_STATUS.ACTIVE],
      );
      if (!wallets.length) {
        throw new BadRequestException('Wallet not found for this host');
      }

      const newBalance = parseFloat(wallets[0].balance) + bonusAmount;
      await conn.query(
        'UPDATE wallets SET balance = ? WHERE user_id = ? AND status = ?',
        [newBalance, userId, RECORD_STATUS.ACTIVE],
      );

      await conn.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, balance_after, status, description)
         VALUES (?, 'promo_bonus', ?, ?, 'completed', ?)`,
        [userId, bonusAmount, newBalance, `Promo bonus: ${promoCode}`],
      );

      await conn.commit();

      this.logger.log(
        `Promo code ${promoCode} redeemed by host ${userId} — ₹${bonusAmount} added to wallet`,
      );

      return {
        success: true,
        message: 'Bonus added to your wallet successfully',
        data: {
          promoCode,
          bonusAmount,
          walletBalance: newBalance,
          redeemedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
