-- Directorio de clubes de ajedrez. Vive separado de entrenadores (que ya
-- cubre a maestros individuales) y de la futura sección de cursos digitales
-- de pago (que no toca esta tabla en absoluto -- ver conversación de
-- diseño: es una pieza deliberadamente aislada del resto).
--
-- Igual que arbitros/entrenadores: se puebla a mano desde /admin. El
-- formulario público en /clubes/postular NO escribe acá -- solo manda un
-- correo para revisión humana (mismo patrón que /api/postular.ts).
--
-- pais es de una lista fija (México, Latinoamérica y España -- ver
-- lib/paises.ts), no texto libre: así los chips de filtro del directorio
-- salen limpios (sin "México"/"mexico"/"MX" como si fueran países
-- distintos). direccion, en cambio, sí es texto libre: normalizar
-- estado/provincia/ciudad no vale la pena para un directorio internacional
-- donde ese nivel ni siquiera es un concepto consistente entre países.
--
-- dias_imparte es CSV de los valores de DIAS_SEMANA (lib/clubes.ts), p.ej.
-- "Lunes,Miércoles,Viernes". No se filtra por día en el directorio público,
-- así que no amerita su propia tabla de relación.
CREATE TABLE IF NOT EXISTS clubes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slug              TEXT UNIQUE NOT NULL,
  nombre            TEXT NOT NULL,
  pais              TEXT NOT NULL,
  direccion         TEXT,
  telefono          TEXT,
  whatsapp          TEXT,
  email             TEXT,
  sitio_web         TEXT,
  dias_imparte      TEXT,
  modalidad         TEXT NOT NULL DEFAULT 'presencial',
  logo_key          TEXT,
  bio               TEXT,
  actividad         TEXT NOT NULL DEFAULT 'activo',
  orden_destacado   INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clubes_slug ON clubes(slug);
CREATE INDEX IF NOT EXISTS idx_clubes_nombre ON clubes(nombre);
CREATE INDEX IF NOT EXISTS idx_clubes_pais ON clubes(pais);
CREATE INDEX IF NOT EXISTS idx_clubes_orden_destacado ON clubes(orden_destacado);
