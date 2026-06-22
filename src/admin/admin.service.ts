import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import { HostAccessKeyService } from '../common/services/host-access-key.service';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class AdminService {
  constructor(
    private db: DatabaseService,
    private platformSettings: PlatformSettingsService,
    private hostAccessKey: HostAccessKeyService,
  ) {}

  async getDashboard() {
    const [[users]] = await this.db.getPool().query<any[]>(
      'SELECT COUNT(*) as total FROM users WHERE role != "admin"',
    );
    const [[hosts]] = await this.db.getPool().query<any[]>(
      'SELECT COUNT(*) as total FROM users WHERE role = "female"',
    );
    const [[onlineHosts]] = await this.db.getPool().query<any[]>(
      'SELECT COUNT(*) as total FROM users WHERE role = "female" AND is_online = 1',
    );
    const [[activeCalls]] = await this.db.getPool().query<any[]>(
      'SELECT COUNT(*) as total FROM calls WHERE status = "active"',
    );
    const [[revenue]] = await this.db.getPool().query<any[]>(
      'SELECT COALESCE(SUM(platform_commission), 0) as total FROM calls WHERE status = "ended"',
    );
    const [[pendingWithdraw]] = await this.db.getPool().query<any[]>(
      'SELECT COUNT(*) as total FROM withdraw_requests WHERE status = "pending"',
    );

    return {
      success: true,
      data: {
        total_users: users.total,
        total_hosts: hosts.total,
        online_hosts: onlineHosts.total,
        active_calls: activeCalls.total,
        total_revenue: parseFloat(revenue.total),
        pending_withdrawals: pendingWithdraw.total,
      },
    };
  }

  async getUsers(role?: string) {
    let sql = 'SELECT id, phone, name, role, status, is_online, created_at FROM users WHERE role != "admin"';
    const params: any[] = [];
    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const users = await this.db.query(sql, params);
    return { success: true, data: users };
  }

  async getHosts() {
    const hosts = await this.db.query(
      `SELECT u.id, u.name, u.phone, u.username, u.is_online, u.status, fh.rate_per_minute,
              fh.total_calls, fh.rating, fh.is_featured
       FROM users u JOIN female_hosts fh ON fh.user_id = u.id ORDER BY u.created_at DESC`,
    );
    return { success: true, data: hosts };
  }

  async getCalls() {
    const calls = await this.db.query(
      `SELECT c.*, caller.name as caller_name, host.name as host_name
       FROM calls c
       JOIN users caller ON caller.id = c.caller_id
       JOIN users host ON host.id = c.host_id
       ORDER BY c.created_at DESC LIMIT 100`,
    );
    return { success: true, data: calls };
  }

  async getWithdrawals() {
    const requests = await this.db.query(
      `SELECT wr.*, u.name as host_name, u.phone FROM withdraw_requests wr
       JOIN users u ON u.id = wr.host_id ORDER BY wr.created_at DESC`,
    );
    return { success: true, data: requests };
  }

  async completeWithdrawal(id: number) {
    await this.db.query(
      'UPDATE withdraw_requests SET status = "completed", processed_at = NOW() WHERE id = ?',
      [id],
    );
    return { success: true, message: 'Withdrawal completed' };
  }

  async getSettings() {
    const settings = await this.db.query('SELECT setting_key, setting_value FROM platform_settings');
    return { success: true, data: settings };
  }

  async updateSettings(settings: Record<string, string>) {
    for (const [key, value] of Object.entries(settings)) {
      await this.db.query(
        'INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, value, value],
      );
    }
    await this.platformSettings.refresh();
    return { success: true, message: 'Settings updated' };
  }

  async updateUserStatus(
    userId: number,
    status: 'inactive' | 'active' | 'disabled',
  ) {
    const allowed = [RECORD_STATUS.INACTIVE, RECORD_STATUS.ACTIVE, RECORD_STATUS.DISABLED];
    if (!allowed.includes(status)) {
      return { success: false, message: 'Invalid status' };
    }

    await this.db.query('UPDATE users SET status = ? WHERE id = ? AND role != ?', [
      status,
      userId,
      'admin',
    ]);

    if (status !== RECORD_STATUS.ACTIVE) {
      await this.db.query('UPDATE refresh_tokens SET status = ? WHERE user_id = ?', [
        RECORD_STATUS.INACTIVE,
        userId,
      ]);
      await this.hostAccessKey.invalidateForUser(userId);
    } else {
      await this.hostAccessKey.bumpProfileVersion(userId);
    }

    return { success: true, message: `User status updated to ${status}` };
  }
}
