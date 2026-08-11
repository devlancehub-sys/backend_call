'use strict';

/**
 * Credit coins to a user wallet (admin API).
 * Usage:
 *   USER_ID=43 AMOUNT=500 node scripts/credit-wallet.js
 */

const base =
  process.env.API_BASE?.replace(/\/$/, '') || 'https://api.talkymate.in/api';
const email = process.env.ADMIN_EMAIL || 'admin@premiumstatus.com';
const password = process.env.ADMIN_PASSWORD || 'Admin@123';
const userId = Number(process.env.USER_ID || '43');
const amount = Number(process.env.AMOUNT || '500');

async function main() {
  if (!userId || !amount) {
    console.error('Set USER_ID and AMOUNT');
    process.exit(1);
  }

  const loginRes = await fetch(`${base}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json();
  if (!loginRes.ok) {
    console.error('Login failed:', loginBody.message || loginBody);
    process.exit(1);
  }

  const creditRes = await fetch(`${base}/admin/users/${userId}/wallet/credit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.token}`,
    },
    body: JSON.stringify({
      amount,
      description: process.env.DESCRIPTION || `Test credit: ${amount} coins`,
    }),
  });

  const creditBody = await creditRes.json();
  if (!creditRes.ok) {
    console.error('Credit failed:', creditBody.message || creditBody);
    process.exit(1);
  }

  console.log(JSON.stringify(creditBody, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
