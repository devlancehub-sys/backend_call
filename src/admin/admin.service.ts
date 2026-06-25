import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PlatformSettingsService } from '../common/services/platform-settings.service';
import { HostAccessKeyService } from '../common/services/host-access-key.service';
import { OnlineUserManagerService } from '../socket/online-user-manager.service';
import { RECORD_STATUS } from '../common/constants/record-status';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private db: DatabaseService,
    private platformSettings: PlatformSettingsService,
    private hostAccessKey: HostAccessKeyService,
    private presence: OnlineUserManagerService,
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

  async purgeAllUserData() {
    const pool = this.db.getPool();
    const conn = await pool.getConnection();
    const clearedTables: string[] = [];

    try {
      await conn.beginTransaction();

      const [[countRow]] = await conn.query<any[]>(
        'SELECT COUNT(*) as total FROM users WHERE role != ?',
        ['admin'],
      );
      const deletedUsers = Number(countRow?.total ?? 0);

      const optionalTables = ['host_otp_codes', 'notifications', 'admin_audit_logs'];
      for (const table of optionalTables) {
        if (await this.tableExists(table)) {
          await conn.query(`TRUNCATE TABLE \`${table}\``);
          clearedTables.push(table);
        }
      }

      if (await this.tableExists('promo_codes')) {
        await conn.query('DELETE FROM promo_codes');
        clearedTables.push('promo_codes', 'promo_code_redemptions');
      }

      await conn.query('DELETE FROM users WHERE role != ?', ['admin']);
      clearedTables.push('users (non-admin + related records)');

      await conn.commit();

      this.presence.clearAllSessions();
      this.logger.warn(`Purged all user data — deleted ${deletedUsers} non-admin users`);

      return {
        success: true,
        message: 'All user data deleted. Admin accounts and platform settings kept.',
        data: {
          deleted_users: deletedUsers,
          cleared_tables: clearedTables,
        },
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  private async tableExists(table: string): Promise<boolean> {
    const rows = await this.db.query<any[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return rows.length > 0;
  }
}
