CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  total_amount INTEGER NOT NULL,
  bill_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bill_participants (
  bill_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  share_amount INTEGER NOT NULL,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  PRIMARY KEY (bill_id, user_id),
  FOREIGN KEY (bill_id) REFERENCES bills(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  payer_id TEXT NOT NULL,
  receiver_id TEXT,
  total_amount INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT,
  approved_at TEXT,
  FOREIGN KEY (payer_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  bill_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id),
  FOREIGN KEY (bill_id) REFERENCES bills(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  uploaded_by TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual_upload',
  status TEXT NOT NULL DEFAULT 'pending_review',
  file_name TEXT,
  file_type TEXT,
  raw_text TEXT,
  detected_amount INTEGER,
  detected_date TEXT,
  detected_sender TEXT,
  detected_receiver TEXT,
  detected_category TEXT,
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT,
  reviewed_at TEXT,
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_bill_participants_user ON bill_participants(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
