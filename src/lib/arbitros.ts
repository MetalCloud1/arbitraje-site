// Capa de acceso a datos para el directorio de árbitros. Mismo patrón
// que db.ts (articles): todo el SQL vive acá.

import { escapeLikeTerm } from './db';

export type Actividad = 'activo' | 'inactivo';

export interface Arbitro {
  id: number;
  slug: string;
  nombre_completo: string;
  estado_republica: string | null;
  titulo: string | null;
  fide_id: string | null;
  foto_key: string | null;
  email: string | null;
  bio: string | null;
  actividad: Actividad;
  reclamado_en: string | null;
  // NULL = orden alfabético normal (la inmensa mayoría). Si tiene número,
  // el admin decidió mostrarlo antes que los alfabéticos, en ese orden.
  orden_destacado: number | null;
  created_at: string;
  updated_at: string;
}

export interface ArbitroInput {
  slug: string;
  nombre_completo: string;
  estado_republica: string | null;
  titulo: string | null;
  fide_id: string | null;
  foto_key: string | null;
  email: string | null;
  bio: string | null;
  actividad: Actividad;
  reclamado_en: string | null;
  orden_destacado: number | null;
}

export async function listAllArbitros(db: D1Database): Promise<Arbitro[]> {
  const { results } = await db
    .prepare('SELECT * FROM arbitros ORDER BY nombre_completo ASC')
    .all<Arbitro>();
  return results ?? [];
}

// Campos que expone el directorio público (tarjetas). Evita mandar por la
// red columnas que ese listado no usa (email, bio, fide_id, timestamps).
export interface ArbitroResumen {
  id: number;
  slug: string;
  nombre_completo: string;
  estado_republica: string | null;
  titulo: string | null;
  foto_key: string | null;
}

export interface ListaArbitrosParams {
  estado?: string | null;
  titulo?: string | null;
  q?: string | null;
  cursor?: string | null;
  limit: number;
}

export interface ListaArbitrosResult {
  items: ArbitroResumen[];
  nextCursor: string | null;
}

const RESUMEN_COLS = 'id, slug, nombre_completo, estado_republica, titulo, foto_key';

// Fila real que devuelve la query (incluye orden_destacado, que no se manda
// al cliente pero se necesita acá para armar el cursor de continuación).
interface ArbitroResumenRow extends ArbitroResumen {
  orden_destacado: number | null;
}

// 0 = tiene orden manual (va primero), 1 = alfabético normal. Esta misma
// expresión se repite en el ORDER BY y en el WHERE del cursor, así que
// vive en un solo lugar.
const RANK_EXPR = 'CASE WHEN orden_destacado IS NOT NULL THEN 0 ELSE 1 END';

interface CursorPayload {
  r: number; // rank (ver RANK_EXPR)
  o: number; // orden_destacado, o 0 cuando no aplica (rank=1)
  n: string; // nombre_completo
  i: number; // id
}

// Codificado como JSON en base64 (no un delimitador tipo "::") porque ahora
// son 4 campos y un nombre con caracteres raros podría romper un split.
function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(atob(cursor)));
    if (
      typeof payload?.r === 'number' &&
      typeof payload?.o === 'number' &&
      typeof payload?.n === 'string' &&
      typeof payload?.i === 'number'
    ) {
      return payload as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(a: { nombre_completo: string; id: number; orden_destacado: number | null }): string {
  const payload: CursorPayload = {
    r: a.orden_destacado != null ? 0 : 1,
    o: a.orden_destacado ?? 0,
    n: a.nombre_completo,
    i: a.id,
  };
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

/**
 * Página del directorio público. Orden: primero los árbitros con
 * orden_destacado (fijados a mano desde el admin, ascendente entre ellos),
 * después el resto alfabético -- mismo criterio que listAllArbitros salvo
 * por esa excepción editorial. Paginación por cursor (no OFFSET, que se
 * degrada conforme crece la tabla). Solo trae `actividad = 'activo'`
 * porque es lo que se muestra en /arbitros; el admin sigue viendo todo
 * vía listAllArbitros.
 */
export async function listArbitrosPage(
  db: D1Database,
  { estado, titulo, q, cursor, limit }: ListaArbitrosParams
): Promise<ListaArbitrosResult> {
  const conditions: string[] = [`actividad = 'activo'`];
  const binds: unknown[] = [];

  if (estado) {
    conditions.push('estado_republica = ?');
    binds.push(estado);
  }

  if (titulo) {
    conditions.push('titulo = ?');
    binds.push(titulo);
  }

  const term = q?.trim();
  if (term && term.length >= 2) {
    const like = `%${escapeLikeTerm(term)}%`;
    conditions.push(`(nombre_completo LIKE ? ESCAPE '\\' OR titulo LIKE ? ESCAPE '\\' OR estado_republica LIKE ? ESCAPE '\\')`);
    binds.push(like, like, like);
  }

  const decoded = decodeCursor(cursor);
  if (decoded) {
    conditions.push(`(
      ${RANK_EXPR} > ? OR
      (${RANK_EXPR} = ? AND COALESCE(orden_destacado, 0) > ?) OR
      (${RANK_EXPR} = ? AND COALESCE(orden_destacado, 0) = ? AND nombre_completo > ?) OR
      (${RANK_EXPR} = ? AND COALESCE(orden_destacado, 0) = ? AND nombre_completo = ? AND id > ?)
    )`);
    binds.push(
      decoded.r,
      decoded.r, decoded.o,
      decoded.r, decoded.o, decoded.n,
      decoded.r, decoded.o, decoded.n, decoded.i
    );
  }

  const sql = `SELECT ${RESUMEN_COLS}, orden_destacado FROM arbitros
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${RANK_EXPR} ASC, orden_destacado ASC, nombre_completo ASC, id ASC
     LIMIT ?`;
  // Pedimos uno de más para saber si hay siguiente página sin otra query.
  binds.push(limit + 1);

  const { results } = await db.prepare(sql).bind(...binds).all<ArbitroResumenRow>();
  const rows = results ?? [];
  const hasMore = rows.length > limit;
  const rawItems = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: rawItems.map(({ orden_destacado, ...resto }) => resto),
    nextCursor: hasMore ? encodeCursor(rawItems[rawItems.length - 1]) : null,
  };
}

/** Cuenta total de árbitros activos, opcionalmente filtrando por estado/búsqueda. */
export async function countArbitros(
  db: D1Database,
  { estado, q }: { estado?: string | null; q?: string | null } = {}
): Promise<number> {
  const conditions: string[] = [`actividad = 'activo'`];
  const binds: unknown[] = [];

  if (estado) {
    conditions.push('estado_republica = ?');
    binds.push(estado);
  }

  const term = q?.trim();
  if (term && term.length >= 2) {
    const like = `%${escapeLikeTerm(term)}%`;
    conditions.push(`(nombre_completo LIKE ? ESCAPE '\\' OR titulo LIKE ? ESCAPE '\\' OR estado_republica LIKE ? ESCAPE '\\')`);
    binds.push(like, like, like);
  }

  const row = await db
    .prepare(`SELECT COUNT(*) as total FROM arbitros WHERE ${conditions.join(' AND ')}`)
    .bind(...binds)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** Estados con al menos un árbitro activo, para los chips de filtro. Query
 * aparte y liviana (no depende de traer la lista completa como antes). */
export async function listEstadosConArbitros(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT estado_republica FROM arbitros
       WHERE actividad = 'activo' AND estado_republica IS NOT NULL
       ORDER BY estado_republica ASC`
    )
    .all<{ estado_republica: string }>();
  return (results ?? []).map((r) => r.estado_republica);
}

export async function getArbitroBySlug(db: D1Database, slug: string): Promise<Arbitro | null> {
  return db.prepare('SELECT * FROM arbitros WHERE slug = ?').bind(slug).first<Arbitro>();
}

export async function getArbitroById(db: D1Database, id: number): Promise<Arbitro | null> {
  return db.prepare('SELECT * FROM arbitros WHERE id = ?').bind(id).first<Arbitro>();
}

export async function arbitroSlugExists(db: D1Database, slug: string, excludeId?: number): Promise<boolean> {
  const row = excludeId
    ? await db.prepare('SELECT id FROM arbitros WHERE slug = ? AND id != ?').bind(slug, excludeId).first()
    : await db.prepare('SELECT id FROM arbitros WHERE slug = ?').bind(slug).first();
  return !!row;
}

export async function createArbitro(db: D1Database, input: ArbitroInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO arbitros
        (slug, nombre_completo, estado_republica, titulo, fide_id, foto_key, email, bio, actividad, reclamado_en, orden_destacado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.slug,
      input.nombre_completo,
      input.estado_republica,
      input.titulo,
      input.fide_id,
      input.foto_key,
      input.email,
      input.bio,
      input.actividad,
      input.reclamado_en,
      input.orden_destacado
    )
    .run();
  return result.meta.last_row_id as number;
}

export async function updateArbitro(db: D1Database, id: number, input: ArbitroInput): Promise<void> {
  await db
    .prepare(
      `UPDATE arbitros SET
        slug = ?, nombre_completo = ?, estado_republica = ?, titulo = ?, fide_id = ?,
        foto_key = ?, email = ?, bio = ?, actividad = ?, reclamado_en = ?, orden_destacado = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      input.slug,
      input.nombre_completo,
      input.estado_republica,
      input.titulo,
      input.fide_id,
      input.foto_key,
      input.email,
      input.bio,
      input.actividad,
      input.reclamado_en,
      input.orden_destacado,
      id
    )
    .run();
}

export async function deleteArbitro(db: D1Database, id: number): Promise<Arbitro | null> {
  const arbitro = await getArbitroById(db, id);
  await db.prepare('DELETE FROM arbitros WHERE id = ?').bind(id).run();
  return arbitro;
}

/** Parsea el campo "Destacar en el directorio" del form del admin: vacío
 * o inválido -> null (orden alfabético normal); si no, entero positivo. */
export function parseOrdenDestacado(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}
