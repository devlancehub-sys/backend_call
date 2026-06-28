import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  defaultGirlAvatarUrl,
  normalizeGirlAvatarUrl,
} from '../common/utils/avatar.util';
import { buildHostTierProfile } from '../common/utils/host-tier.util';
import { RECORD_STATUS } from '../common/constants/record-status';
import { SocketGateway } from '../socket/socket.gateway';
import { UpdateProfileDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private db: DatabaseService,
    private socket: SocketGateway,
  ) {}

  async getProfile(userId: number) {
    const users = await this.db.query<any[]>(
      `SELECT u.id, u.phone, u.username, u.role, u.name, u.email, u.avatar_url, u.age, u.about, u.is_online,
              w.balance, fh.rate_per_minute, fh.kyc_status, fh.rating, fh.total_calls, fh.total_duration_seconds
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id AND w.status = ?
       LEFT JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
       WHERE u.id = ? AND u.status = ?`,
      [RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE, userId, RECORD_STATUS.ACTIVE],
    );

    const langs = await this.db.query<any[]>(
      `SELECT l.id, l.name, l.code FROM user_languages ul
       JOIN languages l ON l.id = ul.language_id AND l.status = ?
       WHERE ul.user_id = ? AND ul.status = ?`,
      [RECORD_STATUS.ACTIVE, userId, RECORD_STATUS.ACTIVE],
    );

    const profile = { ...users[0], languages: langs };
    if (profile.role === 'female') {
      profile.avatar_url =
        normalizeGirlAvatarUrl(profile.avatar_url) ?? defaultGirlAvatarUrl();
      const tierProfile = buildHostTierProfile(Number(profile.total_duration_seconds ?? 0));
      Object.assign(profile, tierProfile);
    }

    return { success: true, data: profile };
  }

  async updateProfile(userId: number, body: UpdateProfileDto) {
    const users = await this.db.query<any[]>('SELECT role FROM users WHERE id = ?', [
      userId,
    ]);
    const role = users[0]?.role as string | undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      fields.push('name = ?');
      values.push(body.name);
    }
    if (body.email !== undefined) {
      fields.push('email = ?');
      values.push(body.email);
    }
    if (body.age !== undefined) {
      fields.push('age = ?');
      values.push(body.age);
    }
    if (body.about !== undefined) {
      fields.push('about = ?');
      values.push(body.about);
    }
    if (body.avatar_url !== undefined) {
      let storedAvatar = body.avatar_url;
      if (role === 'female') {
        storedAvatar =
          body.avatar_url != null && body.avatar_url !== ''
            ? normalizeGirlAvatarUrl(body.avatar_url) ?? defaultGirlAvatarUrl()
            : body.avatar_url;
      }
      fields.push('avatar_url = ?');
      values.push(storedAvatar);
    }

    if (fields.length) {
      values.push(userId);
      await this.db.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values,
      );
    }

    const profile = await this.getProfile(userId);

    if (role === 'female') {
      const data = profile.data as Record<string, unknown>;
      this.socket.notifyRole('male', 'host_profile_updated', {
        host_id: userId,
        avatar_url: data.avatar_url ?? defaultGirlAvatarUrl(),
        name: data.name ?? null,
      });
    }

    return profile;
  }

  async updateLanguages(userId: number, languageIds: number[]) {
    const pool = this.db.getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE user_languages SET status = ? WHERE user_id = ?', [
        RECORD_STATUS.INACTIVE,
        userId,
      ]);
      for (const langId of languageIds) {
        await conn.query(
          `INSERT INTO user_languages (user_id, language_id, status) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE status = ?`,
          [userId, langId, RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE],
        );
      }
      await conn.commit();
      return { success: true, message: 'Languages updated' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async setOnlineStatus(userId: number, isOnline: boolean) {
    await this.db.query('UPDATE users SET is_online = ?, last_seen_at = NOW() WHERE id = ?', [
      isOnline ? 1 : 0,
      userId,
    ]);
    return { success: true, data: { is_online: isOnline } };
  }

  async updateDevice(userId: number, deviceId: string, fcmToken?: string) {
    const rows = await this.db.query<any[]>('SELECT fcm_token FROM users WHERE id = ?', [userId]);
    const current = rows[0]?.fcm_token;

    await this.db.query('UPDATE users SET device_id = ?, fcm_token = ? WHERE id = ?', [
      deviceId,
      fcmToken ?? current ?? null,
      userId,
    ]);

    return { success: true, message: 'Device updated' };
  }
}
