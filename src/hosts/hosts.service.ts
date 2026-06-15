import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { enrichHostRates } from '../common/utils/rate-tier.util';
import {
  defaultGirlAvatarUrl,
  normalizeGirlAvatarUrl,
} from '../common/utils/avatar.util';

function withHostAvatar(host: Record<string, unknown>) {
  const enriched = enrichHostRates(host);
  return {
    ...enriched,
    avatar_url:
      normalizeGirlAvatarUrl(enriched.avatar_url as string) ?? defaultGirlAvatarUrl(),
  };
}

@Injectable()
export class HostsService {
  constructor(private db: DatabaseService) {}

  async browse(query: any) {
    const { language_id, search, page = 1, limit = 20 } = query;

    let sql = `
      SELECT u.id, u.name, u.age, u.avatar_url, u.is_online, u.about,
             fh.rate_per_minute, fh.rating, fh.total_calls, fh.is_featured
      FROM users u
      JOIN female_hosts fh ON fh.user_id = u.id
      WHERE u.role = 'female' AND u.is_active = 1
    `;
    const params: any[] = [];

    if (language_id) {
      sql += ` AND u.id IN (SELECT user_id FROM user_languages WHERE language_id = ?)`;
      params.push(language_id);
    }
    if (search) {
      sql += ` AND u.name LIKE ?`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY u.is_online DESC, fh.is_featured DESC, fh.rating DESC LIMIT ? OFFSET ?`;
    const limitNum = parseInt(String(limit), 10);
    const offsetNum = (parseInt(String(page), 10) - 1) * limitNum;
    params.push(limitNum, offsetNum);

    const hosts = await this.db.query(sql, params);
    return { success: true, data: hosts.map((h: any) => withHostAvatar(h)) };
  }

  async getOnline() {
    const hosts = await this.db.query(
      `SELECT u.id, u.name, u.age, u.avatar_url, u.is_online, u.about,
              fh.rate_per_minute, fh.rating, fh.total_calls, fh.is_featured
       FROM users u JOIN female_hosts fh ON fh.user_id = u.id
       WHERE u.role = 'female' AND u.is_active = 1 AND u.is_online = 1
       ORDER BY fh.rating DESC LIMIT 20`,
    );
    return { success: true, data: hosts.map((h: any) => withHostAvatar(h)) };
  }

  async getFeatured() {
    const hosts = await this.db.query(
      `SELECT u.id, u.name, u.age, u.avatar_url, fh.rate_per_minute, fh.rating,
              fh.total_calls, u.is_online
       FROM users u JOIN female_hosts fh ON fh.user_id = u.id
       WHERE u.role = 'female' AND fh.is_featured = 1
       ORDER BY u.is_online DESC LIMIT 10`,
    );
    return { success: true, data: hosts.map((h: any) => withHostAvatar(h)) };
  }

  async getFavorites(userId: number) {
    const hosts = await this.db.query(
      `SELECT u.id, u.name, u.age, u.avatar_url, u.is_online, u.about,
              fh.rate_per_minute, fh.rating, fh.total_calls, fh.is_featured
       FROM favorites f
       JOIN users u ON u.id = f.host_id
       JOIN female_hosts fh ON fh.user_id = u.id
       WHERE f.user_id = ? AND u.role = 'female'
       ORDER BY u.is_online DESC`,
      [userId],
    );
    return { success: true, data: hosts.map((h: any) => withHostAvatar(h)) };
  }

  async getById(id: number) {
    const hosts = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.age, u.avatar_url, u.about, u.is_online,
              fh.rate_per_minute, fh.rating, fh.total_calls, fh.total_duration_seconds
       FROM users u JOIN female_hosts fh ON fh.user_id = u.id
       WHERE u.id = ? AND u.role = 'female'`,
      [id],
    );
    if (!hosts.length) return { success: false, message: 'Host not found' };

    const langs = await this.db.query(
      `SELECT l.id, l.name, l.code FROM user_languages ul
       JOIN languages l ON l.id = ul.language_id WHERE ul.user_id = ?`,
      [id],
    );

    return {
      success: true,
      data: { ...withHostAvatar(hosts[0]), languages: langs },
    };
  }

  async addFavorite(userId: number, hostId: number) {
    await this.db.query('INSERT IGNORE INTO favorites (user_id, host_id) VALUES (?, ?)', [
      userId,
      hostId,
    ]);
    return { success: true, message: 'Added to favorites' };
  }

  async removeFavorite(userId: number, hostId: number) {
    await this.db.query('DELETE FROM favorites WHERE user_id = ? AND host_id = ?', [userId, hostId]);
    return { success: true, message: 'Removed from favorites' };
  }
}
