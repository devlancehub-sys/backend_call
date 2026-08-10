'use strict';

/**
 * Fetch admin JWT from the running API (login endpoint).
 * Usage:
 *   API_BASE=https://api.talkymate.in/api ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/get-admin-token.js
 */

const base =
  process.env.API_BASE?.replace(/\/$/, '') || 'https://api.talkymate.in/api';
const email = process.env.ADMIN_EMAIL || 'admin@premiumstatus.com';
const password = process.env.ADMIN_PASSWORD || 'Admin@123';

async function main() {
  const response = await fetch(`${base}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  if (!response.ok) {
    console.error('Login failed:', body.message || body);
    process.exit(1);
  }

  console.log(body.token);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
