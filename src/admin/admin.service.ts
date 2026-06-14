import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AdminService {
  constructor(private db: DatabaseService) {}

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
    const [[pendingKyc]] = await this.db.getPool().query<any[]>(
      'SELECT COUNT(*) as total FROM female_hosts WHERE kyc_status = "submitted"',
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
        pending_kyc: pendingKyc.total,
        pending_withdrawals: pendingWithdraw.total,
      },
    };
  }

  async getUsers(role?: string) {
    let sql = 'SELECT id, phone, name, role, is_active, is_online, created_at FROM users WHERE role != "admin"';
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
      `SELECT u.id, u.name, u.phone, u.username, u.is_online, fh.rate_per_minute, fh.kyc_status,
              fh.total_calls, fh.rating, fh.is_featured
       FROM users u JOIN female_hosts fh ON fh.user_id = u.id ORDER BY u.created_at DESC`,
    );
    return { success: true, data: hosts };
  }

  async approveKyc(userId: number) {
    await this.db.query('UPDATE female_hosts SET kyc_status = "approved" WHERE user_id = ?', [userId]);
    await this.db.query(
      'UPDATE kyc_documents SET status = "approved", verified_at = NOW() WHERE user_id = ?',
      [userId],
    );
    return { success: true, message: 'KYC approved' };
  }

  async rejectKyc(userId: number, note: string) {
    await this.db.query('UPDATE female_hosts SET kyc_status = "rejected" WHERE user_id = ?', [userId]);
    await this.db.query(
      'UPDATE kyc_documents SET status = "rejected", admin_note = ? WHERE user_id = ?',
      [note, userId],
    );
    return { success: true, message: 'KYC rejected' };
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
    return { success: true, message: 'Settings updated' };
  }
}
