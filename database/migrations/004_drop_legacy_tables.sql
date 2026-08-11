-- Drop legacy / unused tables (Love Call etc.) — keep Premium Status tables only.
-- Safer: run `npm run db:cleanup` which lists tables first, then CONFIRM=1 to drop.
--
-- Manual Railway Query (preview):
--   SHOW TABLES;
--
-- Then drop only tables NOT in this list:
--   users, devices, wallets, wallet_transactions, girls, videos,
--   video_unlocks, recharge_history, admins, app_settings, schema_migrations

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS hosts;
DROP TABLE IF EXISTS host_profiles;
DROP TABLE IF EXISTS host_media;
DROP TABLE IF EXISTS host_photos;
DROP TABLE IF EXISTS host_availability;
DROP TABLE IF EXISTS host_earnings;
DROP TABLE IF EXISTS host_wallets;
DROP TABLE IF EXISTS calls;
DROP TABLE IF EXISTS call_sessions;
DROP TABLE IF EXISTS call_logs;
DROP TABLE IF EXISTS call_history;
DROP TABLE IF EXISTS call_events;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS otp_codes;
DROP TABLE IF EXISTS otp_verifications;
DROP TABLE IF EXISTS zego_tokens;
DROP TABLE IF EXISTS zego_rooms;
DROP TABLE IF EXISTS boys;
DROP TABLE IF EXISTS boy_profiles;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS withdrawals;
DROP TABLE IF EXISTS transactions;

SET FOREIGN_KEY_CHECKS = 1;
