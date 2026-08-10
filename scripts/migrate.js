'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getDbConfig } = require('./db-config');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'database', 'migrations');
const SEEDS_DIR = path.join(ROOT, 'database', 'seeds');

function stripSqlComments(sql) {
  let result = '';
  let i = 0;

  while (i < sql.length) {
    if (sql[i] === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < sql.length - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    result += sql[i];
    i++;
  }

  return result;
}

function splitStatements(sql) {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_migration_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getAppliedMigrations(connection) {
  const [rows] = await connection.query(
    'SELECT filename FROM schema_migrations ORDER BY filename ASC',
  );
  return new Set(rows.map((row) => row.filename));
}

async function applySqlFile(connection, filePath, recordName) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = splitStatements(sql);

  for (const statement of statements) {
    await connection.query(statement);
  }

  if (recordName) {
    await connection.query(
      'INSERT IGNORE INTO schema_migrations (filename) VALUES (?)',
      [recordName],
    );
  }
}

async function runMigrations(connection) {
  await ensureMigrationsTable(connection);
  const applied = await getAppliedMigrations(connection);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip migration ${file}`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    console.log(`apply migration ${file}`);
    await applySqlFile(connection, filePath, file);
  }
}

async function runSeeds(connection) {
  if (!fs.existsSync(SEEDS_DIR)) return;

  const files = fs
    .readdirSync(SEEDS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(SEEDS_DIR, file);
    console.log(`apply seed ${file}`);
    await applySqlFile(connection, filePath, null);
  }
}

async function main() {
  const config = getDbConfig();
  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: false,
  });

  try {
    await runMigrations(connection);
    await runSeeds(connection);
    console.log('Database migrations complete');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
