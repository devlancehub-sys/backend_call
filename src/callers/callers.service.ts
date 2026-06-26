import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OnlineUserManagerService } from '../socket/online-user-manager.service';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class CallersService {
  constructor(
    private db: DatabaseService,
    private presence: OnlineUserManagerService,
  ) {}

  /** Male users list — for girls app (larka list) */
  async browse(limit = 50) {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 50;
    const callers = await this.db.query(
      `SELECT u.id, u.name, u.phone, u.avatar_url, u.age, u.about, u.is_online,
              COALESCE(w.balance, 0) as wallet_balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id AND w.status = ?
       WHERE u.role = 'male' AND u.status = ?
       ORDER BY u.is_online DESC, u.name ASC
       LIMIT ?`,
      [RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE, safeLimit],
    );
    return { success: true, data: callers.map(this.formatCaller) };
  }

  async getOnline(limit = 50) {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 50;
    const socketMaleIds = this.presence.getOnlineUserIdsByRole('male');

    let callers: any[];
    if (socketMaleIds.length > 0) {
      const placeholders = socketMaleIds.map(() => '?').join(',');
      callers = await this.db.query(
        `SELECT u.id, u.name, u.phone, u.avatar_url, u.age, u.about, u.is_online,
                COALESCE(w.balance, 0) as wallet_balance
         FROM users u
         LEFT JOIN wallets w ON w.user_id = u.id AND w.status = ?
         WHERE u.role = 'male' AND u.status = ?
           AND (u.is_online = 1 OR u.id IN (${placeholders}))
         ORDER BY u.is_online DESC, u.name ASC
         LIMIT ?`,
        [RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE, ...socketMaleIds, safeLimit],
      );
    } else {
      callers = await this.db.query(
        `SELECT u.id, u.name, u.phone, u.avatar_url, u.age, u.about, u.is_online,
                COALESCE(w.balance, 0) as wallet_balance
         FROM users u
         LEFT JOIN wallets w ON w.user_id = u.id AND w.status = ?
         WHERE u.role = 'male' AND u.status = ? AND u.is_online = 1
         ORDER BY u.name ASC
         LIMIT ?`,
        [RECORD_STATUS.ACTIVE, RECORD_STATUS.ACTIVE, safeLimit],
      );
    }

    return { success: true, data: callers.map(this.formatCaller) };
  }

  private formatCaller = (row: any) => {
    const balance = parseFloat(row.wallet_balance || 0);
    const userId = Number(row.id);
    const isBusy = this.presence.isUserInCall(userId);
    const socketOnline = this.presence.isUserOnline(userId);
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      avatar_url: row.avatar_url,
      age: row.age,
      about: row.about,
      is_online: row.is_online === 1 || row.is_online === true || socketOnline,
      is_busy: isBusy,
      can_call: balance > 0 && !isBusy,
    };
  };
}
