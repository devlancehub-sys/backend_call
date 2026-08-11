'use strict';

/**
 * Delete all app data from MySQL (keeps tables + schema).
 *
 * Usage:
 *   node scripts/reset-database.js              # preview only
 *   CONFIRM=1 node scripts/reset-database.js      # actually delete
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

const DATA_TABLES = [
  'wallet_transactions',
  'video_unlocks',
  'recharge_history',
  'videos',
  'wallets',
  'devices',
  'girls',
  'users',
  'admins',
];

async function main() {
  const dryRun = process.env.CONFIRM !== '1';
  const config = getDbConfig();

  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: true,
  });

  try {
    console.log(`Database: ${config.database}`);
    console.log('');
    console.log('Tables to clear (all rows deleted):');
    for (const table of DATA_TABLES) {
      console.log(`  - ${table}`);
    }
    console.log('');
    console.log('app_settings will reset girlsVersion to 1.');
    console.log('');

    if (dryRun) {
      console.log('DRY RUN — no data deleted.');
      console.log('Run again with CONFIRM=1 to delete all data.');
      return;
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of DATA_TABLES) {
      await connection.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`Cleared: ${table}`);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    await connection.query(`
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES ('girlsVersion', '1')
      ON DUPLICATE KEY UPDATE setting_value = '1'
    `);
    console.log('Reset: app_settings.girlsVersion = 1');

    console.log('');
    console.log('All data deleted. Run npm run migrate to re-seed admin account.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
