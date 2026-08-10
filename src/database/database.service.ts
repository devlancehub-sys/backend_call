import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: mysql.Pool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const poolConfig = this.resolvePoolConfig();
    this.pool = mysql.createPool(poolConfig);
  }

  private resolvePoolConfig(): mysql.PoolOptions {
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    if (databaseUrl) {
      const parsed = new URL(databaseUrl);
      const sslEnabled = this.config.get<string>('DB_SSL') === 'true';
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '3306', 10),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        waitForConnections: true,
        connectionLimit: this.config.get<number>('DB_POOL_SIZE', 10),
        ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
      };
    }

    const sslEnabled =
      this.config.get<string>('DB_SSL') === 'true' ||
      this.config.get<string>('MYSQLSSL') === 'true';

    return {
      host:
        this.config.get<string>('MYSQLHOST') ||
        this.config.get<string>('DB_HOST') ||
        'localhost',
      port: parseInt(
        this.config.get<string>('MYSQLPORT') ||
          String(this.config.get<number>('DB_PORT', 3306)),
        10,
      ),
      user:
        this.config.get<string>('MYSQLUSER') ||
        this.config.get<string>('DB_USER') ||
        'root',
      password:
        this.config.get<string>('MYSQLPASSWORD') ||
        this.config.get<string>('DB_PASSWORD') ||
        '',
      database:
        this.config.get<string>('MYSQLDATABASE') ||
        this.config.get<string>('DB_NAME') ||
        'premium_status',
      waitForConnections: true,
      connectionLimit: this.config.get<number>('DB_POOL_SIZE', 10),
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
    };
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  getPool(): mysql.Pool {
    return this.pool;
  }

  async query<T extends mysql.RowDataPacket[] | mysql.ResultSetHeader = mysql.RowDataPacket[]>(
    sql: string,
    params: unknown[] = [],
  ): Promise<[T, mysql.FieldPacket[]]> {
    return this.pool.query(sql, params) as Promise<[T, mysql.FieldPacket[]]>;
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
