ALTER TABLE bills ADD COLUMN operation_id TEXT;
ALTER TABLE receipts ADD COLUMN bill_id TEXT;

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category_id TEXT NOT NULL,
  service_month TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bills_operation ON bills(operation_id);
CREATE INDEX IF NOT EXISTS idx_operations_month ON operations(service_month);
