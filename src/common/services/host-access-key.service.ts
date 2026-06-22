import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../../auth/auth.service';
import { RECORD_STATUS } from '../constants/record-status';

@Injectable()
export class HostAccessKeyService {
  constructor(
    private db: DatabaseService,
    private users: UsersService,
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  private getExpiryDays(): number {
    const days = Number(this.config.get('HOST_ACCESS_KEY_EXPIRES_DAYS', '90'));
    return Number.isFinite(days) && days > 0 ? days : 90;
  }

  private generateKey(): string {
    return `hak_${randomBytes(32).toString('hex')}`;
  }

  async issueAccessKey(userId: number) {
    const accessKey = this.generateKey();
    const expiresAt = new Date(Date.now() + this.getExpiryDays() * 24 * 60 * 60 * 1000);

    const existing = await this.db.query<any[]>(
      'SELECT id, profile_version FROM host_access_keys WHERE user_id = ?',
      [userId],
    );

    let profileVersion = 1;
    if (existing.length) {
      profileVersion = existing[0].profile_version ?? 1;
      await this.db.query(
        `UPDATE host_access_keys
         SET access_key = ?, expires_at = ?, status = ?, updated_at = NOW()
         WHERE user_id = ?`,
        [accessKey, expiresAt, RECORD_STATUS.ACTIVE, userId],
      );
    } else {
      await this.db.query(
        `INSERT INTO host_access_keys (user_id, access_key, expires_at, profile_version, status)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, accessKey, expiresAt, profileVersion, RECORD_STATUS.ACTIVE],
      );
    }

    return {
      accessKey,
      expiresAt: expiresAt.toISOString(),
      profileVersion,
    };
  }

  async invalidateForUser(userId: number) {
    await this.db.query(
      `UPDATE host_access_keys
       SET status = ?, profile_version = profile_version + 1, updated_at = NOW()
       WHERE user_id = ?`,
      [RECORD_STATUS.DISABLED, userId],
    );
  }

  async bumpProfileVersion(userId: number) {
    await this.db.query(
      `UPDATE host_access_keys
       SET profile_version = profile_version + 1, updated_at = NOW()
       WHERE user_id = ?`,
      [userId],
    );
  }

  async verifyAccessKey(accessKey: string, clientProfileVersion?: number) {
    const rows = await this.db.query<any[]>(
      `SELECT hak.*, u.status AS user_status, u.role
       FROM host_access_keys hak
       JOIN users u ON u.id = hak.user_id
       WHERE hak.access_key = ? AND hak.status = ?`,
      [accessKey, RECORD_STATUS.ACTIVE],
    );

    if (!rows.length) {
      throw new UnauthorizedException('Invalid or expired access key');
    }

    const record = rows[0];

    if (record.role !== 'female') {
      throw new UnauthorizedException('Invalid access key');
    }

    if (record.user_status !== RECORD_STATUS.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    if (new Date(record.expires_at) < new Date()) {
      throw new UnauthorizedException('Access key has expired');
    }

    const needsRefresh =
      clientProfileVersion != null && clientProfileVersion < record.profile_version;

    const profileResult = await this.users.getProfile(record.user_id);
    const profile = profileResult.data;

    const tokens = this.auth.generateTokens({
      id: record.user_id,
      phone: profile.phone ?? `host_${record.user_id}`,
      role: 'female',
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at, status) VALUES (?, ?, ?, ?)',
      [record.user_id, tokens.refreshToken, expiresAt, RECORD_STATUS.ACTIVE],
    );

    return {
      success: true,
      data: {
        user: {
          id: profile.id,
          phone: profile.phone,
          role: profile.role,
          name: profile.name,
          username: profile.username,
        },
        profile,
        accessKey,
        accessKeyExpiresAt: new Date(record.expires_at).toISOString(),
        profileVersion: record.profile_version,
        needsRefresh,
        ...tokens,
      },
    };
  }
}
