import { ConfigService } from '@nestjs/config';

export interface DbConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** Resolve DB settings from DB_* or Railway MYSQL* env vars. */
export function resolveDbConfig(config?: ConfigService): DbConnectionConfig {
  const get = (key: string, fallback: string) =>
    process.env[key] ?? config?.get<string>(key) ?? fallback;

  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || get('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || get('DB_PORT', '3306')),
    user: process.env.DB_USER || process.env.MYSQLUSER || get('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? get('DB_PASSWORD', ''),
    database:
      process.env.DB_NAME || process.env.MYSQLDATABASE || get('DB_NAME', 'love_call'),
  };
}
