import * as fs from 'fs';
import * as path from 'path';
import * as mysql from 'mysql2/promise';
import { DbConnectionConfig } from './db-config';

export function getSchemaFilePath(): string {
  return path.join(process.cwd(), 'database', 'schema.sql');
}

export async function applySchemaSql(config: DbConnectionConfig): Promise<void> {
  const schemaPath = getSchemaFilePath();
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  const conn = await mysql.createConnection({
    ...config,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}
