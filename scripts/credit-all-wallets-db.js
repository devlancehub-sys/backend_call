'use strict';

/**
 * Credit coins to every wallet directly in MySQL (no API deploy needed).
 * Set DATABASE_URL or MYSQL* vars from Railway MySQL service.
 *
 * Usage:
 *   AMOUNT=500 node scripts/credit-all-wallets-db.js
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

const amount = Number(process.env.AMOUNT || '600');
const description =
  process.env.DESCRIPTION || `Bulk test credit: ${amount} coins`;

async function main() {
  const config = getDbConfig();
  if (!config.host || config.host === 'localhost') {
    console.error(
      'Set DATABASE_URL or MYSQLHOST/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE from Railway.',
    );
    process.exit(1);
  }

  const connection = await mysql.createConnection(config);
  try {
    await connection.beginTransaction();

    const [walletRows] = await connection.query(
      'SELECT user_id, balance FROM wallets ORDER BY user_id ASC',
    );

    if (!walletRows.length) {
      console.log('No wallets found.');
      return;
    }

    await connection.query(
      'UPDATE wallets SET balance = balance + ?',
      [amount],
    );

    for (const row of walletRows) {
      await connection.query(
        `INSERT INTO wallet_transactions (user_id, type, amount, description)
         VALUES (?, 'credit', ?, ?)`,
        [row.user_id, amount, description],
      );
    }

    await connection.commit();

    console.log(`Credited ${amount} coins to ${walletRows.length} users:`);
    for (const row of walletRows) {
      console.log(
        `  user ${row.user_id}: ${Number(row.balance)} -> ${Number(row.balance) + amount}`,
      );
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
