-- Orden manual opcional para el directorio público. NULL (la inmensa
-- mayoría) = orden alfabético normal, como hasta ahora. Si el admin le
-- pone un número, ese árbitro se muestra antes que los alfabéticos,
-- ordenado ascendente contra otros árbitros también destacados (1 antes
-- que 2, etc). Es una decisión editorial explícita, no un ranking
-- automático de ningún tipo.
ALTER TABLE arbitros ADD COLUMN orden_destacado INTEGER;

CREATE INDEX IF NOT EXISTS idx_arbitros_orden_destacado ON arbitros(orden_destacado);
