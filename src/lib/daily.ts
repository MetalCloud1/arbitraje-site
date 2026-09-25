// Desafío diario del index: un problema táctico y una trivia arbitral,
// mostrados lado a lado. Es deliberadamente simple -- una sola fila en la
// base (ver migrations/0007_daily_challenge.sql), sin usuarios, sin login,
// sin contar respuestas. Se edita a mano desde /admin/diario cuando el admin
// quiere (por ejemplo, la jugada brillante de un GM ese mismo día).
//
// La validación de la posición/solución y de la trivia es EXACTAMENTE la
// misma que usan los widgets de artículos (src/lib/widgets/schema.ts), así
// no hay dos lugares distintos donde un FEN o una trivia mal armada puedan
// colarse.

import { normalizeWidget, renderWidgetElement, type RawWidget } from './widgets/schema';

export interface DailyChallengeRow {
  id: 1;
  puzzle_fen: string;
  puzzle_solution: string;
  puzzle_caption: string | null;
  puzzle_hint: string | null;
  quiz_json: string;
  updated_at: string;
}

export interface DailyChallenge {
  updatedAt: string;
  /** HTML ya armado del <figure data-widget="chess-puzzle" …>, listo para pegar en el index. */
  puzzleHtml: string;
  /** HTML ya armado del <figure data-widget="quiz" …>. */
  quizHtml: string;
  /** Los mismos campos crudos, para precargar el formulario del admin. */
  raw: {
    fen: string;
    solution: string;
    caption: string;
    hint: string;
    quiz: string;
  };
}

function toChallenge(row: DailyChallengeRow): DailyChallenge {
  // Los datos ya se validaron al guardarlos (ver saveDailyChallenge), así que
  // acá renormalizar solo puede fallar si alguien edita la fila a mano
  // directamente en D1; en ese caso preferimos reventar con un error claro
  // en el build/render antes que servir un widget a medio armar.
  const puzzle = normalizeWidget('chess-puzzle', {
    fen: row.puzzle_fen,
    solution: row.puzzle_solution,
    caption: row.puzzle_caption,
    hint: row.puzzle_hint,
  });
  if (!puzzle.ok) throw new Error(`daily_challenge: el problema guardado ya no es válido: ${puzzle.error}`);

  const quiz = normalizeWidget('quiz', { quiz: row.quiz_json });
  if (!quiz.ok) throw new Error(`daily_challenge: la trivia guardada ya no es válida: ${quiz.error}`);

  return {
    updatedAt: row.updated_at,
    puzzleHtml: renderWidgetElement('chess-puzzle', puzzle.attrs, puzzle.fallback, 'daily-widget'),
    quizHtml: renderWidgetElement('quiz', quiz.attrs, quiz.fallback, 'daily-widget'),
    raw: {
      fen: row.puzzle_fen,
      solution: row.puzzle_solution,
      caption: row.puzzle_caption ?? '',
      hint: row.puzzle_hint ?? '',
      quiz: row.quiz_json,
    },
  };
}

/** Lee el desafío del día. `null` solo puede pasar si la migración 0007 no corrió. */
export async function getDailyChallenge(db: D1Database): Promise<DailyChallenge | null> {
  const row = await db.prepare('SELECT * FROM daily_challenge WHERE id = 1').first<DailyChallengeRow>();
  if (!row) return null;
  return toChallenge(row);
}

export interface DailyChallengeInput {
  fen: string;
  solution: string;
  caption: string;
  hint: string;
  /** JSON de la trivia, con la misma forma que espera el widget "quiz" (ver Quiz en schema.ts). */
  quiz: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Valida y guarda el desafío del día. Reusa normalizeWidget con el mismo
 * esquema que valida un widget insertado en un artículo, así el admin recibe
 * el mismo tipo de error ("La jugada nº 2 es ilegal…") y nunca se guarda un
 * FEN roto o una trivia con una respuesta correcta fuera de rango.
 */
export async function saveDailyChallenge(db: D1Database, input: DailyChallengeInput): Promise<SaveResult> {
  const raw: RawWidget = { fen: input.fen, solution: input.solution, caption: input.caption, hint: input.hint };
  const puzzle = normalizeWidget('chess-puzzle', raw);
  if (!puzzle.ok) return { ok: false, error: `Problema diario: ${puzzle.error}` };

  const quiz = normalizeWidget('quiz', { quiz: input.quiz });
  if (!quiz.ok) return { ok: false, error: `Problema arbitral: ${quiz.error}` };

  await db
    .prepare(
      `INSERT INTO daily_challenge (id, puzzle_fen, puzzle_solution, puzzle_caption, puzzle_hint, quiz_json, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (id) DO UPDATE SET
         puzzle_fen = excluded.puzzle_fen,
         puzzle_solution = excluded.puzzle_solution,
         puzzle_caption = excluded.puzzle_caption,
         puzzle_hint = excluded.puzzle_hint,
         quiz_json = excluded.quiz_json,
         updated_at = excluded.updated_at`
    )
    .bind(puzzle.attrs.fen, puzzle.attrs.solution, puzzle.attrs.caption ?? null, puzzle.attrs.hint ?? null, quiz.attrs.quiz)
    .run();

  return { ok: true };
}
