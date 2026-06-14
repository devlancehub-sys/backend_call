import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { VerifyOtpDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private db: DatabaseService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  sendOtp(phone: string) {
    return { success: true, message: 'OTP sent', otp: '123456' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    if (dto.otp !== '123456') {
      throw new UnauthorizedException('Invalid OTP');
    }

    const pool = this.db.getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();
      const [existing] = await conn.query<any[]>('SELECT * FROM users WHERE phone = ?', [dto.phone]);
      let user: any;

      if (!existing.length) {
        const [result] = await conn.query<any>(
          'INSERT INTO users (phone, role, device_id, fcm_token) VALUES (?, ?, ?, ?)',
          [dto.phone, dto.role, dto.device_id || null, dto.fcm_token || null],
        );
        user = { id: result.insertId, phone: dto.phone, role: dto.role, name: null };

        await conn.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [user.id]);

        if (dto.role === 'female') {
          const rate = this.config.get('DEFAULT_HOST_RATE', 25);
          await conn.query('INSERT INTO female_hosts (user_id, rate_per_minute) VALUES (?, ?)', [
            user.id,
            rate,
          ]);
        }
      } else {
        user = existing[0];
        await conn.query('UPDATE users SET device_id = ?, fcm_token = ? WHERE id = ?', [
          dto.device_id || user.device_id,
          dto.fcm_token || user.fcm_token,
          user.id,
        ]);
      }

      const tokens = this.generateTokens(user);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await conn.query(
        'INSERT INTO refresh_tokens (user_id, token, device_id, expires_at) VALUES (?, ?, ?, ?)',
        [user.id, tokens.refreshToken, dto.device_id || null, expiresAt],
      );

      await conn.commit();

      return {
        success: true,
        data: {
          user: { id: user.id, phone: user.phone, role: user.role, name: user.name },
          ...tokens,
        },
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
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
        'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()',
        [refreshToken],
      );
      if (!rows.length) throw new UnauthorizedException('Invalid refresh token');

      const users = await this.db.query<any[]>('SELECT * FROM users WHERE id = ?', [decoded.id]);
      return { success: true, data: this.generateTokens(users[0]) };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.db.query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);
    }
    return { success: true, message: 'Logged out' };
  }
}
