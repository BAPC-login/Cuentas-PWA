ALTER TABLE bills ADD COLUMN service_month TEXT;
ALTER TABLE receipts ADD COLUMN service_month TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_bills_service_month ON bills(service_month);

UPDATE bills
SET service_month = substr(bill_date, 1, 7)
WHERE service_month IS NULL;

UPDATE receipts
SET service_month = substr(COALESCE(detected_date, created_at), 1, 7)
WHERE service_month IS NULL;
