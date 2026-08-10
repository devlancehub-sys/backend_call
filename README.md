# Premium Status Backend

NestJS API for the Premium Video Status mobile app.

## Setup

```bash
npm install
cp .env.example .env   # edit DB, JWT, Razorpay, R2 credentials
npm run migrate        # applies database/migrations/*.sql
npm run start:dev      # http://localhost:3000/api
```

Production deploy runs migrations automatically via `npm run start:deploy`.

## Health check

`GET /api/health`

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-08-10T12:00:00.000Z",
  "service": "premium-status-api"
}
```

## Auth

- **Mobile app:** `POST /api/auth/register-device` with `{ "deviceId": "..." }`

## Key modules

- **auth** — device registration + JWT
- **app-config** — `girlsVersion` sync for mobile cache
- **girls** — creator list and profile
- **videos** — unlock and access check
- **wallet** — balance, Razorpay recharge, history
- **admin** — dashboard, creators, uploads, users, transactions

See project root `docs/API.md` for full endpoint documentation.
