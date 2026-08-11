'use strict';

/**
 * Create admin user from env vars (run after db:reset).
 *
 *   ADMIN_SEED_EMAIL=admin@example.com ADMIN_SEED_PASSWORD=secret CONFIRM=1 node scripts/seed-admin.js
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
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

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD || process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_SEED_NAME || 'Admin';

  if (!email || !password) {
    console.error(
      'Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD (or ADMIN_EMAIL / ADMIN_PASSWORD).',
    );
    process.exit(1);
  }

  if (process.env.CONFIRM !== '1') {
    console.log(`Would create admin: ${email}`);
    console.log('Run with CONFIRM=1 to apply.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const connection = await mysql.createConnection(getDbConfig());

  try {
    await connection.query(
      `INSERT INTO admins (email, password_hash, name)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name)`,
      [email, passwordHash, name],
    );
    console.log(`Admin ready: ${email}`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Seed admin failed:', err.message);
  process.exit(1);
});
