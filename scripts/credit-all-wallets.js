'use strict';

/**
 * Credit coins to every user wallet (admin API).
 * Usage:
 *   AMOUNT=500 node scripts/credit-all-wallets.js
 */

const base =
  process.env.API_BASE?.replace(/\/$/, '') || 'https://api.talkymate.in/api';
const email = process.env.ADMIN_EMAIL || 'admin@premiumstatus.com';
const password = process.env.ADMIN_PASSWORD || 'Admin@123';
const amount = Number(process.env.AMOUNT || '600');

async function login() {
  const response = await fetch(`${base}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message || 'Admin login failed');
  }
  return body.token;
}

async function main() {
  const token = await login();

  const response = await fetch(`${base}/admin/wallet/credit-all`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount,
      description: process.env.DESCRIPTION || `Bulk test credit: ${amount} coins`,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message || 'Bulk credit failed');
  }

  console.log(JSON.stringify(body, null, 2));
  console.log(`\nDone: credited ${amount} coins to ${body.users} users`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
