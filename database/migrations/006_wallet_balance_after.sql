-- Legacy Love Call DB may have balance_after NOT NULL without default.
-- Ensure column exists and inserts from the API always set it explicitly.

ALTER TABLE wallet_transactions
  ADD COLUMN balance_after INT NULL AFTER amount;

ALTER TABLE wallet_transactions
  MODIFY COLUMN balance_after INT NULL;
