-- Scope for compound expenses
ALTER TABLE operations ADD COLUMN is_permanent INTEGER DEFAULT 0;

-- Installment metadata for bills
ALTER TABLE bills ADD COLUMN installment_group_id TEXT;
ALTER TABLE bills ADD COLUMN installment_index INTEGER;
ALTER TABLE bills ADD COLUMN installment_count INTEGER;
ALTER TABLE bills ADD COLUMN installment_total_amount INTEGER;
