# Backend environment variables

Copy the template and fill in your values:

```bash
cd backend
cp .env.example .env
```

Never commit `.env` or real secrets to git.

---

## ZEGOCLOUD (required for calls to work)

Voice calls use [ZEGOCLOUD](https://www.zegocloud.com/). The backend mints room tokens; Flutter apps only receive the public App ID.

| Variable | Required | Description |
|----------|----------|-------------|
| `ZEGOCLOUD_APP_ID` | Yes | Numeric App ID from ZEGOCLOUD Console → Project → App settings |
| `ZEGOCLOUD_SERVER_SECRET` | Yes | Exactly **32 hex characters**. From Console → ServerSecret. **Never** put this in boys_app or girls_app |
| `ZEGOCLOUD_TOKEN_TTL_SECONDS` | No | Token lifetime in seconds. Default: `3600` (1 hour) |

```env
ZEGOCLOUD_APP_ID=1234567890
ZEGOCLOUD_SERVER_SECRET=00000000000000000000000000000000
ZEGOCLOUD_TOKEN_TTL_SECONDS=3600
```

If `ZEGOCLOUD_APP_ID` is `0` or the secret is not 32 chars, call APIs return *"ZEGOCLOUD is not configured"*.

---

## Database (MySQL)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | Yes | `localhost` | MySQL host |
| `DB_PORT` | No | `3306` | MySQL port |
| `DB_USER` | Yes | `root` | MySQL user |
| `DB_PASSWORD` | Yes | — | MySQL password |
| `DB_NAME` | Yes | `love_call` | Database name |
| `DB_POOL_SIZE` | No | `5` | Connection pool size |

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=lovecall
```

**Railway / Render:** these platforms often expose `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE` instead. The backend reads those as fallbacks.

Apply schema:

```bash
npm run db:setup
```

---

## JWT (auth tokens)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | Access token signing secret (use a long random string in production) |
| `JWT_EXPIRES_IN` | No | `15m` | Access token TTL |
| `JWT_REFRESH_SECRET` | Yes | — | Refresh token signing secret (different from `JWT_SECRET`) |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token TTL |

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_REFRESH_EXPIRES_IN=7d
```

Used by REST auth and WebSocket handshake (`socket.gateway.ts`).

---

## Firebase (FCM push — background incoming calls on girls_app)

When the host app is backgrounded, the server sends a push via Firebase Cloud Messaging (HTTP v1).

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Yes* | Must match `project_id` in `girls_app/android/app/google-services.json` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes* | Minified service-account JSON on **one line** |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Alt | Path to the downloaded `.json` file instead of inline JSON |
| `FIREBASE_SERVER_KEY` | Legacy | Old server key — deprecated; use service account instead |

```env
FIREBASE_PROJECT_ID=audiocallgirls
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

**How to get the service account (not the same as `google-services.json`):**

1. [Firebase Console](https://console.firebase.google.com/) → your project  
2. Project settings → **Service accounts**  
3. **Generate new private key** → download JSON  
4. Minify to one line, or set `FIREBASE_SERVICE_ACCOUNT_PATH=./your-key.json`

\* At least one of `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH` is required for push to work.

---

## Platform & admin

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COMMISSION_PERCENTAGE` | No | `40` | Platform cut (%). Host earns `100 - COMMISSION_PERCENTAGE` |
| `DEFAULT_HOST_RATE` | No | `10` | Default per-minute rate (₹) for new hosts |
| `ADMIN_API_KEY` | Yes (prod) | `local-admin-key` | Protects `/api/admin/*`. Must match `adminApiKey` in `admin/src/environments/environment.ts` |
| `PUBLIC_API_URL` | No | — | Public API base URL (e.g. `https://api.talkymate.in`) |

```env
COMMISSION_PERCENTAGE=40
DEFAULT_HOST_RATE=10
ADMIN_API_KEY=local-admin-key
PUBLIC_API_URL=https://api.talkymate.in
```

Admin requests need header: `X-Admin-Key: <ADMIN_API_KEY>`.

---

## Server & runtime (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Set to `production` on deploy |
| `ENABLE_SWAGGER` | off in prod | Set `true` to expose Swagger in production |
| `HOST_ACCESS_KEY_EXPIRES_DAYS` | `90` | Host access key validity |
| `SOCKET_OFFLINE_GRACE_MS` | `3000` | Grace before marking user offline |
| `SOCKET_DB_SYNC_MS` | `5000` | Debounce for DB presence sync |
| `SOCKET_STALE_SWEEP_MS` | `60000` | Stale session sweep interval |

```env
PORT=3000
NODE_ENV=development
```

---

## Minimal production checklist

- [ ] `ZEGOCLOUD_APP_ID` + 32-char `ZEGOCLOUD_SERVER_SECRET`
- [ ] MySQL `DB_*` vars (or platform `MYSQL*` vars)
- [ ] Strong unique `JWT_SECRET` and `JWT_REFRESH_SECRET`
- [ ] `FIREBASE_PROJECT_ID` + service account for girls_app push
- [ ] `ADMIN_API_KEY` changed from default; same value in admin panel env
- [ ] `NODE_ENV=production`

## Related files

- Template: [`.env.example`](./.env.example)
- Admin panel key: [`admin/src/environments/environment.ts`](../admin/src/environments/environment.ts)
- Setup guide: [`README.md`](./README.md)
