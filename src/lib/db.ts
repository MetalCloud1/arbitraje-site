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
  created_at: string;
  updated_at: string;
}

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

export async function listRecentArticles(db: D1Database, limit = 4): Promise<Article[]> {
  const { results } = await db
    // id DESC como desempate: published_at solo guarda el día (sin hora), así
    // que dos artículos publicados el mismo día quedan empatados y, sin esto,
    // el orden entre ellos queda librado al azar (el motor de la base puede
    // dejar arriba al más viejo de los dos). Con id DESC gana el que se creó
    // después, que es justo lo que se espera de "lo más nuevo primero".
    .prepare('SELECT * FROM articles ORDER BY published_at DESC, id DESC LIMIT ?')
    .bind(limit)
    .all<Article>();
  return results ?? [];
}

export async function listAllArticles(db: D1Database): Promise<Article[]> {
  const { results } = await db
    .prepare('SELECT * FROM articles ORDER BY published_at DESC, id DESC')
    .all<Article>();
  return results ?? [];
}

export async function getArticleBySlug(db: D1Database, slug: string): Promise<Article | null> {
  return db.prepare('SELECT * FROM articles WHERE slug = ?').bind(slug).first<Article>();
}

export async function getArticleById(db: D1Database, id: number): Promise<Article | null> {
  return db.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first<Article>();
}

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

/**
 * Busca artículos por título, resumen o categoría. Usada tanto por las
 * sugerencias en vivo del buscador (con `limit`) como por la página de
 * resultados completos (sin `limit`).
 */
export async function searchArticles(db: D1Database, query: string, limit?: number): Promise<Article[]> {
  const term = `%${escapeLikeTerm(query.trim())}%`;
  const sql =
    `SELECT * FROM articles
     WHERE title LIKE ? ESCAPE '\\' OR excerpt LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\'
     ORDER BY published_at DESC, id DESC` + (limit ? ' LIMIT ?' : '');
  const stmt = db.prepare(sql);
  const bound = limit ? stmt.bind(term, term, term, limit) : stmt.bind(term, term, term);
  const { results } = await bound.all<Article>();
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

export async function deleteArticle(db: D1Database, id: number): Promise<Article | null> {
  const article = await getArticleById(db, id);
  await db.prepare('DELETE FROM articles WHERE id = ?').bind(id).run();
  return article;
}

/** Borra articulos vencidos (expires_at <= ahora) y devuelve las cover_key para limpiar R2. */
export async function deleteExpiredArticles(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT cover_key FROM articles WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')")
    .all<{ cover_key: string | null }>();

  await db
    .prepare("DELETE FROM articles WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')")
    .run();

  return (results ?? []).map((r) => r.cover_key).filter((k): k is string => !!k);
}