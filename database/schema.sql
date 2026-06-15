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
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
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
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_languages_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO languages (name, code, is_active) VALUES
  ('English',    'en',    1),
  ('Hindi',      'hi',    1),
  ('Spanish',    'es',    1),
  ('French',     'fr',    1),
  ('Arabic',     'ar',    1),
  ('Portuguese', 'pt',    1),
  ('Bengali',    'bn',    1),
  ('Punjabi',    'pa',    1),
  ('Tamil',      'ta',    1),
  ('Telugu',     'te',    1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);

-- -------------------------------------------------------------
-- Wallets (one per user)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wallets (
  id         INT            NOT NULL AUTO_INCREMENT,
  user_id    INT            NOT NULL,
  balance    DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  currency   VARCHAR(10)    NOT NULL DEFAULT 'INR',
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
  agora_channel       VARCHAR(255)   NOT NULL,
  rate_per_minute     DECIMAL(8,2)   NOT NULL DEFAULT 0.00,
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
  ('commission_percentage', '40'),
  ('default_host_rate',     '10')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
