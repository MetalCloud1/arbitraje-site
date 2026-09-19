// Capa de acceso a datos para el directorio de entrenadores. Mismo patrón
// que arbitros.ts (paginación por cursor, resumen liviano para el
// directorio público). Ver ese archivo para el razonamiento de fondo;
// acá solo se documenta lo que cambia: titulo_ajedrez, titulo_arbitraje
// y elo_clasico.

import { escapeLikeTerm } from './db';
import { parseEloClasicoInput } from './titulos-ajedrez';

export type Actividad = 'activo' | 'inactivo';

export interface Entrenador {
  id: number;
  slug: string;
  nombre_completo: string;
  estado_republica: string | null;
  titulo_ajedrez: string | null;
  titulo_arbitraje: string | null;
  elo_clasico: number | null;
  fide_id: string | null;
  foto_key: string | null;
  email: string | null;
  bio: string | null;
  actividad: Actividad;
  reclamado_en: string | null;
  orden_destacado: number | null;
  created_at: string;
  updated_at: string;
}

export interface EntrenadorInput {
  slug: string;
  nombre_completo: string;
  estado_republica: string | null;
  titulo_ajedrez: string | null;
  titulo_arbitraje: string | null;
  elo_clasico: number | null;
  fide_id: string | null;
  foto_key: string | null;
  email: string | null;
  bio: string | null;
  actividad: Actividad;
  reclamado_en: string | null;
  orden_destacado: number | null;
}

export async function listAllEntrenadores(db: D1Database): Promise<Entrenador[]> {
  const { results } = await db
    .prepare('SELECT * FROM entrenadores ORDER BY nombre_completo ASC')
    .all<Entrenador>();
  return results ?? [];
}

// Campos que expone el directorio público (tarjetas). Igual que en
// árbitros: nada de email/bio/fide_id/timestamps en el listado paginado.
export interface EntrenadorResumen {
  id: number;
  slug: string;
  nombre_completo: string;
  estado_republica: string | null;
  titulo_ajedrez: string | null;
  titulo_arbitraje: string | null;
  elo_clasico: number | null;
  foto_key: string | null;
}

export interface ListaEntrenadoresParams {
  estado?: string | null;
  tituloAjedrez?: string | null;
  q?: string | null;
  cursor?: string | null;
  limit: number;
}

export interface ListaEntrenadoresResult {
  items: EntrenadorResumen[];
  nextCursor: string | null;
}

const RESUMEN_COLS =
  'id, slug, nombre_completo, estado_republica, titulo_ajedrez, titulo_arbitraje, elo_clasico, foto_key';

interface EntrenadorResumenRow extends EntrenadorResumen {
  orden_destacado: number | null;
}

// 0 = tiene orden manual (va primero), 1 = alfabético normal.
const RANK_EXPR = 'CASE WHEN orden_destacado IS NOT NULL THEN 0 ELSE 1 END';

interface CursorPayload {
  r: number; // rank (ver RANK_EXPR)
  o: number; // orden_destacado, o 0 cuando no aplica (rank=1)
  n: string; // nombre_completo
  i: number; // id
}

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
 * Página del directorio público. Mismo criterio de orden que árbitros:
 * primero los orden_destacado (ascendente entre ellos), después alfabético.
 * Solo trae actividad = 'activo'. Paginación por cursor, no OFFSET.
 */
export async function listEntrenadoresPage(
  db: D1Database,
  { estado, tituloAjedrez, q, cursor, limit }: ListaEntrenadoresParams
): Promise<ListaEntrenadoresResult> {
  const conditions: string[] = [`actividad = 'activo'`];
  const binds: unknown[] = [];

  if (estado) {
    conditions.push('estado_republica = ?');
    binds.push(estado);
  }

  if (tituloAjedrez) {
    conditions.push('titulo_ajedrez = ?');
    binds.push(tituloAjedrez);
  }

  const term = q?.trim();
  if (term && term.length >= 2) {
    const like = `%${escapeLikeTerm(term)}%`;
    conditions.push(
      `(nombre_completo LIKE ? ESCAPE '\\' OR titulo_ajedrez LIKE ? ESCAPE '\\' OR titulo_arbitraje LIKE ? ESCAPE '\\' OR estado_republica LIKE ? ESCAPE '\\')`
    );
    binds.push(like, like, like, like);
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

  const sql = `SELECT ${RESUMEN_COLS}, orden_destacado FROM entrenadores
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${RANK_EXPR} ASC, orden_destacado ASC, nombre_completo ASC, id ASC
     LIMIT ?`;
  binds.push(limit + 1);

  const { results } = await db.prepare(sql).bind(...binds).all<EntrenadorResumenRow>();
  const rows = results ?? [];
  const hasMore = rows.length > limit;
  const rawItems = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: rawItems.map(({ orden_destacado, ...resto }) => resto),
    nextCursor: hasMore ? encodeCursor(rawItems[rawItems.length - 1]) : null,
  };
}

/** Cuenta total de entrenadores activos, opcionalmente filtrando. */
export async function countEntrenadores(
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
    conditions.push(
      `(nombre_completo LIKE ? ESCAPE '\\' OR titulo_ajedrez LIKE ? ESCAPE '\\' OR titulo_arbitraje LIKE ? ESCAPE '\\' OR estado_republica LIKE ? ESCAPE '\\')`
    );
    binds.push(like, like, like, like);
  }

  const row = await db
    .prepare(`SELECT COUNT(*) as total FROM entrenadores WHERE ${conditions.join(' AND ')}`)
    .bind(...binds)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** Estados con al menos un entrenador activo, para los chips de filtro. */
export async function listEstadosConEntrenadores(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT estado_republica FROM entrenadores
       WHERE actividad = 'activo' AND estado_republica IS NOT NULL
       ORDER BY estado_republica ASC`
    )
    .all<{ estado_republica: string }>();
  return (results ?? []).map((r) => r.estado_republica);
}

export async function getEntrenadorBySlug(db: D1Database, slug: string): Promise<Entrenador | null> {
  return db.prepare('SELECT * FROM entrenadores WHERE slug = ?').bind(slug).first<Entrenador>();
}

export async function getEntrenadorById(db: D1Database, id: number): Promise<Entrenador | null> {
  return db.prepare('SELECT * FROM entrenadores WHERE id = ?').bind(id).first<Entrenador>();
}

export async function entrenadorSlugExists(db: D1Database, slug: string, excludeId?: number): Promise<boolean> {
  const row = excludeId
    ? await db.prepare('SELECT id FROM entrenadores WHERE slug = ? AND id != ?').bind(slug, excludeId).first()
    : await db.prepare('SELECT id FROM entrenadores WHERE slug = ?').bind(slug).first();
  return !!row;
}

export async function createEntrenador(db: D1Database, input: EntrenadorInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO entrenadores
        (slug, nombre_completo, estado_republica, titulo_ajedrez, titulo_arbitraje, elo_clasico,
         fide_id, foto_key, email, bio, actividad, reclamado_en, orden_destacado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.slug,
      input.nombre_completo,
      input.estado_republica,
      input.titulo_ajedrez,
      input.titulo_arbitraje,
      input.elo_clasico,
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

export async function updateEntrenador(db: D1Database, id: number, input: EntrenadorInput): Promise<void> {
  await db
    .prepare(
      `UPDATE entrenadores SET
        slug = ?, nombre_completo = ?, estado_republica = ?, titulo_ajedrez = ?, titulo_arbitraje = ?,
        elo_clasico = ?, fide_id = ?, foto_key = ?, email = ?, bio = ?, actividad = ?, reclamado_en = ?,
        orden_destacado = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      input.slug,
      input.nombre_completo,
      input.estado_republica,
      input.titulo_ajedrez,
      input.titulo_arbitraje,
      input.elo_clasico,
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

export async function deleteEntrenador(db: D1Database, id: number): Promise<Entrenador | null> {
  const entrenador = await getEntrenadorById(db, id);
  await db.prepare('DELETE FROM entrenadores WHERE id = ?').bind(id).run();
  return entrenador;
}

/** Parsea "Destacar en el directorio": vacío/inválido -> null. */
export function parseOrdenDestacado(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** Parsea el ELO clásico del form del admin: vacío -> null; si no, entero
 * en un rango plausible (evita cargas accidentales tipo "20000" o negativos).
 * El rango válido vive en parseEloClasicoInput(), compartido con el
 * formulario público de postulación. */
export function parseEloClasico(raw: FormDataEntryValue | null): number | null {
  const result = parseEloClasicoInput(String(raw ?? ''));
  return result.ok ? result.value : null;
}
