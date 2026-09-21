// Capa de acceso a datos para el directorio de clubes. Mismo patrón que
// entrenadores.ts/arbitros.ts (paginación por cursor, resumen liviano para
// el directorio público) -- ver esos archivos para el razonamiento de
// fondo; acá solo se documenta lo que cambia.
//
// A propósito, esta tabla no sabe nada de "cursos digitales de pago": esa
// es una pieza futura, aislada, que si algún día existe cuelga de un club
// por club_id, sin tocar nada de lo que hay acá.

import { escapeLikeTerm } from './db';

export type Actividad = 'activo' | 'inactivo';
export type Modalidad = 'virtual' | 'presencial' | 'ambas';

// Mismo texto exacto que en el <select> del formulario (público y admin):
// dias_imparte se guarda como CSV de estos valores, p.ej. "Lunes,Viernes".
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

export const MODALIDADES: { value: Modalidad; label: string }[] = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'ambas', label: 'Ambas' },
];

export interface Club {
  id: number;
  slug: string;
  nombre: string;
  pais: string;
  direccion: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  sitio_web: string | null;
  dias_imparte: string | null;
  modalidad: Modalidad;
  logo_key: string | null;
  bio: string | null;
  actividad: Actividad;
  orden_destacado: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClubInput {
  slug: string;
  nombre: string;
  pais: string;
  direccion: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  sitio_web: string | null;
  dias_imparte: string | null;
  modalidad: Modalidad;
  logo_key: string | null;
  bio: string | null;
  actividad: Actividad;
  orden_destacado: number | null;
}

export async function listAllClubes(db: D1Database): Promise<Club[]> {
  const { results } = await db.prepare('SELECT * FROM clubes ORDER BY nombre ASC').all<Club>();
  return results ?? [];
}

// Campos que expone el directorio público (tarjetas): la tarjeta es solo
// logo + nombre, así que el resumen es angosto a propósito -- el resto
// (dirección, contacto, días, modalidad) vive solo en la ficha de detalle.
export interface ClubResumen {
  id: number;
  slug: string;
  nombre: string;
  pais: string;
  logo_key: string | null;
}

export interface ListaClubesParams {
  pais?: string | null;
  q?: string | null;
  cursor?: string | null;
  limit: number;
}

export interface ListaClubesResult {
  items: ClubResumen[];
  nextCursor: string | null;
}

const RESUMEN_COLS = 'id, slug, nombre, pais, logo_key';

interface ClubResumenRow extends ClubResumen {
  orden_destacado: number | null;
}

// 0 = tiene orden manual (va primero), 1 = alfabético normal.
const RANK_EXPR = 'CASE WHEN orden_destacado IS NOT NULL THEN 0 ELSE 1 END';

interface CursorPayload {
  r: number; // rank (ver RANK_EXPR)
  o: number; // orden_destacado, o 0 cuando no aplica (rank=1)
  n: string; // nombre
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

function encodeCursor(a: { nombre: string; id: number; orden_destacado: number | null }): string {
  const payload: CursorPayload = {
    r: a.orden_destacado != null ? 0 : 1,
    o: a.orden_destacado ?? 0,
    n: a.nombre,
    i: a.id,
  };
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

/**
 * Página del directorio público. Mismo criterio de orden que entrenadores:
 * primero los orden_destacado (ascendente entre ellos), después alfabético.
 * Solo trae actividad = 'activo'. Paginación por cursor, no OFFSET.
 */
export async function listClubesPage(
  db: D1Database,
  { pais, q, cursor, limit }: ListaClubesParams
): Promise<ListaClubesResult> {
  const conditions: string[] = [`actividad = 'activo'`];
  const binds: unknown[] = [];

  if (pais) {
    conditions.push('pais = ?');
    binds.push(pais);
  }

  const term = q?.trim();
  if (term && term.length >= 2) {
    const like = `%${escapeLikeTerm(term)}%`;
    conditions.push(`(nombre LIKE ? ESCAPE '\\' OR pais LIKE ? ESCAPE '\\' OR direccion LIKE ? ESCAPE '\\')`);
    binds.push(like, like, like);
  }

  const decoded = decodeCursor(cursor);
  if (decoded) {
    conditions.push(`(
      ${RANK_EXPR} > ? OR
      (${RANK_EXPR} = ? AND COALESCE(orden_destacado, 0) > ?) OR
      (${RANK_EXPR} = ? AND COALESCE(orden_destacado, 0) = ? AND nombre > ?) OR
      (${RANK_EXPR} = ? AND COALESCE(orden_destacado, 0) = ? AND nombre = ? AND id > ?)
    )`);
    binds.push(
      decoded.r,
      decoded.r, decoded.o,
      decoded.r, decoded.o, decoded.n,
      decoded.r, decoded.o, decoded.n, decoded.i
    );
  }

  const sql = `SELECT ${RESUMEN_COLS}, orden_destacado FROM clubes
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${RANK_EXPR} ASC, orden_destacado ASC, nombre ASC, id ASC
     LIMIT ?`;
  binds.push(limit + 1);

  const { results } = await db.prepare(sql).bind(...binds).all<ClubResumenRow>();
  const rows = results ?? [];
  const hasMore = rows.length > limit;
  const rawItems = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: rawItems.map(({ orden_destacado, ...resto }) => resto),
    nextCursor: hasMore ? encodeCursor(rawItems[rawItems.length - 1]) : null,
  };
}

/** Cuenta total de clubes activos, opcionalmente filtrando por país. */
export async function countClubes(db: D1Database, { pais, q }: { pais?: string | null; q?: string | null } = {}): Promise<number> {
  const conditions: string[] = [`actividad = 'activo'`];
  const binds: unknown[] = [];

  if (pais) {
    conditions.push('pais = ?');
    binds.push(pais);
  }

  const term = q?.trim();
  if (term && term.length >= 2) {
    const like = `%${escapeLikeTerm(term)}%`;
    conditions.push(`(nombre LIKE ? ESCAPE '\\' OR pais LIKE ? ESCAPE '\\' OR direccion LIKE ? ESCAPE '\\')`);
    binds.push(like, like, like);
  }

  const row = await db
    .prepare(`SELECT COUNT(*) as total FROM clubes WHERE ${conditions.join(' AND ')}`)
    .bind(...binds)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

/** Países con al menos un club activo, para los chips de filtro. */
export async function listPaisesConClubes(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT DISTINCT pais FROM clubes WHERE actividad = 'activo' ORDER BY pais ASC`)
    .all<{ pais: string }>();
  return (results ?? []).map((r) => r.pais);
}

export async function getClubBySlug(db: D1Database, slug: string): Promise<Club | null> {
  return db.prepare('SELECT * FROM clubes WHERE slug = ?').bind(slug).first<Club>();
}

export async function getClubById(db: D1Database, id: number): Promise<Club | null> {
  return db.prepare('SELECT * FROM clubes WHERE id = ?').bind(id).first<Club>();
}

export async function clubSlugExists(db: D1Database, slug: string, excludeId?: number): Promise<boolean> {
  const row = excludeId
    ? await db.prepare('SELECT id FROM clubes WHERE slug = ? AND id != ?').bind(slug, excludeId).first()
    : await db.prepare('SELECT id FROM clubes WHERE slug = ?').bind(slug).first();
  return !!row;
}

export async function createClub(db: D1Database, input: ClubInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO clubes
        (slug, nombre, pais, direccion, telefono, whatsapp, email, sitio_web, dias_imparte,
         modalidad, logo_key, bio, actividad, orden_destacado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.slug,
      input.nombre,
      input.pais,
      input.direccion,
      input.telefono,
      input.whatsapp,
      input.email,
      input.sitio_web,
      input.dias_imparte,
      input.modalidad,
      input.logo_key,
      input.bio,
      input.actividad,
      input.orden_destacado
    )
    .run();
  return result.meta.last_row_id as number;
}

export async function updateClub(db: D1Database, id: number, input: ClubInput): Promise<void> {
  await db
    .prepare(
      `UPDATE clubes SET
        slug = ?, nombre = ?, pais = ?, direccion = ?, telefono = ?, whatsapp = ?, email = ?,
        sitio_web = ?, dias_imparte = ?, modalidad = ?, logo_key = ?, bio = ?, actividad = ?,
        orden_destacado = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(
      input.slug,
      input.nombre,
      input.pais,
      input.direccion,
      input.telefono,
      input.whatsapp,
      input.email,
      input.sitio_web,
      input.dias_imparte,
      input.modalidad,
      input.logo_key,
      input.bio,
      input.actividad,
      input.orden_destacado,
      id
    )
    .run();
}

export async function deleteClub(db: D1Database, id: number): Promise<Club | null> {
  const club = await getClubById(db, id);
  await db.prepare('DELETE FROM clubes WHERE id = ?').bind(id).run();
  return club;
}

/** Parsea "Destacar en el directorio": vacío/inválido -> null. */
export function parseOrdenDestacado(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** Parsea la modalidad del form: cualquier valor que no sea válido cae a 'presencial'. */
export function parseModalidad(raw: FormDataEntryValue | null): Modalidad {
  const value = String(raw ?? '').trim();
  return value === 'virtual' || value === 'ambas' ? value : 'presencial';
}

/** Arma el CSV de dias_imparte a partir de un FormData con checkboxes "dias" repetidos. */
export function parseDiasImparte(form: FormData): string | null {
  const seleccionados = form
    .getAll('dias')
    .map((v) => String(v))
    .filter((v): v is (typeof DIAS_SEMANA)[number] => (DIAS_SEMANA as readonly string[]).includes(v));
  if (seleccionados.length === 0) return null;
  // Se guardan en el orden natural de la semana, sin importar el orden de envío del form.
  const ordenados = DIAS_SEMANA.filter((d) => seleccionados.includes(d));
  return ordenados.join(',');
}

export function diasImparteToArray(dias: string | null): string[] {
  return dias ? dias.split(',').filter(Boolean) : [];
}
