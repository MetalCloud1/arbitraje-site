// Esquema de los widgets incrustables en artículos. Es la ÚNICA fuente de
// verdad sobre qué es un widget válido, y la usan los tres lados:
//   - servidor:  sanitize.ts valida y normaliza al guardar (autoridad final)
//   - editor:    el formulario del panel avisa de errores antes de insertar
//   - cliente:   el módulo de cada widget lee sus datos con el mismo parser
//
// Un widget vive en el HTML del artículo como DATOS, nunca como código:
//   <figure data-widget="chess-puzzle" data-fen="…" data-solution="…">…</figure>
// El JS que lo dibuja está en el repo (src/lib/widgets/client), versionado.
// Dentro del <figure> va un contenido alternativo (texto plano semántico) que
// sirve para el RSS, buscadores y lectores sin JavaScript.
//
// Este archivo es puro (sin DOM), así que corre igual en Workers, Node y navegador.

import { Chess, validateFen } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const WIDGET_TYPES = ['chess-board', 'chess-puzzle', 'quiz', 'embed', 'gallery'] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_LABELS: Record<WidgetType, string> = {
  'chess-board': 'Tablero',
  'chess-puzzle': 'Problema',
  quiz: 'Trivia',
  embed: 'Incrustar',
  gallery: 'Imagen / Galería',
};

export const MAX_GALLERY_IMAGES = 12;

/**
 * Sitios desde los que se permite incrustar contenido, con los prefijos de
 * ruta aceptados. Es una lista blanca cerrada: agregar un sitio nuevo es una
 * línea acá (y se refleja solo en la CSP de middleware.ts).
 */
export const EMBED_HOSTS: Record<string, readonly string[]> = {
  'lichess.org': ['/embed/', '/study/embed/', '/tv/frame', '/training/frame'],
  'www.chess.com': ['/emboard'],
  'www.youtube-nocookie.com': ['/embed/'],
  'www.youtube.com': ['/embed/'],
};

export const EMBED_RATIOS = ['16:9', '3:2', '4:3', '1:1'] as const;
export type EmbedRatio = (typeof EMBED_RATIOS)[number];

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explain?: string;
}
export interface Quiz {
  title?: string;
  questions: QuizQuestion[];
}

export interface GalleryImage {
  key: string;
  alt: string;
  caption?: string;
}

/**
 * Marcado de jugadas al estilo del análisis de Lichess/chess.com: colorea la
 * casilla de la jugada nº `ply` (1 = la primera de `moves`) y, si trae
 * `arrow`, dibuja una flecha con la alternativa sugerida.
 */
export const MOVE_MARKS = ['buena', 'imprecision', 'error', 'grave'] as const;
export type MoveMark = (typeof MOVE_MARKS)[number];
export interface MoveAnnotation {
  ply: number;
  mark: MoveMark;
  arrow?: { from: string; to: string };
}

export type WidgetProps =
  | {
      type: 'chess-board';
      fen: string;
      moves: string[];
      orientation: 'white' | 'black';
      caption?: string;
      white?: string;
      black?: string;
      annotations?: MoveAnnotation[];
    }
  | { type: 'chess-puzzle'; fen: string; solution: string[]; caption?: string; hint?: string }
  | { type: 'quiz'; quiz: Quiz }
  | { type: 'embed'; src: string; title: string; ratio: EmbedRatio }
  | { type: 'gallery'; images: GalleryImage[] };

export type WidgetResult =
  | {
      ok: true;
      props: WidgetProps;
      /** Atributos data-* canónicos (sin el prefijo "data-"), listos para guardar. */
      attrs: Record<string, string>;
      /** HTML alternativo (ya escapado) que va dentro del <figure>. */
      fallback: string;
    }
  | { ok: false; error: string };

export type RawWidget = Record<string, string | undefined | null>;

// ---------- Utilidades ----------

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

class WidgetError extends Error {}
const fail = (message: string): never => {
  throw new WidgetError(message);
};

/** Texto de una sola línea, sin caracteres de control. */
function line(value: string | null | undefined, label: string, max: number, required = false): string {
  // eslint-disable-next-line no-control-regex
  const v = (value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !v) fail(`${label} es obligatorio.`);
  if (v.length > max) fail(`${label} es demasiado largo (máximo ${max} caracteres).`);
  return v;
}

function checkFen(value: string | null | undefined, label = 'La posición (FEN)'): string {
  const fen = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!fen) fail(`${label} es obligatoria.`);
  if (fen.length > 100) fail(`${label} no es válida.`);
  const result = validateFen(fen);
  if (!result.ok) fail(`${label} no es válida: ${result.error}`);
  return fen;
}

/**
 * Forma de las claves que devuelve uploadCoverImage() (src/lib/images.ts):
 * "<prefijo>/<timestamp>-<8 hex>.<ext>". Se revalida acá (no solo se confía
 * en lo que mande el cliente) para que un data-images escrito a mano no
 * pueda apuntar a rutas arbitrarias del bucket.
 */
const IMAGE_KEY_RE = /^[a-z][a-z-]{0,20}\/\d{10,14}-[0-9a-f]{8}\.(jpg|png|webp|gif)$/;

function checkImageKey(value: string | null | undefined, label: string): string {
  const v = (value ?? '').trim();
  if (!v) fail(`${label} es obligatoria.`);
  if (!IMAGE_KEY_RE.test(v)) fail(`${label} no es válida.`);
  return v;
}

// ---------- Jugadas ----------

/**
 * Convierte texto libre con jugadas ("1. e4 e5 2. Nf3! {comentario} …") en una
 * lista de SAN: quita números, comentarios, variantes, NAG, resultados y !?.
 */
export function parseMoveList(text: string): string[] {
  let t = text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ') // encabezados PGN sueltos
    .replace(/\b0-0-0\b/g, 'O-O-O')
    .replace(/\b0-0\b/g, 'O-O');
  while (/\([^()]*\)/.test(t)) t = t.replace(/\([^()]*\)/g, ' ');
  t = t
    .replace(/\$\d+/g, ' ')
    .replace(/(^|\s)(1-0|0-1|1\/2-1\/2|\*)(?=\s|$)/g, ' ')
    .replace(/\b\d+\s*\.(\.\.)?/g, ' ');
  return t
    .split(/\s+/)
    .map((tok) => tok.replace(/[!?]+$/, ''))
    .filter(Boolean);
}

/** Reproduce las jugadas desde `fen`; devuelve el SAN canónico de cada una. */
function replay(fen: string, moves: string[], max: number): string[] {
  if (moves.length > max) fail(`Demasiadas jugadas (máximo ${max}).`);
  const game = new Chess(fen);
  const played: string[] = [];
  moves.forEach((m, i) => {
    try {
      played.push(game.move(m).san);
    } catch {
      fail(`La jugada nº ${i + 1} ("${m}") es ilegal o no se entiende en esa posición.`);
    }
  });
  return played;
}

/** "12. Nf3 Nc6 13. d4" a partir de la posición inicial y una lista de SAN. */
export function formatMovetext(fen: string, sans: string[]): string {
  const parts = fen.split(' ');
  let turn: 'w' | 'b' = parts[1] === 'b' ? 'b' : 'w';
  let number = parseInt(parts[5] ?? '1', 10) || 1;
  const out: string[] = [];
  sans.forEach((san, i) => {
    if (turn === 'w') out.push(`${number}. ${san}`);
    else out.push(i === 0 ? `${number}... ${san}` : san);
    if (turn === 'b') number++;
    turn = turn === 'w' ? 'b' : 'w';
  });
  return out.join(' ');
}

/**
 * Lee lo que pega el autor en el editor: un PGN completo (con encabezados,
 * comentarios, variantes) o una lista simple de jugadas. Si `startFen` viene
 * dado, las jugadas se leen desde esa posición.
 */
export function parseGameText(
  text: string,
  startFen?: string
): { ok: true; fen: string; moves: string[] } | { ok: false; error: string } {
  const source = text.trim();
  try {
    if (startFen && startFen.trim()) {
      const fen = checkFen(startFen);
      return { ok: true, fen, moves: parseMoveList(source) };
    }
    if (!source) return { ok: true, fen: START_FEN, moves: [] };

    const game = new Chess();
    try {
      game.loadPgn(source);
      const history = game.history({ verbose: true });
      if (history.length > 0) {
        return { ok: true, fen: history[0].before, moves: history.map((m) => m.san) };
      }
      // PGN con solo una posición (encabezado FEN) y sin jugadas.
      if (/\[\s*FEN\s+"/i.test(source)) return { ok: true, fen: game.fen(), moves: [] };
    } catch {
      /* no era PGN: se intenta como lista simple de jugadas */
    }
    return { ok: true, fen: START_FEN, moves: parseMoveList(source) };
  } catch (e) {
    return { ok: false, error: e instanceof WidgetError ? e.message : 'No se pudo leer la partida.' };
  }
}

// ---------- Marcado de jugadas (anotaciones) ----------

const SQUARE_RE = /^[a-h][1-8]$/;

/**
 * Formato compacto para el atributo data-annotations, una entrada por jugada
 * separadas por espacios: "jugada:tipo" o "jugada:tipo:origenDestino"
 * (p. ej. "7:grave:e2e4"). Mismo estilo que data-moves (SAN separado por
 * espacios): legible y fácil de diffear en el HTML guardado.
 */
function parseAnnotations(value: string | null | undefined, totalPlies: number): MoveAnnotation[] {
  const text = (value ?? '').trim();
  if (!text) return [];
  const tokens = text.split(/\s+/);
  if (tokens.length > 200) fail('Demasiadas anotaciones (máximo 200).');

  const byPly = new Map<number, MoveAnnotation>();
  for (const tok of tokens) {
    const [plyStr, markStr, squares] = tok.split(':');
    const ply = parseInt(plyStr, 10);
    if (!Number.isInteger(ply) || String(ply) !== plyStr || ply < 1 || ply > totalPlies) {
      fail(`La anotación "${tok}" señala una jugada que no existe.`);
    }
    if (!(MOVE_MARKS as readonly string[]).includes(markStr)) {
      fail(`El tipo de anotación "${markStr ?? ''}" no es válido.`);
    }
    const mark = markStr as MoveMark;

    let arrow: { from: string; to: string } | undefined;
    if (squares) {
      const from = squares.slice(0, 2);
      const to = squares.slice(2, 4);
      if (squares.length !== 4 || !SQUARE_RE.test(from) || !SQUARE_RE.test(to)) {
        fail(`La flecha de la jugada nº ${ply} no es válida (usa casillas como "e2e4").`);
      }
      arrow = { from, to };
    }
    byPly.set(ply, { ply, mark, arrow });
  }
  return Array.from(byPly.values()).sort((a, b) => a.ply - b.ply);
}

export function formatAnnotations(list: MoveAnnotation[]): string {
  return list.map((a) => `${a.ply}:${a.mark}${a.arrow ? `:${a.arrow.from}${a.arrow.to}` : ''}`).join(' ');
}

// ---------- Normalización por tipo ----------

function normalizeBoard(raw: RawWidget): WidgetResult & { ok: true } {
  const fen = raw.fen?.trim() ? checkFen(raw.fen) : START_FEN;
  const moves = replay(fen, parseMoveList(raw.moves ?? ''), 600);
  const orientation = raw.orientation === 'black' ? 'black' : 'white';
  const caption = line(raw.caption, 'El pie de tablero', 200);
  const white = line(raw.white, 'El nombre de las blancas', 60);
  const black = line(raw.black, 'El nombre de las negras', 60);
  const annotations = parseAnnotations(raw.annotations, moves.length);

  const attrs: Record<string, string> = {};
  if (fen !== START_FEN) attrs.fen = fen;
  if (moves.length) attrs.moves = moves.join(' ');
  if (orientation === 'black') attrs.orientation = 'black';
  if (caption) attrs.caption = caption;
  if (white) attrs.white = white;
  if (black) attrs.black = black;
  if (annotations.length) attrs.annotations = formatAnnotations(annotations);

  const body = moves.length
    ? `<strong>Partida:</strong> ${escapeHtml(formatMovetext(fen, moves))}`
    : `<strong>Posición (FEN):</strong> ${escapeHtml(fen)}`;
  const players = white || black ? `<p>${escapeHtml([white, black].filter(Boolean).join(' – '))}</p>` : '';
  const fallback = `${players}<p>${caption ? `<em>${escapeHtml(caption)}</em><br>` : ''}${body}</p>`;

  return {
    ok: true,
    props: {
      type: 'chess-board',
      fen,
      moves,
      orientation,
      caption: caption || undefined,
      white: white || undefined,
      black: black || undefined,
      annotations: annotations.length ? annotations : undefined,
    },
    attrs,
    fallback,
  };
}

function normalizePuzzle(raw: RawWidget): WidgetResult & { ok: true } {
  const fen = checkFen(raw.fen);
  const requested = parseMoveList(raw.solution ?? '');
  if (requested.length === 0) fail('Escribe la solución (al menos una jugada).');
  const solution = replay(fen, requested, 40);
  const caption = line(raw.caption, 'El pie del problema', 200);
  const hint = line(raw.hint, 'La pista', 200);

  const attrs: Record<string, string> = { fen, solution: solution.join(' ') };
  if (caption) attrs.caption = caption;
  if (hint) attrs.hint = hint;

  const white = fen.split(' ')[1] !== 'b';
  const fallback =
    `<p>${caption ? `<em>${escapeHtml(caption)}</em><br>` : ''}` +
    `<strong>Problema:</strong> juegan ${white ? 'blancas' : 'negras'}. Posición (FEN): ${escapeHtml(fen)}</p>` +
    `<details><summary>Ver solución</summary><p>${escapeHtml(formatMovetext(fen, solution))}</p></details>`;

  return { ok: true, props: { type: 'chess-puzzle', fen, solution, caption: caption || undefined, hint: hint || undefined }, attrs, fallback };
}

function normalizeQuiz(raw: RawWidget): WidgetResult & { ok: true } {
  let data: unknown;
  try {
    data = JSON.parse(raw.quiz ?? '');
  } catch {
    return fail('El formato de la trivia no es válido.');
  }
  if (!data || typeof data !== 'object') fail('El formato de la trivia no es válido.');
  const input = data as { title?: unknown; questions?: unknown };
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 20) {
    fail('La trivia debe tener entre 1 y 20 preguntas.');
  }

  const questions: QuizQuestion[] = (input.questions as unknown[]).map((item, i) => {
    const n = i + 1;
    const q = item as { q?: unknown; options?: unknown; answer?: unknown; explain?: unknown };
    const text = line(typeof q.q === 'string' ? q.q : '', `El enunciado de la pregunta ${n}`, 300, true);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      fail(`La pregunta ${n} necesita entre 2 y 6 opciones.`);
    }
    const options = (q.options as unknown[]).map((o, j) =>
      line(typeof o === 'string' ? o : '', `La opción ${j + 1} de la pregunta ${n}`, 150, true)
    );
    if (typeof q.answer !== 'number' || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= options.length) {
      fail(`La pregunta ${n} no tiene una respuesta correcta válida.`);
    }
    const explain = line(typeof q.explain === 'string' ? q.explain : '', `La explicación de la pregunta ${n}`, 400);
    const out: QuizQuestion = { q: text, options, answer: q.answer as number };
    if (explain) out.explain = explain;
    return out;
  });

  const title = line(typeof input.title === 'string' ? input.title : '', 'El título de la trivia', 120);
  const quiz: Quiz = { questions };
  if (title) quiz.title = title;

  const json = JSON.stringify(quiz);
  if (json.length > 20000) fail('La trivia es demasiado larga.');

  const letter = (i: number) => String.fromCharCode(97 + i);
  const fallback =
    `<p><strong>Trivia${title ? `: ${escapeHtml(title)}` : ''}</strong></p><ol>` +
    questions
      .map((qu) => `<li>${escapeHtml(qu.q)}<ul>${qu.options.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul></li>`)
      .join('') +
    `</ol><details><summary>Ver respuestas</summary><ol>` +
    questions.map((qu) => `<li>${letter(qu.answer)}) ${escapeHtml(qu.options[qu.answer])}</li>`).join('') +
    `</ol></details>`;

  return { ok: true, props: { type: 'quiz', quiz }, attrs: { quiz: json }, fallback };
}

function normalizeGallery(raw: RawWidget): WidgetResult & { ok: true } {
  let data: unknown;
  try {
    data = JSON.parse(raw.images ?? '');
  } catch {
    return fail('No se pudo leer la galería.');
  }
  if (!Array.isArray(data)) fail('No se pudo leer la galería.');
  const list = data as unknown[];
  if (list.length < 1) fail('Agrega al menos una imagen.');
  if (list.length > MAX_GALLERY_IMAGES) fail(`Como máximo ${MAX_GALLERY_IMAGES} imágenes por galería.`);

  const images: GalleryImage[] = list.map((item, i) => {
    const n = i + 1;
    const entry = item as { key?: unknown; alt?: unknown; caption?: unknown };
    const key = checkImageKey(typeof entry.key === 'string' ? entry.key : '', `La imagen ${n}`);
    const alt = line(typeof entry.alt === 'string' ? entry.alt : '', `El texto alternativo de la imagen ${n}`, 300, true);
    const caption = line(typeof entry.caption === 'string' ? entry.caption : '', `El pie de la imagen ${n}`, 200);
    const out: GalleryImage = { key, alt };
    if (caption) out.caption = caption;
    return out;
  });

  const attrs: Record<string, string> = { images: JSON.stringify(images) };
  const fallback = images
    .map((im) => `<img src="/api/img/${escapeAttr(im.key)}" alt="${escapeAttr(im.alt)}" loading="lazy">${im.caption ? `<figcaption>${escapeHtml(im.caption)}</figcaption>` : ''}`)
    .join('');

  return { ok: true, props: { type: 'gallery', images }, attrs, fallback };
}

/** Valida una URL de embed contra la lista blanca de sitios y rutas. */
export function checkEmbedUrl(value: string | null | undefined): URL {
  const text = (value ?? '').trim();
  if (!text) fail('La dirección (URL) es obligatoria.');
  if (text.length > 500) fail('La URL es demasiado larga.');
  let url: URL;
  try {
    url = new URL(text.startsWith('//') ? `https:${text}` : text);
  } catch {
    return fail('La URL no es válida.');
  }
  const allowed = EMBED_HOSTS[url.hostname.toLowerCase()];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed) {
    fail(`Solo se pueden incrustar páginas de: ${Object.keys(EMBED_HOSTS).join(', ')} (por https).`);
  }
  if (!allowed.some((prefix) => url.pathname.startsWith(prefix))) {
    fail(`Esa dirección de ${url.hostname} no es una página incrustable (usa el código "Insertar" del sitio).`);
  }
  return url;
}

/**
 * Comodidad para el autor: convierte un enlace normal (una partida de Lichess,
 * un video de YouTube) en su enlace incrustable. Si no reconoce el formato,
 * devuelve el texto tal cual y la validación decide.
 */
export function suggestEmbedUrl(input: string): string {
  const text = input.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return text;
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'lichess.org') {
    const game = url.pathname.match(/^\/([A-Za-z0-9]{8})(?:[A-Za-z0-9]{4})?(?:\/(?:white|black))?\/?$/);
    if (game) return `https://lichess.org/embed/${game[1]}?theme=auto&bg=auto`;
  }
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com') {
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  }
  return text;
}

function normalizeEmbed(raw: RawWidget): WidgetResult & { ok: true } {
  const url = checkEmbedUrl(raw.src);
  const title = line(raw.title, 'El título accesible', 120, true);
  const ratio = (EMBED_RATIOS as readonly string[]).includes(raw.ratio ?? '') ? (raw.ratio as EmbedRatio) : '16:9';
  const src = url.toString();

  const attrs: Record<string, string> = { src, title };
  if (ratio !== '16:9') attrs.ratio = ratio;

  const fallback = `<p><a href="${escapeAttr(src)}" rel="noopener noreferrer">${escapeHtml(title)}</a></p>`;
  return { ok: true, props: { type: 'embed', src, title, ratio }, attrs, fallback };
}

/** Punto de entrada único: valida `raw` (claves sin "data-") según el tipo. */
export function normalizeWidget(type: string, raw: RawWidget): WidgetResult {
  try {
    switch (type) {
      case 'chess-board':
        return normalizeBoard(raw);
      case 'chess-puzzle':
        return normalizePuzzle(raw);
      case 'quiz':
        return normalizeQuiz(raw);
      case 'embed':
        return normalizeEmbed(raw);
      case 'gallery':
        return normalizeGallery(raw);
      default:
        return { ok: false, error: `Tipo de widget desconocido: "${type}".` };
    }
  } catch (e) {
    if (e instanceof WidgetError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Serializa un widget ya validado al HTML canónico que se guarda en la base. */
export function renderWidgetElement(type: WidgetType, attrs: Record<string, string>, fallback: string): string {
  const data = Object.entries(attrs)
    .map(([key, value]) => ` data-${key}="${escapeAttr(value)}"`)
    .join('');
  return `<figure data-widget="${type}"${data}>${fallback}</figure>`;
}

export function isWidgetType(value: string): value is WidgetType {
  return (WIDGET_TYPES as readonly string[]).includes(value);
}