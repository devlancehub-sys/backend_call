# Love Call Backend

NestJS API for the Love Call voice platform.

## Setup

```bash
cd backend
npm install
cp .env.example .env   # edit DB + JWT + Zego credentials
npm run db:setup       # creates MySQL schema
npm run start:dev      # http://localhost:3000/api
```

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
- **Rate** — based on host level (₹10–₹18/min from total completed calls)
- **Split** — host earns 60%, platform keeps 40% (`COMMISSION_PERCENTAGE=40`)
- **Minutes** — billed per full minute, rounded up (`Math.ceil`); minimum 1 minute per call

## Admin API

All `/api/admin/*` routes require header: `X-Admin-Key: <ADMIN_API_KEY>`

## Key modules

- **auth** — quick login for boys
- **host-auth** — username/password for female hosts
- **calls** — call lifecycle + Zego tokens
- **wallet** — balance, recharge, transactions
- **earnings / withdraw** — host payouts
- **admin** — dashboard, users, hosts, calls, withdrawals, settings
