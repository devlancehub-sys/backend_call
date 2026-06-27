import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
import { resolveDbConfig } from './db-config';
import { applySchemaSql } from './schema-bootstrap';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: mysql.Pool;
  private dbConfig: ReturnType<typeof resolveDbConfig>;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.dbConfig = resolveDbConfig(this.config);
    const { host, port, user, password, database } = this.dbConfig;

    const connectionLimit = Number(this.config.get('DB_POOL_SIZE')) || 5;

    this.pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      charset: 'utf8mb4',
      timezone: '+00:00',
      waitForConnections: true,
      connectionLimit,
      queueLimit: 20,
      maxIdle: connectionLimit,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
      connectTimeout: 10_000,
    });

    try {
      const conn = await this.pool.getConnection();
      await conn.ping();
      conn.release();
      this.logger.log(`Connected to MySQL (${user}@${host}:${port}/${database})`);
      await this.bootstrapSchemaIfNeeded();
      await this.ensureSchema();
    } catch (error: any) {
      if (error?.code === 'ER_ACCESS_DENIED_ERROR') {
        this.logger.error(
          'MySQL access denied. Set DB_PASSWORD in backend/.env to your MySQL root password.',
        );
        this.logger.error('Example: DB_PASSWORD=your_mysql_password');
      } else if (error?.code === 'ER_BAD_DB_ERROR') {
        this.logger.error(`Database "${database}" does not exist. Run: npm run db:setup`);
      } else {
        this.logger.error(`MySQL connection failed: ${error?.message || error}`);
      }
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  getPool() {
    return this.pool;
  }

  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T;
  }

  private async hasColumn(table: string, column: string): Promise<boolean> {
    const rows = await this.query<any[]>(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return rows.length > 0;
  }

  private async hasTable(table: string): Promise<boolean> {
    const rows = await this.query<any[]>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return rows.length > 0;
  }

  /** Match FK column type to users.id (int vs bigint unsigned on older DBs). */
  private async getUsersIdColumnType(): Promise<string> {
    const rows = await this.query<any[]>(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id'`,
    );
    return (rows[0]?.COLUMN_TYPE as string | undefined) ?? 'int';
  }

  /** Run schema.sql when core tables are missing (e.g. fresh Railway database). */
  private async bootstrapSchemaIfNeeded() {
    const required = ['users', 'languages', 'wallets', 'refresh_tokens', 'calls'];
    const missing: string[] = [];

    for (const table of required) {
      if (!(await this.hasTable(table))) {
        missing.push(table);
      }
    }

    if (!missing.length) {
      return;
    }

    this.logger.warn(`Missing tables: ${missing.join(', ')} — applying database/schema.sql`);
    try {
      await applySchemaSql(this.dbConfig);
      this.logger.log('Database schema bootstrap complete');
    } catch (error: any) {
      this.logger.error(`Schema bootstrap failed: ${error?.message || error}`);
      throw error;
    }
  }

  /** Apply safe migrations for older production databases. */
  private async ensureSchema() {
    if (!(await this.hasTable('users'))) {
      this.logger.warn('users table still missing after bootstrap');
      return;
    }

    if (!(await this.hasColumn('users', 'device_id'))) {
      await this.query('ALTER TABLE users ADD COLUMN device_id VARCHAR(255) NULL');
      this.logger.log('Added users.device_id column');
    }

    if (!(await this.hasColumn('users', 'fcm_token'))) {
      await this.query('ALTER TABLE users ADD COLUMN fcm_token VARCHAR(500) NULL');
      this.logger.log('Added users.fcm_token column');
    }

    if (!(await this.hasColumn('users', 'name'))) {
      await this.query('ALTER TABLE users ADD COLUMN name VARCHAR(100) NULL');
      this.logger.log('Added users.name column');
    }

    if (!(await this.hasColumn('users', 'username'))) {
      await this.query('ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL UNIQUE');
      this.logger.log('Added users.username column');
    }

    if (!(await this.hasColumn('users', 'password_hash'))) {
      await this.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL');
      this.logger.log('Added users.password_hash column');
    }

    if (!(await this.hasColumn('users', 'last_seen_at'))) {
      await this.query('ALTER TABLE users ADD COLUMN last_seen_at DATETIME NULL');
      this.logger.log('Added users.last_seen_at column');
    }

    if (!(await this.hasColumn('users', 'email'))) {
      await this.query('ALTER TABLE users ADD COLUMN email VARCHAR(100) NULL');
      this.logger.log('Added users.email column');
    }

    if (await this.hasTable('wallet_transactions')) {
      if (!(await this.hasColumn('wallet_transactions', 'payment_gateway'))) {
        await this.query('ALTER TABLE wallet_transactions ADD COLUMN payment_gateway VARCHAR(50) NULL');
        this.logger.log('Added wallet_transactions.payment_gateway column');
      }
      if (!(await this.hasColumn('wallet_transactions', 'payment_id'))) {
        await this.query('ALTER TABLE wallet_transactions ADD COLUMN payment_id VARCHAR(100) NULL');
        this.logger.log('Added wallet_transactions.payment_id column');
      }
    }

    if (await this.hasTable('withdraw_requests')) {
      if (!(await this.hasColumn('withdraw_requests', 'method'))) {
        await this.query(
          "ALTER TABLE withdraw_requests ADD COLUMN method VARCHAR(50) NOT NULL DEFAULT 'upi'",
        );
        this.logger.log('Added withdraw_requests.method column');
      }
      if (!(await this.hasColumn('withdraw_requests', 'account_details'))) {
        await this.query('ALTER TABLE withdraw_requests ADD COLUMN account_details JSON NULL');
        this.logger.log('Added withdraw_requests.account_details column');
      }
      await this.ensureWithdrawStatusEnum();
    }

    if (!(await this.hasTable('wallets'))) {
      await this.query(`
        CREATE TABLE wallets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
          currency VARCHAR(10) NOT NULL DEFAULT 'INR',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      this.logger.log('Created wallets table');
    }

    if (!(await this.hasTable('refresh_tokens'))) {
      await this.query(`
        CREATE TABLE refresh_tokens (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          token TEXT NOT NULL,
          device_id VARCHAR(255) NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_refresh_user (user_id)
        )
      `);
      this.logger.log('Created refresh_tokens table');
    }

    await this.ensureRecordStatusColumns();
    await this.ensureHostAvailabilityColumns();
    await this.ensureBoyFreeCallColumns();
    await this.migratePricingV2();
    await this.ensureCallsRoomIdColumn();
    await this.ensureHostWeeklyStatsCleanup();
    await this.ensureHostOtpTable();
    await this.ensurePromoAndAccessKeyTables();
    void this.ensurePerformanceIndexes().catch((err) =>
      this.logger.warn(`Background index migration skipped: ${(err as Error)?.message || err}`),
    );
  }

  /** Standard row status: inactive | active | disabled — app queries use active only. */
  private async ensureRecordStatusColumns() {
    const statusType = "ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active'";

    if (!(await this.hasColumn('users', 'status'))) {
      await this.query(`ALTER TABLE users ADD COLUMN status ${statusType}`);
      if (await this.hasColumn('users', 'is_active')) {
        await this.query(
          `UPDATE users SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END`,
        );
        await this.query('ALTER TABLE users DROP COLUMN is_active');
        this.logger.log('Migrated users.is_active → users.status');
      }
    }

    if (await this.hasTable('languages') && !(await this.hasColumn('languages', 'status'))) {
      await this.query(`ALTER TABLE languages ADD COLUMN status ${statusType}`);
      if (await this.hasColumn('languages', 'is_active')) {
        await this.query(
          `UPDATE languages SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END`,
        );
        await this.query('ALTER TABLE languages DROP COLUMN is_active');
        this.logger.log('Migrated languages.is_active → languages.status');
      }
    }

    const tablesNeedingStatus = [
      'female_hosts',
      'wallets',
      'earnings',
      'favorites',
      'user_languages',
      'refresh_tokens',
      'call_logs',
    ];

    for (const table of tablesNeedingStatus) {
      if ((await this.hasTable(table)) && !(await this.hasColumn(table, 'status'))) {
        await this.query(`ALTER TABLE ${table} ADD COLUMN status ${statusType}`);
        this.logger.log(`Added ${table}.status column`);
      }
    }
  }

  /** Add composite indexes for hot query paths (idempotent). */
  private async ensurePerformanceIndexes() {
    const indexes: Array<{ table: string; name: string; sql: string }> = [
      {
        table: 'calls',
        name: 'idx_calls_host_created',
        sql: 'CREATE INDEX idx_calls_host_created ON calls (host_id, created_at)',
      },
      {
        table: 'calls',
        name: 'idx_calls_caller_created',
        sql: 'CREATE INDEX idx_calls_caller_created ON calls (caller_id, created_at)',
      },
      {
        table: 'calls',
        name: 'idx_calls_status',
        sql: 'CREATE INDEX idx_calls_status ON calls (status, created_at)',
      },
      {
        table: 'earnings',
        name: 'idx_earnings_host_created',
        sql: 'CREATE INDEX idx_earnings_host_created ON earnings (host_id, created_at)',
      },
      {
        table: 'withdraw_requests',
        name: 'idx_wr_host_status',
        sql: 'CREATE INDEX idx_wr_host_status ON withdraw_requests (host_id, status)',
      },
      {
        table: 'users',
        name: 'idx_users_role_status_online',
        sql: 'CREATE INDEX idx_users_role_status_online ON users (role, status, is_online)',
      },
      {
        table: 'users',
        name: 'idx_users_device_role',
        sql: 'CREATE INDEX idx_users_device_role ON users (device_id, role)',
      },
    ];

    for (const idx of indexes) {
      if (!(await this.hasTable(idx.table))) continue;
      if (await this.hasIndex(idx.table, idx.name)) continue;
      try {
        await this.query(idx.sql);
        this.logger.log(`Added index ${idx.name}`);
      } catch (error: any) {
        if (error?.code !== 'ER_DUP_KEYNAME') {
          this.logger.warn(`Index ${idx.name} skipped: ${error?.message || error}`);
        }
      }
    }
  }

  private async hasIndex(table: string, indexName: string): Promise<boolean> {
    const rows = await this.query<any[]>(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, indexName],
    );
    return rows.length > 0;
  }

  /** Ensure withdraw status enum includes `processing` (used by withdraw queries). */
  private async ensureWithdrawStatusEnum() {
    const rows = await this.query<any[]>(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'withdraw_requests' AND COLUMN_NAME = 'status'`,
    );
    const columnType = rows[0]?.COLUMN_TYPE as string | undefined;
    if (columnType && !columnType.includes('processing')) {
      await this.query(
        `ALTER TABLE withdraw_requests MODIFY status
         ENUM('pending','processing','completed','rejected') NOT NULL DEFAULT 'pending'`,
      );
      this.logger.log('Updated withdraw_requests.status enum');
    }
  }

  /** Create promo_codes, promo_code_redemptions, host_access_keys on older databases. */
  private async ensureHostAvailabilityColumns() {
    if (!(await this.hasTable('female_hosts'))) return;

    if (!(await this.hasColumn('female_hosts', 'host_status'))) {
      await this.query(
        `ALTER TABLE female_hosts ADD COLUMN host_status ENUM('offline','available','busy') NOT NULL DEFAULT 'offline'`,
      );
      this.logger.log('Added female_hosts.host_status column');
    }

    if (!(await this.hasColumn('female_hosts', 'consecutive_missed_calls'))) {
      await this.query(
        `ALTER TABLE female_hosts ADD COLUMN consecutive_missed_calls INT NOT NULL DEFAULT 0`,
      );
      this.logger.log('Added female_hosts.consecutive_missed_calls column');
    }

    if (!(await this.hasColumn('female_hosts', 'available_since'))) {
      await this.query(`ALTER TABLE female_hosts ADD COLUMN available_since DATETIME NULL`);
      this.logger.log('Added female_hosts.available_since column');
    }
  }

  private async ensureCallsRoomIdColumn() {
    if (!(await this.hasTable('calls'))) return;

    if (!(await this.hasColumn('calls', 'room_id'))) {
      const legacy = await this.query<Array<{ name: string }>>(
        `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'calls'
           AND COLUMN_NAME LIKE '%channel%' AND COLUMN_NAME <> 'room_id'
         LIMIT 1`,
      );

      if (legacy.length) {
        const col = legacy[0].name;
        await this.query(
          `ALTER TABLE calls CHANGE COLUMN \`${col}\` room_id VARCHAR(255) NOT NULL`,
        );
        this.logger.log('Migrated calls voice room column to room_id');
      } else {
        await this.query(
          `ALTER TABLE calls ADD COLUMN room_id VARCHAR(255) NOT NULL DEFAULT ''`,
        );
        this.logger.log('Added calls.room_id column');
      }
    }

    await this.dropLegacyCallsChannelColumns();
  }

  private async migratePricingV2() {
    if (await this.hasTable('female_hosts')) {
      const normalized = await this.query(
        `UPDATE female_hosts SET rate_per_minute = 6
         WHERE rate_per_minute NOT IN (6, 12, 18, 24, 40)`,
      );
      const normalizedCount = (normalized as { affectedRows?: number })?.affectedRows ?? 0;
      if (normalizedCount > 0) {
        this.logger.log(`Normalized ${normalizedCount} host rate(s) to allowed tiers (6/12/18/24/40)`);
      }
    }

    if (!(await this.hasTable('platform_settings'))) return;

    const rows = await this.query<{ setting_value: string }[]>(
      'SELECT setting_value FROM platform_settings WHERE setting_key = ?',
      ['pricing_v2_applied'],
    );
    if (rows.length && rows[0].setting_value === '1') return;

    await this.query(
      `INSERT INTO platform_settings (setting_key, setting_value) VALUES
        ('commission_percentage', '50'),
        ('promoted_commission_percentage', '50'),
        ('standard_commission_percentage', '50'),
        ('default_host_rate', '6'),
        ('pricing_v2_applied', '1')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    );
    this.logger.log('Pricing v2: 50% host / 50% platform commission applied');
  }

  private async ensureBoyFreeCallColumns() {
    if (!(await this.hasTable('free_call_redemptions'))) {
      await this.query(`
        CREATE TABLE free_call_redemptions (
          id INT NOT NULL AUTO_INCREMENT,
          device_id VARCHAR(255) NOT NULL,
          fcm_token VARCHAR(500) NOT NULL,
          user_id INT NULL,
          call_id INT NULL,
          used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_free_call_device_token (device_id, fcm_token),
          KEY idx_free_call_user (user_id),
          CONSTRAINT fk_free_call_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
          CONSTRAINT fk_free_call_call FOREIGN KEY (call_id) REFERENCES calls (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      this.logger.log('Created free_call_redemptions table');
    }

    if (await this.hasTable('calls') && !(await this.hasColumn('calls', 'is_free_call'))) {
      await this.query(
        'ALTER TABLE calls ADD COLUMN is_free_call TINYINT(1) NOT NULL DEFAULT 0',
      );
      this.logger.log('Added calls.is_free_call column');
    }

    if (await this.hasTable('calls') && !(await this.hasColumn('calls', 'free_call_device_id'))) {
      await this.query('ALTER TABLE calls ADD COLUMN free_call_device_id VARCHAR(255) NULL');
      this.logger.log('Added calls.free_call_device_id column');
    }

    if (await this.hasTable('calls') && !(await this.hasColumn('calls', 'free_call_fcm_token'))) {
      await this.query('ALTER TABLE calls ADD COLUMN free_call_fcm_token VARCHAR(500) NULL');
      this.logger.log('Added calls.free_call_fcm_token column');
    }

    if (
      (await this.hasTable('female_hosts')) &&
      !(await this.hasColumn('female_hosts', 'offers_free_call'))
    ) {
      await this.query(
        'ALTER TABLE female_hosts ADD COLUMN offers_free_call TINYINT(1) NOT NULL DEFAULT 0',
      );
      this.logger.log('Added female_hosts.offers_free_call column');
    }
  }

  /** Production DBs may have both room_id and legacy agora_channel — drop the old column. */
  private async dropLegacyCallsChannelColumns() {
    if (!(await this.hasTable('calls'))) return;
    if (!(await this.hasColumn('calls', 'room_id'))) return;

    const legacy = await this.query<Array<{ name: string }>>(
      `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'calls'
         AND COLUMN_NAME LIKE '%channel%' AND COLUMN_NAME <> 'room_id'`,
    );

    for (const { name: col } of legacy) {
      await this.query(
        `UPDATE calls SET room_id = \`${col}\`
         WHERE (room_id IS NULL OR room_id = '')
           AND \`${col}\` IS NOT NULL AND \`${col}\` <> ''`,
      );
      await this.query(`ALTER TABLE calls DROP COLUMN \`${col}\``);
      this.logger.log(`Dropped legacy calls.${col} column`);
    }
  }

  private async ensureHostWeeklyStatsCleanup() {
    if (!(await this.hasTable('female_hosts'))) return;

    await this.removeLegacyDailyTaskArtifacts();

    if (await this.hasTable('host_weekly_bonuses')) {
      await this.query('DROP TABLE host_weekly_bonuses');
      this.logger.log('Dropped legacy host_weekly_bonuses table');
    }
  }

  private async removeLegacyDailyTaskArtifacts() {
    if (await this.hasTable('host_daily_tasks')) {
      await this.query('DROP TABLE host_daily_tasks');
      this.logger.log('Dropped legacy host_daily_tasks table');
    }

    for (const column of ['earning_status', 'streak_count', 'last_task_eval_date']) {
      if (await this.hasColumn('female_hosts', column)) {
        await this.query(`ALTER TABLE female_hosts DROP COLUMN \`${column}\``);
        this.logger.log(`Dropped legacy female_hosts.${column} column`);
      }
    }
  }

  private async ensureHostOtpTable() {
    if (!(await this.hasTable('host_otp_codes'))) {
      await this.query(`
        CREATE TABLE host_otp_codes (
          phone VARCHAR(15) NOT NULL PRIMARY KEY,
          otp VARCHAR(8) NOT NULL,
          expires_at DATETIME NOT NULL,
          attempts INT NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this.logger.log('Created host_otp_codes table');
    }
  }

  private async ensurePromoAndAccessKeyTables() {
    const userIdType = await this.getUsersIdColumnType();

    if (!(await this.hasTable('promo_codes'))) {
      await this.query(`
        CREATE TABLE promo_codes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          promo_code VARCHAR(50) NOT NULL UNIQUE,
          user_id ${userIdType} NULL,
          discount_value DECIMAL(12,2) NOT NULL,
          expiry_date DATETIME NOT NULL,
          is_used TINYINT(1) NOT NULL DEFAULT 0,
          used_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_promo_user (user_id),
          CONSTRAINT fk_promo_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
        )
      `);
      this.logger.log('Created promo_codes table');
    }

    if (!(await this.hasTable('promo_code_redemptions'))) {
      await this.query(`
        CREATE TABLE promo_code_redemptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          promo_code_id INT NOT NULL,
          user_id ${userIdType} NOT NULL,
          promo_code VARCHAR(50) NOT NULL,
          discount_value DECIMAL(12,2) NOT NULL,
          redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_pcr_user (user_id),
          KEY idx_pcr_code (promo_code_id),
          CONSTRAINT fk_pcr_promo FOREIGN KEY (promo_code_id) REFERENCES promo_codes (id) ON DELETE CASCADE,
          CONSTRAINT fk_pcr_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);
      this.logger.log('Created promo_code_redemptions table');
    }

    if (!(await this.hasTable('host_access_keys'))) {
      await this.query(`
        CREATE TABLE host_access_keys (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id ${userIdType} NOT NULL UNIQUE,
          access_key VARCHAR(255) NOT NULL UNIQUE,
          expires_at DATETIME NOT NULL,
          profile_version INT NOT NULL DEFAULT 1,
          status ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_hak_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);
      this.logger.log('Created host_access_keys table');
    }
  }
}
