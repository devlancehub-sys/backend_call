import { Injectable, Logger, UnauthorizedException, BadRequestException, InternalServerErrorException, ForbiddenException, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { QuickLoginDto } from './dto/auth.dto';
import { RECORD_STATUS } from '../common/constants/record-status';
import { FreeCallService } from '../wallet/free-call.service';
import { ReferralsService } from '../referrals/referrals.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private db: DatabaseService,
    private jwt: JwtService,
    private config: ConfigService,
    private freeCall: FreeCallService,
    private referrals: ReferralsService,
  ) {}

  /** Boys quick login — name + device_id only, no OTP */
  async quickLogin(dto: QuickLoginDto) {
    const name = dto.name.trim();
    const deviceId = dto.device_id.trim();
    if (!name || name.length < 2) {
      throw new BadRequestException('Enter a valid name');
    }
    if (!deviceId) {
      throw new BadRequestException('device_id is required');
    }

    try {
      const rows = await this.db.query<any[]>(
        `SELECT id, phone, role, name, fcm_token, status FROM users
         WHERE device_id = ? AND role = ? LIMIT 1`,
        [deviceId, 'male'],
      );

      let user: { id: number; phone: string; role: string; name: string };

      if (rows.length) {
        const existing = rows[0];
        if (existing.status === RECORD_STATUS.DISABLED) {
          throw new ForbiddenException('Account is disabled');
        }

        await this.db.query(
          'UPDATE users SET name = ?, fcm_token = ?, status = ? WHERE id = ?',
          [name, dto.fcm_token || existing.fcm_token, RECORD_STATUS.ACTIVE, existing.id],
        );

        const wallets = await this.db.query<any[]>(
          'SELECT id FROM wallets WHERE user_id = ? AND status = ? LIMIT 1',
          [existing.id, RECORD_STATUS.ACTIVE],
        );
        if (!wallets.length) {
          await this.db.query(
            'INSERT INTO wallets (user_id, balance, status) VALUES (?, 0, ?)',
            [existing.id, RECORD_STATUS.ACTIVE],
          );
        }

        user = {
          id: existing.id,
          phone: existing.phone,
          role: existing.role,
          name,
        };
      } else {
        let referrerId: number | null = null;

        if (dto.referral_code) {
          referrerId = await this.referrals.validateReferralCode(dto.referral_code);
          if (!referrerId) {
            throw new BadRequestException('Invalid referral code');
          }
        }

        const phone = `9${Date.now()}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 15);
        const result = await this.db.query<any>(
          `INSERT INTO users (phone, role, name, device_id, fcm_token, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [phone, 'male', name, deviceId, dto.fcm_token || null, RECORD_STATUS.ACTIVE],
        );
        const userId = result.insertId;
        await this.db.query(
          'INSERT INTO wallets (user_id, balance, status) VALUES (?, 0, ?)',
          [userId, RECORD_STATUS.ACTIVE],
        );

        if (referrerId && dto.referral_code) {
          await this.referrals.createReferral(referrerId, userId, dto.referral_code);
        }

        user = { id: userId, phone, role: 'male', name };
      }

      const tokens = this.generateTokens(user);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await this.db.query(
        `UPDATE refresh_tokens SET status = ? WHERE user_id = ? AND device_id = ?`,
        [RECORD_STATUS.INACTIVE, user.id, deviceId],
      );
      await this.db.query(
        `INSERT INTO refresh_tokens (user_id, token, device_id, expires_at, status)
         VALUES (?, ?, ?, ?, ?)`,
        [user.id, tokens.refreshToken, deviceId, expiresAt, RECORD_STATUS.ACTIVE],
      );

      const freeCallAvailable = await this.freeCall.isAvailable(user.id);

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            phone: user.phone,
            role: user.role,
            name: user.name,
            free_call_available: freeCallAvailable,
            free_call_minutes: freeCallAvailable ? 1 : 0,
          },
          ...tokens,
        },
      };
    } catch (err) {
      this.logger.error(`quickLogin failed: ${(err as Error)?.message || err}`);
      if (err instanceof HttpException) throw err;
      throw new InternalServerErrorException('Login failed. Please try again.');
    }
  }

  generateTokens(user: { id: number; phone: string; role: string }) {
    const payload = { id: user.id, phone: user.phone, role: user.role };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    try {
      const decoded = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      }) as any;

      const rows = await this.db.query<any[]>(
        'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW() AND status = ?',
        [refreshToken, RECORD_STATUS.ACTIVE],
      );
      if (!rows.length) throw new UnauthorizedException('Invalid refresh token');

      const users = await this.db.query<any[]>(
        'SELECT * FROM users WHERE id = ? AND status = ?',
        [decoded.id, RECORD_STATUS.ACTIVE],
      );
      if (!users.length) throw new UnauthorizedException('Account is not active');

      const tokens = this.generateTokens(users[0]);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await this.db.query('UPDATE refresh_tokens SET token = ?, expires_at = ? WHERE id = ?', [
        tokens.refreshToken,
        expiresAt,
        rows[0].id,
      ]);

      return { success: true, data: tokens };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.db.query(
        'UPDATE refresh_tokens SET status = ? WHERE token = ?',
        [RECORD_STATUS.INACTIVE, refreshToken],
      );
    }
    return { success: true, message: 'Logged out' };
  }
}
