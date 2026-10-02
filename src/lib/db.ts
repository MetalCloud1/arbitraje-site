// Capa de acceso a datos. Todas las consultas a D1 pasan por aqui
// para que el resto del codigo no tenga que escribir SQL a mano.

export interface Article {
  id: number;
  slug: string;
  title: string;
  category: string;
  excerpt: string | null;
  content_html: string;
  cover_key: string | null;
  video_url: string | null;
  read_minutes: number;
  published_at: string;
  expires_at: string | null;
  /** Marca de papelera (soft delete). null = visible. Ver lib/papelera.ts. */
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Artículo sin el cuerpo. Los listados (portada, /articulos, buscador, sitemap,
 * panel) nunca muestran `content_html`, que es la columna más pesada: traerla
 * hacía que cada render leyera de D1 todos los cuerpos de todos los artículos.
 */
export type ArticleSummary = Omit<Article, 'content_html'>;

const SUMMARY_COLUMNS =
  'id, slug, title, category, excerpt, cover_key, video_url, read_minutes, published_at, expires_at, deleted_at, created_at, updated_at';

export interface ArticleInput {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  content_html: string;
  cover_key: string | null;
  video_url: string | null;
  read_minutes: number;
  published_at: string;
  expires_at: string | null;
}

export async function listRecentArticles(db: D1Database, limit = 4): Promise<ArticleSummary[]> {
  const { results } = await db
    // id DESC como desempate: published_at solo guarda el día (sin hora), así
    // que dos artículos publicados el mismo día quedan empatados y, sin esto,
    // el orden entre ellos queda librado al azar (el motor de la base puede
    // dejar arriba al más viejo de los dos). Con id DESC gana el que se creó
    // después, que es justo lo que se espera de "lo más nuevo primero".
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM articles WHERE deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT ?`)
    .bind(limit)
    .all<ArticleSummary>();
  return results ?? [];
}

// Para bloques de previsualización por categoría (p. ej. los paneles de
// "Actividad Arbitral" y "Avisos" dentro del hub de /arbitros). Mismo
// desempate id DESC que listRecentArticles, mismo motivo.
export async function listArticlesByCategory(db: D1Database, category: string, limit = 3): Promise<ArticleSummary[]> {
  const { results } = await db
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM articles WHERE category = ? AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT ?`)
    .bind(category, limit)
    .all<ArticleSummary>();
  return results ?? [];
}

export async function listAllArticles(db: D1Database): Promise<ArticleSummary[]> {
  const { results } = await db
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM articles WHERE deleted_at IS NULL ORDER BY published_at DESC, id DESC`)
    .all<ArticleSummary>();
  return results ?? [];
}

export async function getArticleBySlug(db: D1Database, slug: string): Promise<Article | null> {
  return db.prepare('SELECT * FROM articles WHERE slug = ? AND deleted_at IS NULL').bind(slug).first<Article>();
}

export async function getArticleById(db: D1Database, id: number): Promise<Article | null> {
  return db.prepare('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL').bind(id).first<Article>();
}

// Ojo: NO filtra deleted_at a propósito. Un artículo en la papelera sigue
// ocupando su slug (la columna es UNIQUE y, además, hay que poder
// restaurarlo con su misma URL), así que uno nuevo no puede reutilizarlo.
export async function slugExists(db: D1Database, slug: string, excludeId?: number): Promise<boolean> {
  const row = excludeId
    ? await db.prepare('SELECT id FROM articles WHERE slug = ? AND id != ?').bind(slug, excludeId).first()
    : await db.prepare('SELECT id FROM articles WHERE slug = ?').bind(slug).first();
  return !!row;
}

export function escapeLikeTerm(term: string): string {
  // Escapa los comodines propios de LIKE para que una búsqueda por
  // "50%" o "a_b" no se interprete como patrón, sino como texto literal.
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// D1 rechaza con "LIKE or GLOB pattern too complex" (y la página responde 500)
// cualquier patrón LIKE de más de 50 bytes. El patrón lleva dos "%" y cada
// comodín escapado ocupa un byte extra, así que un término largo (o con
// acentos, que pesan 2 bytes) hacía fallar la búsqueda. Se recorta el término
// para que el patrón quepa: buscar por el principio de una frase larga devuelve
// un resultado razonable en vez de un error.
const MAX_LIKE_PATTERN_BYTES = 50;

export function likePattern(term: string): string {
  const encoder = new TextEncoder();
  let out = '';
  let bytes = 2; // los dos "%" de los extremos
  for (const ch of term.trim()) {
    const escaped = escapeLikeTerm(ch);
    const size = encoder.encode(escaped).length;
    if (bytes + size > MAX_LIKE_PATTERN_BYTES) break;
    out += escaped;
    bytes += size;
  }
  return `%${out}%`;
}

/**
 * Busca artículos por título, resumen o categoría. Usada tanto por las
 * sugerencias en vivo del buscador (con `limit`) como por la página de
 * resultados completos (sin `limit`).
 */
export async function searchArticles(db: D1Database, query: string, limit?: number): Promise<ArticleSummary[]> {
  const term = likePattern(query);
  const sql =
    `SELECT ${SUMMARY_COLUMNS} FROM articles
     WHERE deleted_at IS NULL
       AND (title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')
     ORDER BY published_at DESC, id DESC` + (limit ? ' LIMIT ?' : '');
  const stmt = db.prepare(sql);
  const bound = limit ? stmt.bind(term, term, term, limit) : stmt.bind(term, term, term);
  const { results } = await bound.all<ArticleSummary>();
  return results ?? [];
}

export async function createArticle(db: D1Database, input: ArticleInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO articles
        (slug, title, category, excerpt, content_html, cover_key, video_url, read_minutes, published_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.slug,
      input.title,
      input.category,
      input.excerpt,
      input.content_html,
      input.cover_key,
      input.video_url,
      input.read_minutes,
      input.published_at,
      input.expires_at
    )
    .run();
  return result.meta.last_row_id as number;
}

export async function updateArticle(db: D1Database, id: number, input: ArticleInput): Promise<void> {
  await db
    .prepare(
      `UPDATE articles SET
        slug = ?, title = ?, category = ?, excerpt = ?, content_html = ?,
        cover_key = ?, video_url = ?, read_minutes = ?, published_at = ?, expires_at = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      input.slug,
      input.title,
      input.category,
      input.excerpt,
      input.content_html,
      input.cover_key,
      input.video_url,
      input.read_minutes,
      input.published_at,
      input.expires_at,
      id
    )
    .run();
}
