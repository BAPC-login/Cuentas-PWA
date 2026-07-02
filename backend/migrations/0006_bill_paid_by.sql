ALTER TABLE bills ADD COLUMN paid_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_bills_paid_by ON bills(paid_by_user_id);

UPDATE bills
SET paid_by_user_id = COALESCE(created_by, (SELECT id FROM users WHERE role = 'owner' ORDER BY created_at LIMIT 1))
WHERE paid_by_user_id IS NULL;
