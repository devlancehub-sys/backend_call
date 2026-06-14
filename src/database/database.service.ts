import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: mysql.Pool;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const host = this.config.get('DB_HOST', 'localhost');
    const port = this.config.get<number>('DB_PORT', 3306);
    const user = this.config.get('DB_USER', 'root');
    const password = this.config.get('DB_PASSWORD', '');
    const database = this.config.get('DB_NAME', 'love_call');

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
}
