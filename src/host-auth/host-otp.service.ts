import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { HostAccessKeyService } from '../common/services/host-access-key.service';
import { RECORD_STATUS } from '../common/constants/record-status';
import { VerifyHostOtpDto } from './dto/host-auth.dto';

@Injectable()
export class HostOtpService {
  private readonly logger = new Logger(HostOtpService.name);

  constructor(
    private db: DatabaseService,
    private auth: AuthService,
    private users: UsersService,
    private hostAccessKey: HostAccessKeyService,
    private config: ConfigService,
  ) {}

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    throw new BadRequestException('Enter valid 10-digit mobile number');
  }

  async sendOtp(phone: string) {
    const normalized = this.normalizePhone(phone);

    const users = await this.db.query<any[]>(
      `SELECT u.id FROM users u
       JOIN female_hosts fh ON fh.user_id = u.id
       WHERE u.phone = ? AND u.role = 'female' AND u.status = ?`,
      [normalized, RECORD_STATUS.ACTIVE],
    );

    if (!users.length) {
      throw new BadRequestException('No host account found for this mobile number');
    }

    const otp = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.db.query(
      `INSERT INTO host_otp_codes (phone, otp, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE otp = VALUES(otp), expires_at = VALUES(expires_at), attempts = 0`,
      [normalized, otp, expiresAt],
    );

    const isDev = this.config.get('NODE_ENV') !== 'production';
    if (isDev) {
      this.logger.log(`[DEV] Host OTP for ${normalized}: ${otp}`);
    }
    // TODO: integrate SMS provider (MSG91 / Twilio) in production

    return {
      success: true,
      message: 'OTP sent to your mobile number',
      data: {
        phone: normalized,
        expires_in_seconds: 300,
        ...(isDev ? { dev_otp: otp } : {}),
      },
    };
  }

  async verifyOtp(dto: VerifyHostOtpDto) {
    const normalized = this.normalizePhone(dto.phone);
    const otp = dto.otp.trim();

    const rows = await this.db.query<any[]>(
      'SELECT * FROM host_otp_codes WHERE phone = ?',
      [normalized],
    );
    const record = rows[0];

    if (!record || record.otp !== otp) {
      if (record) {
        await this.db.query('UPDATE host_otp_codes SET attempts = attempts + 1 WHERE phone = ?', [
          normalized,
        ]);
      }
      throw new UnauthorizedException('Invalid OTP');
    }

    if (new Date(record.expires_at) < new Date()) {
      throw new UnauthorizedException('OTP has expired');
    }

    const users = await this.db.query<any[]>(
      `SELECT u.* FROM users u
       WHERE u.phone = ? AND u.role = 'female' AND u.status = ?`,
      [normalized, RECORD_STATUS.ACTIVE],
    );

    if (!users.length) {
      throw new UnauthorizedException('Host account not found');
    }

    const user = users[0];

    await this.db.query('DELETE FROM host_otp_codes WHERE phone = ?', [normalized]);

    if (dto.device_id || dto.fcm_token) {
      await this.db.query('UPDATE users SET device_id = ?, fcm_token = ? WHERE id = ?', [
        dto.device_id || user.device_id,
        dto.fcm_token || user.fcm_token,
        user.id,
      ]);
    }

    const tokens = this.auth.generateTokens({
      id: user.id,
      phone: user.phone,
      role: user.role,
    });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token, device_id, expires_at, status) VALUES (?, ?, ?, ?, ?)',
      [user.id, tokens.refreshToken, dto.device_id || null, expiresAt, RECORD_STATUS.ACTIVE],
    );

    const accessKeyData = await this.hostAccessKey.issueAccessKey(user.id);
    const profileResult = await this.users.getProfile(user.id);
    const profile = profileResult.data;

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          phone: user.phone,
          role: user.role,
          name: user.name,
          username: user.username,
        },
        profile,
        accessKey: accessKeyData.accessKey,
        accessKeyExpiresAt: accessKeyData.expiresAt,
        profileVersion: accessKeyData.profileVersion,
        ...tokens,
      },
    };
  }
}
