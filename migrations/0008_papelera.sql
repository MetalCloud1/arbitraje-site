-- Papelera (soft delete) para artículos, árbitros, entrenadores y clubes.
--
-- En vez de borrar la fila, se marca con la fecha en deleted_at. Mientras sea
-- NULL el contenido es visible; con fecha, queda oculto en el sitio (y su URL
-- responde 410) pero se puede restaurar. El borrado definitivo solo existe en
-- la zona restringida del admin y solo para filas que ya están en la papelera.
--
-- Es una columna nueva y nullable: no toca ni modifica datos existentes, y el
-- código anterior sigue funcionando igual si esta migración se corre primero.
--
-- IMPORTANTE: correr esto ANTES de desplegar el código nuevo (el código nuevo
-- consulta deleted_at y fallaría sin la columna). No es re-ejecutable:
-- SQLite no tiene "ADD COLUMN IF NOT EXISTS", un segundo intento falla con
-- "duplicate column name" sin dañar nada.

ALTER TABLE articles     ADD COLUMN deleted_at TEXT;
ALTER TABLE arbitros     ADD COLUMN deleted_at TEXT;
ALTER TABLE entrenadores ADD COLUMN deleted_at TEXT;
ALTER TABLE clubes       ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_articles_deleted     ON articles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_arbitros_deleted     ON arbitros(deleted_at);
CREATE INDEX IF NOT EXISTS idx_entrenadores_deleted ON entrenadores(deleted_at);
CREATE INDEX IF NOT EXISTS idx_clubes_deleted       ON clubes(deleted_at);
