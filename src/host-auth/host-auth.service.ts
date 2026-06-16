import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import { CreateHostDto, HostLoginDto } from './dto/host-auth.dto';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class HostAuthService {
  private readonly logger = new Logger(HostAuthService.name);

  constructor(
    private db: DatabaseService,
    private auth: AuthService,
    private platformSettings: PlatformSettingsService,
  ) {}

  async login(dto: HostLoginDto) {
    try {
      const rows = await this.db.query<any[]>(
        `SELECT u.* FROM users u
         WHERE u.username = ? AND u.role = 'female' AND u.status = ?`,
        [dto.username.trim().toLowerCase(), RECORD_STATUS.ACTIVE],
      );

      if (!rows.length || !rows[0].password_hash) {
        throw new UnauthorizedException('Invalid username or password');
      }

      const user = rows[0];
      const valid = await bcrypt.compare(dto.password, user.password_hash);
      if (!valid) {
        throw new UnauthorizedException('Invalid username or password');
      }

      if (dto.device_id || dto.fcm_token) {
        await this.db.query('UPDATE users SET device_id = ?, fcm_token = ? WHERE id = ?', [
          dto.device_id || user.device_id,
          dto.fcm_token || user.fcm_token,
          user.id,
        ]);
      }

      const tokens = this.auth.generateTokens({
        id: user.id,
        phone: user.phone ?? `host_${user.id}`,
        role: user.role,
      });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await this.db.query(
        'INSERT INTO refresh_tokens (user_id, token, device_id, expires_at, status) VALUES (?, ?, ?, ?, ?)',
        [user.id, tokens.refreshToken, dto.device_id || null, expiresAt, RECORD_STATUS.ACTIVE],
      );

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
          ...tokens,
        },
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(`host login failed: ${(err as Error)?.message || err}`);
      throw new InternalServerErrorException('Host login failed. Please try again.');
    }
  }

  async createHost(dto: CreateHostDto) {
    const username = dto.username.trim().toLowerCase();
    const existing = await this.db.query<any[]>(
      'SELECT id FROM users WHERE username = ?',
      [username],
    );
    if (existing.length) {
      throw new ConflictException('Username already exists');
    }

    const phone = dto.phone?.trim() || `9${Date.now().toString().slice(-9)}`;

    const phoneCheck = await this.db.query<any[]>(
      'SELECT id FROM users WHERE phone = ?',
      [phone],
    );
    if (phoneCheck.length) {
      throw new ConflictException('Phone number already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const pool = this.db.getPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [result] = await conn.query<any>(
        `INSERT INTO users (phone, role, name, username, password_hash, status)
         VALUES (?, 'female', ?, ?, ?, ?)`,
        [phone, dto.name.trim(), username, passwordHash, RECORD_STATUS.ACTIVE],
      );

      const userId = result.insertId;
      await conn.query('INSERT INTO wallets (user_id, balance, status) VALUES (?, 0, ?)', [
        userId,
        RECORD_STATUS.ACTIVE,
      ]);

      const rate = this.platformSettings.getDefaultHostRate();
      await conn.query(
        `INSERT INTO female_hosts (user_id, rate_per_minute, kyc_status, status) VALUES (?, ?, 'approved', ?)`,
        [userId, rate, RECORD_STATUS.ACTIVE],
      );

      await conn.commit();

      return {
        success: true,
        message: 'Host account created. Share username & password with the host.',
        data: { id: userId, username, name: dto.name, phone },
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
