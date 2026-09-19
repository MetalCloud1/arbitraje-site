-- Directorio de entrenadores de ajedrez. Mismo espíritu que 0003_arbitros.sql:
-- se puebla a mano desde /admin, sin alta pública automática.
--
-- Acá el título y el ELO son el dato central (a diferencia de árbitros,
-- donde el título es casi el único "credencial"). Por eso:
--   - titulo_ajedrez: título FIDE/federativo de jugador (GM, WGM, IM, WIM,
--     FM, WFM, CM, WCM, NM, WNM). Es independiente de titulo_arbitraje.
--   - titulo_arbitraje: mismos valores que arbitros.titulo (Árbitro
--     Internacional, FIDE, Nacional, de Club). Muchos entrenadores también
--     son árbitros titulados, y ambos títulos se muestran juntos cuando
--     aplica -- no son excluyentes.
--   - elo_clasico: ÚNICAMENTE clásico (no rápidas ni blitz). Es lo que
--     hace notable a un entrenador de un vistazo, junto con el título.
CREATE TABLE IF NOT EXISTS entrenadores (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slug              TEXT UNIQUE NOT NULL,
  nombre_completo   TEXT NOT NULL,
  estado_republica  TEXT,
  titulo_ajedrez    TEXT,
  titulo_arbitraje  TEXT,
  elo_clasico       INTEGER,
  fide_id           TEXT,
  foto_key          TEXT,
  email             TEXT,
  bio               TEXT,
  actividad         TEXT NOT NULL DEFAULT 'activo',
  reclamado_en      TEXT,
  orden_destacado   INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entrenadores_slug ON entrenadores(slug);
CREATE INDEX IF NOT EXISTS idx_entrenadores_nombre ON entrenadores(nombre_completo);
CREATE INDEX IF NOT EXISTS idx_entrenadores_orden_destacado ON entrenadores(orden_destacado);
CREATE INDEX IF NOT EXISTS idx_entrenadores_elo ON entrenadores(elo_clasico);