-- Desafío diario del index: un tablero ("Problema Diario") y una trivia
-- ("Problema Arbitral") lado a lado. A propósito NO es un banco de posiciones
-- con rotación automática ni guarda intentos/respuestas de nadie: es un único
-- registro que el admin edita a mano cuando quiere (por ejemplo, la jugada
-- brillante de un GM ese mismo día), sin login de usuarios ni lógica de
-- conteo. El CHECK (id = 1) fuerza que exista como máximo una fila: guardar
-- es siempre "reemplazar la fila 1", nunca acumular filas viejas.
CREATE TABLE IF NOT EXISTS daily_challenge (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  puzzle_fen      TEXT NOT NULL,
  puzzle_solution TEXT NOT NULL,
  puzzle_caption  TEXT,
  puzzle_hint     TEXT,
  quiz_json       TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fila inicial para que el index nunca se quede sin sección: un mate en 2
-- de manual y una pregunta arbitral básica, hasta que se edite desde
-- /admin/diario.
INSERT OR IGNORE INTO daily_challenge (id, puzzle_fen, puzzle_solution, puzzle_caption, puzzle_hint, quiz_json)
VALUES (
  1,
  '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
  'Ra8#',
  'Mate en 1',
  'La torre ya controla toda la fila 8.',
  '{"title":"Reglamento básico","questions":[{"q":"Un jugador toca una pieza propia sin decir antes ''compongo''/''j''adoube''. ¿Qué exige la regla \"pieza tocada\"?","options":["Debe moverla, si tiene una jugada legal con ella","No pasa nada si se arrepiente antes de soltarla","Pierde la partida directamente","Debe capturarla obligatoriamente"],"answer":0,"explain":"Artículo 4.3 del Reglamento de la FIDE: si es su turno y toca deliberadamente una pieza propia, debe moverla si tiene alguna jugada legal con ella."}]}'
);
