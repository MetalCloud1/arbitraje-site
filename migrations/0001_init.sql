-- Esquema inicial: tabla de articulos.
-- expires_at: si no es NULL, el articulo se borra automaticamente
-- (junto con su imagen en R2) cuando esa fecha ya paso.
CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  excerpt       TEXT,
  content_html  TEXT NOT NULL,
  cover_key     TEXT,
  read_minutes  INTEGER NOT NULL DEFAULT 5,
  published_at  TEXT NOT NULL,
  expires_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_expires ON articles(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
