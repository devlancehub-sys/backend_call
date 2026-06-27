# Love Call Backend

NestJS API for the Love Call voice platform.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # edit DB + JWT + Zego credentials
npm run db:setup       # applies database/schema.sql (also runs on start:prod)
npm run start:dev      # http://localhost:3000/api
```

See **[ENV.md](./ENV.md)** for every variable, where to get credentials, and production checklist.

## Health check

`GET /api/health`

```json
{
  "status": "ok",
  "message": "all okay",
  "service": "love-call-nestjs-api",
  "database": "ok",
  "timestamp": "2026-06-14T12:00:00.000Z"
}
```

If MySQL is down, returns `503` with `"status": "error"`.

## Auth

- **Boys app:** `POST /api/auth/quick-login` with `{ name, device_id }` — no OTP
- **Girls app:** `POST /api/auth/host/login` with `{ username, password }` — admin-created accounts only

## Billing rules

- **Only the boy (caller) pays** — girl wallet is never debited
- **New user offer** — **1 free minute** per unique `device_id` + `fcm_token` pair (one time only)
- **After free minute** — extra talk time is charged from wallet; recharge required for future calls on same device/token
- **Rate** — creator selects earning tier ₹6 / ₹12 / ₹18 / ₹24 per minute before going Available
- **Promoted creators** — earn **60%** of the boy billing rate (`promoted_commission_percentage=40`)
- **Standard creators** — earn **50%** by default (`standard_commission_percentage=50`)
- **Minutes** — billed per full minute, rounded up (`Math.ceil`); minimum 1 minute per call

## Recharge packs (boys)

| User Pays | Wallet Credit |
|----------:|--------------:|
| ₹36 | ₹36 |
| ₹60 | ₹60 |
| ₹300 | ₹312 (+₹12 bonus) |
| ₹600 | ₹636 (+₹36 bonus) |
| ₹1200 | ₹1260 (+₹60 bonus) |
| ₹1800 | ₹1896 (+₹96 bonus) |
| ₹2400 | ₹2556 (+₹156 bonus) |

## Creator flow

```
Select Rate (6/12/18/24)
→ Available
→ Receive Call
→ Talk
→ Call End
→ Boy Wallet Deduct
→ Creator Wallet Credit
→ Weekly leaderboard update
→ Admin promotes top creators
→ Promoted creators earn 60%
```

## Admin API

All `/api/admin/*` routes require header: `X-Admin-Key: <ADMIN_API_KEY>`

## Key modules

- **auth** — quick login for boys
- **host-auth** — username/password for female hosts
- **calls** — call lifecycle + Zego tokens
- **wallet** — balance, recharge, transactions
- **earnings / withdraw** — host payouts
- **admin** — dashboard, users, hosts, calls, withdrawals, settings
