import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { REFERRAL_CONFIG, REFERRAL_CODE_LENGTH } from '../common/constants/referral.constants';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class ReferralsService {
  constructor(private db: DatabaseService) {}

  async generateReferralCode(userId: number): Promise<string> {
    const existing = await this.db.query<any[]>(
      `SELECT referral_code FROM referrals WHERE referrer_id = ?`,
      [userId],
    );

    if (existing.length > 0) {
      return existing[0].referral_code;
    }

    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = this._generateRandomCode();
      const conflict = await this.db.query<any[]>(
        `SELECT id FROM referrals WHERE referral_code = ?`,
        [code],
      );
      if (conflict.length === 0) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new BadRequestException('Failed to generate unique referral code');
    }

    await this.db.query(
      `INSERT INTO referrals (referrer_id, referral_code) VALUES (?, ?)`,
      [userId, code],
    );

    return code;
  }

  async validateReferralCode(code: string): Promise<number | null> {
    const result = await this.db.query<any[]>(
      `SELECT referrer_id FROM referrals WHERE referral_code = ?`,
      [code],
    );

    if (result.length === 0) return null;
    return result[0].referrer_id;
  }

  async createReferral(referrerId: number, referredUserId: number, code: string): Promise<void> {
    await this.db.query(
      `INSERT INTO referrals (referrer_id, referred_user_id, referral_code) VALUES (?, ?, ?)`,
      [referrerId, referredUserId, code],
    );
  }

  async processCommission(
    referralId: number,
    rechargeId: number,
    rechargeAmount: number,
  ): Promise<void> {
    const commissionAmount = (rechargeAmount * REFERRAL_CONFIG.COMMISSION_PERCENT) / 100;

    await this.db.query(
      `INSERT INTO referral_history (referral_id, recharge_id, recharge_amount, commission_amount, commission_percent)
       VALUES (?, ?, ?, ?, ?)`,
      [referralId, rechargeId, rechargeAmount, commissionAmount, REFERRAL_CONFIG.COMMISSION_PERCENT],
    );

    await this.db.query(
      `UPDATE referrals 
       SET total_recharge_amount = total_recharge_amount + ?,
           total_commission_earned = total_commission_earned + ?
       WHERE id = ?`,
      [rechargeAmount, commissionAmount, referralId],
    );

    const referrer = await this.db.query<any[]>(
      `SELECT referrer_id FROM referrals WHERE id = ?`,
      [referralId],
    );

    if (referrer.length > 0) {
      await this.db.query(
        `UPDATE wallets SET balance = balance + ? WHERE user_id = ?`,
        [commissionAmount, referrer[0].referrer_id],
      );
    }
  }

  async getReferralByReferredUser(userId: number): Promise<any | null> {
    const result = await this.db.query<any[]>(
      `SELECT * FROM referrals WHERE referred_user_id = ?`,
      [userId],
    );
    return result.length > 0 ? result[0] : null;
  }

  async getReferralStats(userId: number): Promise<any> {
    const stats = await this.db.query<any[]>(
      `SELECT 
        r.referral_code,
        COUNT(DISTINCT r.referred_user_id) as total_referred_boys,
        COALESCE(r.total_recharge_amount, 0) as total_recharge_amount,
        COALESCE(r.total_commission_earned, 0) as total_commission_earned
       FROM referrals r
       WHERE r.referrer_id = ?
       GROUP BY r.id`,
      [userId],
    );

    if (stats.length === 0) {
      const code = await this.generateReferralCode(userId);
      return {
        referral_code: code,
        total_referred_boys: 0,
        total_recharge_amount: 0,
        total_commission_earned: 0,
      };
    }

    return stats[0];
  }

  async getReferralHistory(userId: number): Promise<any[]> {
    const history = await this.db.query<any[]>(
      `SELECT 
        rh.recharge_amount,
        rh.commission_amount,
        rh.commission_percent,
        rh.created_at,
        u.name as referred_boy_name
       FROM referral_history rh
       JOIN referrals r ON rh.referral_id = r.id
       JOIN users u ON r.referred_user_id = u.id
       WHERE r.referrer_id = ?
       ORDER BY rh.created_at DESC`,
      [userId],
    );

    return history;
  }

  private _generateRandomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
