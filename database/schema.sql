-- =============================================================
-- Railway MySQL Schema — backend_call (NestJS)
-- Run once against an empty `railway` database:
--   mysql -h HOST -u USER -p railway < database/schema.sql
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- -------------------------------------------------------------
-- Core user accounts (male callers + female hosts + admins)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              INT           NOT NULL AUTO_INCREMENT,
  phone           VARCHAR(20)   NULL,
  role            ENUM('male','female','admin') NOT NULL DEFAULT 'male',
  name            VARCHAR(100)  NULL,
  username        VARCHAR(50)   NULL,
  email           VARCHAR(100)  NULL,
  password_hash   VARCHAR(255)  NULL,
  device_id       VARCHAR(255)  NULL,
  fcm_token       VARCHAR(500)  NULL,
  age             TINYINT       NULL,
  avatar_url      VARCHAR(500)  NULL,
  about           TEXT          NULL,
  is_online       TINYINT(1)    NOT NULL DEFAULT 0,
  status          ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  last_seen_at    DATETIME      NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone    (phone),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Languages
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS languages (
  id         INT          NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  code       VARCHAR(10)  NOT NULL,
  status     ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_languages_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO languages (name, code, status) VALUES
  ('English',    'en',    'active'),
  ('Hindi',      'hi',    'active'),
  ('Spanish',    'es',    'active'),
  ('French',     'fr',    'active'),
  ('Arabic',     'ar',    'active'),
  ('Portuguese', 'pt',    'active'),
  ('Bengali',    'bn',    'active'),
  ('Punjabi',    'pa',    'active'),
  ('Tamil',      'ta',    'active'),
  ('Telugu',     'te',    'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

-- -------------------------------------------------------------
-- Wallets (one per user)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id         INT            NOT NULL AUTO_INCREMENT,
  user_id    INT            NOT NULL,
  balance    DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  currency   VARCHAR(10)    NOT NULL DEFAULT 'INR',
  status     ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallets_user (user_id),
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Wallet transactions ledger
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            INT            NOT NULL AUTO_INCREMENT,
  user_id       INT            NOT NULL,
  type          VARCHAR(50)    NOT NULL,
  amount        DECIMAL(12,2)  NOT NULL,
  balance_after DECIMAL(12,2)  NOT NULL,
  payment_gateway VARCHAR(50)  NULL,
  payment_id    VARCHAR(100)   NULL,
  status        VARCHAR(20)    NOT NULL DEFAULT 'completed',
  description   VARCHAR(255)   NULL,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wt_user (user_id),
  CONSTRAINT fk_wt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Refresh tokens
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INT          NOT NULL AUTO_INCREMENT,
  user_id    INT          NOT NULL,
  token      TEXT         NOT NULL,
  device_id  VARCHAR(255) NULL,
  expires_at DATETIME     NOT NULL,
  status     ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rt_user (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Female host profiles
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS female_hosts (
  id                     INT            NOT NULL AUTO_INCREMENT,
  user_id                INT            NOT NULL,
  rate_per_minute        DECIMAL(8,2)   NOT NULL DEFAULT 10.00,
  rating                 DECIMAL(3,2)   NOT NULL DEFAULT 0.00,
  total_calls            INT            NOT NULL DEFAULT 0,
  total_duration_seconds INT            NOT NULL DEFAULT 0,
  is_featured            TINYINT(1)     NOT NULL DEFAULT 0,
  kyc_status             ENUM('pending','submitted','approved','rejected') NOT NULL DEFAULT 'pending',
  status                 ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  created_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fh_user (user_id),
  CONSTRAINT fk_fh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- User ↔ Language mapping
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_languages (
  user_id     INT NOT NULL,
  language_id INT NOT NULL,
  status      ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  PRIMARY KEY (user_id, language_id),
  CONSTRAINT fk_ul_user     FOREIGN KEY (user_id)     REFERENCES users     (id) ON DELETE CASCADE,
  CONSTRAINT fk_ul_language FOREIGN KEY (language_id) REFERENCES languages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Favorites (male users bookmarking female hosts)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INT      NOT NULL,
  host_id    INT      NOT NULL,
  status     ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, host_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_host FOREIGN KEY (host_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Calls
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calls (
  id                  INT            NOT NULL AUTO_INCREMENT,
  caller_id           INT            NOT NULL,
  host_id             INT            NOT NULL,
  initiated_by        ENUM('male','female') NOT NULL DEFAULT 'male',
  room_id             VARCHAR(255)   NOT NULL,
  rate_per_minute     DECIMAL(8,2)   NOT NULL DEFAULT 0.00,
  is_free_call        TINYINT(1)     NOT NULL DEFAULT 0,
  free_call_device_id VARCHAR(255)   NULL,
  free_call_fcm_token VARCHAR(500)   NULL,
  status              ENUM('ringing','active','ended','rejected','missed') NOT NULL DEFAULT 'ringing',
  started_at          DATETIME       NULL,
  ended_at            DATETIME       NULL,
  duration_seconds    INT            NOT NULL DEFAULT 0,
  amount_deducted     DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  host_earning        DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  platform_commission DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_calls_caller (caller_id),
  KEY idx_calls_host   (host_id),
  CONSTRAINT fk_calls_caller FOREIGN KEY (caller_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_calls_host   FOREIGN KEY (host_id)   REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- One-time free minute per device_id + fcm_token pair
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS free_call_redemptions (
  id         INT          NOT NULL AUTO_INCREMENT,
  device_id  VARCHAR(255) NOT NULL,
  fcm_token  VARCHAR(500) NOT NULL,
  user_id    INT          NULL,
  call_id    INT          NULL,
  used_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_free_call_device_token (device_id, fcm_token),
  KEY idx_free_call_user (user_id),
  CONSTRAINT fk_free_call_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_free_call_call FOREIGN KEY (call_id) REFERENCES calls (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Call logs (immutable billing record per call)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS call_logs (
  id               INT           NOT NULL AUTO_INCREMENT,
  call_id          INT           NOT NULL,
  caller_id        INT           NOT NULL,
  host_id          INT           NOT NULL,
  duration_seconds INT           NOT NULL DEFAULT 0,
  amount_deducted  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  host_earning     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status           ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cl_call   (call_id),
  KEY idx_cl_caller (caller_id),
  KEY idx_cl_host   (host_id),
  CONSTRAINT fk_cl_call   FOREIGN KEY (call_id)   REFERENCES calls (id) ON DELETE CASCADE,
  CONSTRAINT fk_cl_caller FOREIGN KEY (caller_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_cl_host   FOREIGN KEY (host_id)   REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Host earnings
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS earnings (
  id          INT           NOT NULL AUTO_INCREMENT,
  host_id     INT           NOT NULL,
  call_id     INT           NULL,
  amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  type        VARCHAR(50)   NOT NULL DEFAULT 'call',
  description VARCHAR(255)  NULL,
  status      ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_earnings_host (host_id),
  CONSTRAINT fk_earnings_host FOREIGN KEY (host_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_earnings_call FOREIGN KEY (call_id) REFERENCES calls (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Withdrawal requests
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS withdraw_requests (
  id           INT           NOT NULL AUTO_INCREMENT,
  host_id      INT           NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  method       VARCHAR(50)   NOT NULL DEFAULT 'upi',
  account_details JSON       NULL,
  status       ENUM('pending','processing','completed','rejected') NOT NULL DEFAULT 'pending',
  processed_at DATETIME      NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wr_host (host_id),
  CONSTRAINT fk_wr_host FOREIGN KEY (host_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- KYC documents
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_documents (
  id           INT          NOT NULL AUTO_INCREMENT,
  user_id      INT          NOT NULL,
  type         VARCHAR(50)  NOT NULL,
  document_url VARCHAR(500) NOT NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note   TEXT         NULL,
  verified_at  DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kyc_user_type (user_id, type),
  CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Platform settings (key/value store for admin-configurable values)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key   VARCHAR(100) NOT NULL,
  setting_value TEXT         NOT NULL,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (setting_key, setting_value) VALUES
  ('commission_percentage', '50'),
  ('promoted_commission_percentage', '50'),
  ('standard_commission_percentage', '50'),
  ('default_host_rate', '6')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- -------------------------------------------------------------
-- Promo codes (user-specific or general, single-use)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_codes (
  id              INT            NOT NULL AUTO_INCREMENT,
  promo_code      VARCHAR(50)    NOT NULL,
  user_id         INT            NULL,
  discount_value  DECIMAL(12,2)  NOT NULL,
  expiry_date     DATETIME       NOT NULL,
  is_used         TINYINT(1)     NOT NULL DEFAULT 0,
  used_at         DATETIME       NULL,
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_promo_code (promo_code),
  KEY idx_promo_user (user_id),
  CONSTRAINT fk_promo_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Promo code redemption audit log
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id              INT            NOT NULL AUTO_INCREMENT,
  promo_code_id   INT            NOT NULL,
  user_id         INT            NOT NULL,
  promo_code      VARCHAR(50)    NOT NULL,
  discount_value  DECIMAL(12,2)  NOT NULL,
  redeemed_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pcr_user (user_id),
  KEY idx_pcr_code (promo_code_id),
  CONSTRAINT fk_pcr_promo FOREIGN KEY (promo_code_id) REFERENCES promo_codes (id) ON DELETE CASCADE,
  CONSTRAINT fk_pcr_user   FOREIGN KEY (user_id)       REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- Host login access keys (long-lived session tokens for girls app)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS host_access_keys (
  id              INT            NOT NULL AUTO_INCREMENT,
  user_id         INT            NOT NULL,
  access_key      VARCHAR(255)   NOT NULL,
  expires_at      DATETIME       NOT NULL,
  profile_version INT            NOT NULL DEFAULT 1,
  status          ENUM('inactive','active','disabled') NOT NULL DEFAULT 'active',
  created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hak_user (user_id),
  UNIQUE KEY uq_hak_key  (access_key),
  CONSTRAINT fk_hak_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
