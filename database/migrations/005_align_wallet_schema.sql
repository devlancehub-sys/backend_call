-- Align production DB with Premium Status wallet/recharge schema.
-- Safe to re-run: duplicate column errors are ignored by scripts/migrate.js

ALTER TABLE wallet_transactions
  ADD COLUMN description VARCHAR(255) NULL AFTER amount;

ALTER TABLE wallet_transactions
  ADD COLUMN reference_type VARCHAR(50) NULL AFTER description;

ALTER TABLE wallet_transactions
  ADD COLUMN reference_id INT NULL AFTER reference_type;

ALTER TABLE recharge_history
  ADD COLUMN razorpay_payment_id VARCHAR(255) NULL AFTER razorpay_order_id;
