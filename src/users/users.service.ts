import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersService {
  constructor(private db: DatabaseService) {}

  async getProfile(userId: number) {
    const users = await this.db.query<any[]>(
      `SELECT u.id, u.phone, u.username, u.role, u.name, u.email, u.avatar_url, u.age, u.about, u.is_online,
              w.balance, fh.rate_per_minute, fh.kyc_status, fh.rating, fh.total_calls
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       LEFT JOIN female_hosts fh ON fh.user_id = u.id
       WHERE u.id = ?`,
      [userId],
    );

    const langs = await this.db.query<any[]>(
      `SELECT l.id, l.name, l.code FROM user_languages ul
       JOIN languages l ON l.id = ul.language_id WHERE ul.user_id = ?`,
      [userId],
    );

    return { success: true, data: { ...users[0], languages: langs } };
  }

  async updateProfile(userId: number, body: any) {
    const { name, email, age, about, avatar_url } = body;
    await this.db.query(
      'UPDATE users SET name = ?, email = ?, age = ?, about = ?, avatar_url = ? WHERE id = ?',
      [name, email, age, about, avatar_url, userId],
    );
    return { success: true, message: 'Profile updated' };
  }

  async updateLanguages(userId: number, languageIds: number[]) {
    const pool = this.db.getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM user_languages WHERE user_id = ?', [userId]);
      for (const langId of languageIds) {
        await conn.query('INSERT INTO user_languages (user_id, language_id) VALUES (?, ?)', [
          userId,
          langId,
        ]);
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
