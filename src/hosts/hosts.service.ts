import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OnlineUserManagerService } from '../socket/online-user-manager.service';
import {
  creatorEarningFromBoyRate,
  normalizeStoredBoyRate,
} from '../common/utils/creator-rate.util';
import { withCreatorTierFields } from '../common/utils/host-tier.util';
import {
  defaultGirlAvatarUrl,
  normalizeGirlAvatarUrl,
} from '../common/utils/avatar.util';
import { RECORD_STATUS } from '../common/constants/record-status';

function withHostAvatar(host: Record<string, unknown>, presence?: OnlineUserManagerService) {
  const boyRate = normalizeStoredBoyRate(host.rate_per_minute);
  const earningRate = creatorEarningFromBoyRate(boyRate);
  const hostId = Number(host.id);
  const hostStatus = String(host.host_status ?? 'offline');
  const inCall = presence?.isUserInCall(hostId) ?? false;
  return withCreatorTierFields({
    ...host,
    rate_per_minute: boyRate,
    creator_earning_rate: earningRate,
    avatar_url:
      normalizeGirlAvatarUrl(host.avatar_url as string) ?? defaultGirlAvatarUrl(),
    is_busy: hostStatus === 'busy' || inCall,
  });
}

@Injectable()
export class HostsService {
  constructor(
    private db: DatabaseService,
    private presence: OnlineUserManagerService,
  ) {}

  async browse(query: any) {
    const { language_id, search, page = 1, limit = 20 } = query;
    const languageId = this.parseLanguageId(language_id);

    let sql = `
      SELECT u.id, u.name, u.age, u.avatar_url, u.is_online, u.about,
             fh.rate_per_minute, fh.rating, fh.total_calls, fh.is_featured, fh.host_status,
             fh.total_duration_seconds
      FROM users u
      JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
      WHERE u.role = 'female' AND u.status = ?
    `;
    const params: any[] = [RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE];

    if (languageId) {
      sql += this.languageFilterSql();
      params.push(languageId, RECORD_STATUS.ACTIVE);
    }
    if (search) {
      sql += ` AND u.name LIKE ?`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY u.is_online DESC, fh.is_featured DESC, fh.total_calls DESC LIMIT ? OFFSET ?`;
    const limitNum = parseInt(String(limit), 10);
    const offsetNum = (parseInt(String(page), 10) - 1) * limitNum;
    params.push(limitNum, offsetNum);

    const hosts = await this.db.query(sql, params);
    return { success: true, data: hosts.map((h: any) => withHostAvatar(h, this.presence)) };
  }

  async getOnline(languageId?: number) {
    await this.presence.reconcileInCallState(this.db);
    let sql = `
      SELECT u.id, u.name, u.age, u.avatar_url, u.is_online, u.about,
             fh.rate_per_minute, fh.rating, fh.total_calls, fh.is_featured, fh.host_status,
             fh.total_duration_seconds
      FROM users u JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
      WHERE u.role = 'female' AND u.status = ? AND u.is_online = 1`;
    const params: any[] = [RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE];
    if (languageId) {
      sql += this.languageFilterSql();
      params.push(languageId, RECORD_STATUS.ACTIVE);
    }
    sql += ` ORDER BY fh.is_featured DESC, fh.total_calls DESC LIMIT 20`;
    const hosts = await this.db.query(sql, params);
    return { success: true, data: hosts.map((h: any) => withHostAvatar(h, this.presence)) };
  }

  async getFeatured(languageId?: number) {
    let sql = `
      SELECT u.id, u.name, u.age, u.avatar_url, fh.rate_per_minute, fh.rating,
             fh.total_calls, u.is_online, fh.host_status, fh.is_featured, fh.total_duration_seconds
      FROM users u JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
      WHERE u.role = 'female' AND u.status = ? AND fh.is_featured = 1`;
    const params: any[] = [RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE];
    if (languageId) {
      sql += this.languageFilterSql();
      params.push(languageId, RECORD_STATUS.ACTIVE);
    }
    sql += ` ORDER BY u.is_online DESC LIMIT 10`;
    const hosts = await this.db.query(sql, params);
    return { success: true, data: hosts.map((h: any) => withHostAvatar(h, this.presence)) };
  }

  async getFavorites(userId: number, languageId?: number) {
    let sql = `
      SELECT u.id, u.name, u.age, u.avatar_url, u.is_online, u.about,
             fh.rate_per_minute, fh.rating, fh.total_calls, fh.is_featured, fh.total_duration_seconds
      FROM favorites f
      JOIN users u ON u.id = f.host_id AND u.status = ?
      JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
      WHERE f.user_id = ? AND f.status = ? AND u.role = 'female'`;
    const params: any[] = [RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE, userId, RECORD_STATUS.ACTIVE];
    if (languageId) {
      sql += this.languageFilterSql();
      params.push(languageId, RECORD_STATUS.ACTIVE);
    }
    sql += ` ORDER BY u.is_online DESC`;
    const hosts = await this.db.query(sql, params);
    return { success: true, data: hosts.map((h: any) => withHostAvatar(h, this.presence)) };
  }

  async getById(id: number) {
    const hosts = await this.db.query<any[]>(
      `SELECT u.id, u.name, u.age, u.avatar_url, u.about, u.is_online,
              fh.rate_per_minute, fh.rating, fh.total_calls, fh.total_duration_seconds,
              fh.host_status, fh.is_featured
       FROM users u JOIN female_hosts fh ON fh.user_id = u.id AND fh.status = ?
       WHERE u.id = ? AND u.role = 'female' AND u.status = ?`,
      [RECORD_STATUS.ACTIVE, id, RECORD_STATUS.ACTIVE],
    );
    if (!hosts.length) return { success: false, message: 'Host not found' };

    const langs = await this.db.query(
      `SELECT l.id, l.name, l.code FROM user_languages ul
       JOIN languages l ON l.id = ul.language_id AND l.status = ?
       WHERE ul.user_id = ? AND ul.status = ?`,
      [RECORD_STATUS.ACTIVE, id, RECORD_STATUS.ACTIVE],
    );

    return {
      success: true,
      data: { ...withHostAvatar(hosts[0], this.presence), languages: langs },
    };
  }

  async addFavorite(userId: number, hostId: number) {
    await this.db.query(
      `INSERT INTO favorites (user_id, host_id, status) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?`,
      [userId, hostId, RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE],
    );
    return { success: true, message: 'Added to favorites' };
  }

  async removeFavorite(userId: number, hostId: number) {
    await this.db.query(
      'UPDATE favorites SET status = ? WHERE user_id = ? AND host_id = ?',
      [RECORD_STATUS.INACTIVE, userId, hostId],
    );
    return { success: true, message: 'Removed from favorites' };
  }

  private parseLanguageId(value: unknown): number | undefined {
    const id = parseInt(String(value ?? ''), 10);
    return Number.isFinite(id) && id > 0 ? id : undefined;
  }

  private languageFilterSql() {
    return ` AND u.id IN (
      SELECT user_id FROM user_languages
      WHERE language_id = ? AND status = ?
    )`;
  }
}
