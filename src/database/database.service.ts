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

    this.pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
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
}
