CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'expense',
  color TEXT,
  icon TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO categories (id, name, kind, color, icon) VALUES
  ('cat-water', 'Agua', 'utility', '#38bdf8', '💧'),
  ('cat-electricity', 'Luz', 'utility', '#facc15', '💡'),
  ('cat-heating', 'Calefacción', 'utility', '#fb923c', '🔥'),
  ('cat-supermarket', 'Supermercado', 'expense', '#34d399', '🛒'),
  ('cat-gas', 'Gas', 'utility', '#a78bfa', '🧯'),
  ('cat-internet', 'Internet', 'utility', '#60a5fa', '🌐'),
  ('cat-other', 'Otros', 'expense', '#94a3b8', '📌');
