CREATE TABLE IF NOT EXISTS expense_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category_id TEXT NOT NULL,
  default_amount INTEGER,
  service_month_offset INTEGER NOT NULL DEFAULT 0,
  participant_mode TEXT NOT NULL DEFAULT 'equal',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS month_closures (
  month TEXT PRIMARY KEY,
  closed_by TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  FOREIGN KEY (closed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_expense_templates_active ON expense_templates(is_active);
