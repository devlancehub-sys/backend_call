import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { CreateHostDto, HostLoginDto } from './dto/host-auth.dto';

@Injectable()
export class HostAuthService {
  constructor(
    private db: DatabaseService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: HostLoginDto) {
    const rows = await this.db.query<any[]>(
      `SELECT u.* FROM users u
       WHERE u.username = ? AND u.role = 'female' AND u.is_active = 1`,
      [dto.username.trim().toLowerCase()],
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

    const tokens = this.generateTokens(user);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token, device_id, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, tokens.refreshToken, dto.device_id || null, expiresAt],
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

    const phone =
      dto.phone?.trim() ||
      `9${Date.now().toString().slice(-9)}`;

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
        `INSERT INTO users (phone, role, name, username, password_hash, is_active)
         VALUES (?, 'female', ?, ?, ?, 1)`,
        [phone, dto.name.trim(), username, passwordHash],
      );

      const userId = result.insertId;
      await conn.query('INSERT INTO wallets (user_id, balance) VALUES (?, 0)', [userId]);

      const rate = this.config.get('DEFAULT_HOST_RATE', 25);
      await conn.query(
        `INSERT INTO female_hosts (user_id, rate_per_minute, kyc_status) VALUES (?, ?, 'approved')`,
        [userId, rate],
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

  private generateTokens(user: { id: number; phone: string; role: string }) {
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
}
