import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: mysql.Pool;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const host = process.env.DB_HOST || this.config.get('DB_HOST', 'localhost');
    const port = Number(process.env.DB_PORT || this.config.get('DB_PORT', 3306));
    const user = process.env.DB_USER || this.config.get('DB_USER', 'root');
    const password = process.env.DB_PASSWORD ?? this.config.get('DB_PASSWORD', '');
    const database = process.env.DB_NAME || this.config.get('DB_NAME', 'love_call');

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
      await this.ensureSchema();
    } catch (error: any) {
      if (error?.code === 'ER_ACCESS_DENIED_ERROR') {
        this.logger.error(
          'MySQL access denied. Set DB_PASSWORD in backend/.env to your MySQL root password.',
        );
        this.logger.error('Example: DB_PASSWORD=your_mysql_password');
        this.logger.error('Or run: docker compose up -d  (uses password: lovecall123)');
      } else if (error?.code === 'ER_BAD_DB_ERROR') {
        this.logger.error(`Database "${database}" does not exist. Run: mysql -u root -p < database/schema.sql`);
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

  /** Apply safe migrations for older production databases. */
  private async ensureSchema() {
    if (!(await this.hasTable('users'))) {
      this.logger.warn('users table missing — run database/schema.sql on this database');
      return;
    }

    if (!(await this.hasColumn('users', 'device_id'))) {
      await this.query('ALTER TABLE users ADD COLUMN device_id VARCHAR(255) NULL');
      this.logger.log('Added users.device_id column');
    }

    if (!(await this.hasColumn('users', 'username'))) {
      await this.query('ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL UNIQUE');
      this.logger.log('Added users.username column');
    }

    if (!(await this.hasColumn('users', 'password_hash'))) {
      await this.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL');
      this.logger.log('Added users.password_hash column');
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
}
