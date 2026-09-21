-- Directorio de árbitros mexicanos. Se puebla a mano desde /admin
-- después de que un humano revisa el correo que llega del formulario
-- de registro/reclamación (ver src/pages/api/postular-arbitro.ts) --
-- no hay alta automática.
--
-- "actividad" y "reclamado_en" son dos cosas independientes:
--   - actividad: si el árbitro sigue en ejercicio (editorial, lo decide
--     el dueño del sitio). Por ahora todos entran como 'activo'.
--   - reclamado_en: NULL mientras el perfil lo cargó el admin sin que
--     la persona real lo haya verificado todavía. Se llena con la
--     fecha cuando el admin confirma la identidad manualmente.
CREATE TABLE IF NOT EXISTS arbitros (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slug              TEXT UNIQUE NOT NULL,
  nombre_completo   TEXT NOT NULL,
  estado_republica  TEXT,
  titulo            TEXT,
  fide_id           TEXT,
  foto_key          TEXT,
  email             TEXT,
  bio               TEXT,
  actividad         TEXT NOT NULL DEFAULT 'activo',
  reclamado_en      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_arbitros_slug ON arbitros(slug);
CREATE INDEX IF NOT EXISTS idx_arbitros_nombre ON arbitros(nombre_completo);

-- Corte preventivo de envíos de Resend: un contador propio, revisado
-- ANTES de llamar a la API, para nunca acercarnos al límite del plan
-- (3000/mes) sin depender de que el proveedor nos avise.
CREATE TABLE IF NOT EXISTS email_quota (
  month_key TEXT PRIMARY KEY,
  count     INTEGER NOT NULL DEFAULT 0
);
