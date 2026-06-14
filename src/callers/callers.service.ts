import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CallersService {
  constructor(private db: DatabaseService) {}

  /** Male users list — for girls app (larka list) */
  async browse() {
    const callers = await this.db.query(
      `SELECT u.id, u.name, u.phone, u.avatar_url, u.age, u.about, u.is_online,
              COALESCE(w.balance, 0) as wallet_balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.role = 'male' AND u.is_active = 1
       ORDER BY u.is_online DESC, u.name ASC`,
    );
    return { success: true, data: callers.map(this.formatCaller) };
  }

  async getOnline() {
    const callers = await this.db.query(
      `SELECT u.id, u.name, u.phone, u.avatar_url, u.age, u.about, u.is_online,
              COALESCE(w.balance, 0) as wallet_balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.role = 'male' AND u.is_active = 1 AND u.is_online = 1
       ORDER BY u.name ASC`,
    );
    return { success: true, data: callers.map(this.formatCaller) };
  }

  private formatCaller(row: any) {
    const balance = parseFloat(row.wallet_balance || 0);
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      avatar_url: row.avatar_url,
      age: row.age,
      about: row.about,
      is_online: row.is_online === 1 || row.is_online === true,
      can_call: balance > 0,
    };
  }
}
