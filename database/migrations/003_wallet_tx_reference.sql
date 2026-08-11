-- Add missing wallet transaction reference columns (older production DBs)
ALTER TABLE wallet_transactions
  ADD COLUMN reference_type VARCHAR(50) NULL;

ALTER TABLE wallet_transactions
  ADD COLUMN reference_id INT NULL;
