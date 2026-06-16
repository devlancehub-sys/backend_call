import { Injectable, Logger, UnauthorizedException, BadRequestException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { QuickLoginDto } from './dto/auth.dto';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private db: DatabaseService,
    private jwt: JwtService,
    private config: ConfigService,
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

    const pool = this.db.getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [rows] = await conn.query<any[]>(
        'SELECT * FROM users WHERE device_id = ? AND role = ?',
        [deviceId, 'male'],
      );
      const existing = Array.isArray(rows) ? rows : [];

      let user: any;

      if (existing.length) {
        user = existing[0];
        if (user.status === RECORD_STATUS.DISABLED) {
          throw new ForbiddenException('Account is disabled');
        }
        await conn.query(
          'UPDATE users SET name = ?, fcm_token = ?, status = ? WHERE id = ?',
          [name, dto.fcm_token || user.fcm_token, RECORD_STATUS.ACTIVE, user.id],
        );
        user.name = name;

        const [walletRows] = await conn.query<any[]>(
          'SELECT id FROM wallets WHERE user_id = ? LIMIT 1',
          [user.id],
        );
        if (!Array.isArray(walletRows) || walletRows.length === 0) {
          await conn.query('INSERT INTO wallets (user_id, balance, status) VALUES (?, 0, ?)', [
            user.id,
            RECORD_STATUS.ACTIVE,
          ]);
        }
      } else {
        const phone = `9${Date.now()}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 15);
        const [result] = await conn.query<any>(
          'INSERT INTO users (phone, role, name, device_id, fcm_token, status) VALUES (?, ?, ?, ?, ?, ?)',
          [phone, 'male', name, deviceId, dto.fcm_token || null, RECORD_STATUS.ACTIVE],
        );
        user = { id: result.insertId, phone, role: 'male', name };
        await conn.query('INSERT INTO wallets (user_id, balance, status) VALUES (?, 0, ?)', [
          user.id,
          RECORD_STATUS.ACTIVE,
        ]);
      }

      const tokens = this.generateTokens(user);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await conn.query(
        'INSERT INTO refresh_tokens (user_id, token, device_id, expires_at, status) VALUES (?, ?, ?, ?, ?)',
        [user.id, tokens.refreshToken, deviceId, expiresAt, RECORD_STATUS.ACTIVE],
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
      this.logger.error(`quickLogin failed: ${(err as Error)?.message || err}`);
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException('Login failed. Please try again.');
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
        'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW() AND status = ?',
        [refreshToken, RECORD_STATUS.ACTIVE],
      );
      if (!rows.length) throw new UnauthorizedException('Invalid refresh token');

      const users = await this.db.query<any[]>(
        'SELECT * FROM users WHERE id = ? AND status = ?',
        [decoded.id, RECORD_STATUS.ACTIVE],
      );
      if (!users.length) throw new UnauthorizedException('Account is not active');
      return { success: true, data: this.generateTokens(users[0]) };
    } catch {
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
