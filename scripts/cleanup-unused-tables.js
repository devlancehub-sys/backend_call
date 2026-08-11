'use strict';

/**
 * Drop MySQL tables that are not used by Premium Status backend.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/cleanup-unused-tables.js   # preview only
 *   CONFIRM=1 node scripts/cleanup-unused-tables.js   # actually drop
 *
 * Set DATABASE_URL or MYSQL* vars (Railway MySQL service).
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getDbConfig } = require('./db-config');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

/** Tables required by backend/database/migrations/001_initial_schema.sql */
const KEEP_TABLES = new Set([
  'users',
  'devices',
  'wallets',
  'wallet_transactions',
  'girls',
  'videos',
  'video_unlocks',
  'recharge_history',
  'admins',
  'app_settings',
  'schema_migrations',
]);

async function main() {
  const dryRun = process.env.CONFIRM !== '1';
  const config = getDbConfig();

  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: true,
  });

  try {
    const [rows] = await connection.query('SHOW TABLES');
    const key = Object.keys(rows[0] || {})[0] || `Tables_in_${config.database}`;
    const allTables = rows.map((row) => String(row[key]));
    const toDrop = allTables.filter((table) => !KEEP_TABLES.has(table)).sort();

    console.log(`Database: ${config.database}`);
    console.log(`Keeping (${KEEP_TABLES.size}): ${[...KEEP_TABLES].sort().join(', ')}`);
    console.log('');

    if (toDrop.length === 0) {
      console.log('Nothing to remove — all tables are in use.');
      return;
    }

    console.log(`Unused tables to drop (${toDrop.length}):`);
    for (const table of toDrop) {
      console.log(`  - ${table}`);
    }
    console.log('');

    if (dryRun) {
      console.log('DRY RUN — no tables dropped.');
      console.log('Run again with CONFIRM=1 to drop them.');
      return;
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of toDrop) {
      await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
      console.log(`Dropped: ${table}`);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\nCleanup complete.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
