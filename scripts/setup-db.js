#!/usr/bin/env node
/**
 * Applies database/schema.sql using mysql2 (no mysql CLI required).
 * Supports DB_* and Railway MYSQL* environment variables.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function getDbConfig() {
  loadEnvFile();
  return {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? '',
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'love_call',
  };
}

async function main() {
  const config = getDbConfig();
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found: ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log(`Applying schema to ${config.user}@${config.host}:${config.port}/${config.database} ...`);

  const conn = await mysql.createConnection({
    ...config,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('Database setup complete.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Database setup failed:', err.message || err);
  process.exit(1);
});
