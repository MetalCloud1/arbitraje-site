// Papelera (soft delete) y borrado definitivo de contenido.
//
// Todo lo que quita contenido del sitio pasa por acá, y solo lo usa la zona
// restringida del admin (/admin/zona-restringida y /api/zona/*), que exige un
// segundo candado (ver lib/auth.ts y middleware.ts). Las consultas públicas
// y del admin normal filtran `deleted_at IS NULL`, así que mover algo a la
// papelera lo oculta de inmediato sin perder nada.
//
// Los nombres de tabla/columna se interpolan en el SQL, pero SIEMPRE salen de
// la tabla fija TIPOS de abajo (nunca de la request): `tipo` se valida con
// esTipo() antes de llegar acá.

import { computeExpiresAt } from './expiry';

export type TipoContenido = 'articulos' | 'arbitros' | 'entrenadores' | 'clubes';

interface ConfigTipo {
  tabla: string;
  colTitulo: string;
  /** Segunda columna descriptiva para mostrar en las listas. */
  colExtra: string;
  /** Columna con la clave de la imagen en R2 (se borra solo al eliminar definitivamente). */
  colImagen: string;
  rutaPublica: string;
  /** Plural con mayúscula para pestañas y encabezados. */
  plural: string;
  /** Singular en minúscula para frases ("este artículo"). */
  singular: string;
}

export const TIPOS: Record<TipoContenido, ConfigTipo> = {
  articulos: {
    tabla: 'articles',
    colTitulo: 'title',
    colExtra: 'category',
    colImagen: 'cover_key',
    rutaPublica: '/articulos',
    plural: 'Artículos',
    singular: 'artículo',
  },
  arbitros: {
    tabla: 'arbitros',
    colTitulo: 'nombre_completo',
    colExtra: 'estado_republica',
    colImagen: 'foto_key',
    rutaPublica: '/arbitros',
    plural: 'Árbitros',
    singular: 'árbitro',
  },
  entrenadores: {
    tabla: 'entrenadores',
    colTitulo: 'nombre_completo',
    colExtra: 'estado_republica',
    colImagen: 'foto_key',
    rutaPublica: '/entrenadores',
    plural: 'Entrenadores',
    singular: 'entrenador',
  },
  clubes: {
    tabla: 'clubes',
    colTitulo: 'nombre',
    colExtra: 'pais',
    colImagen: 'logo_key',
    rutaPublica: '/clubes',
    plural: 'Clubes',
    singular: 'club',
  },
};

export const TIPOS_LISTA = Object.keys(TIPOS) as TipoContenido[];

export function esTipo(valor: unknown): valor is TipoContenido {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(TIPOS, valor);
}

export interface ItemContenido {
  id: number;
  slug: string;
  titulo: string;
  extra: string | null;
  /** Solo artículos: fecha de eliminación programada (ISO) o null. */
  expires_at: string | null;
  /** Fecha en que se envió a la papelera (UTC, "YYYY-MM-DD HH:MM:SS") o null. */
  deleted_at: string | null;
}

function columnasSeleccion(tipo: TipoContenido): string {
  const c = TIPOS[tipo];
  const expires = tipo === 'articulos' ? 'expires_at' : 'NULL';
  return `id, slug, ${c.colTitulo} AS titulo, ${c.colExtra} AS extra, ${expires} AS expires_at, deleted_at`;
}

/** Contenido visible en el sitio (fuera de la papelera). */
export async function listarActivos(db: D1Database, tipo: TipoContenido): Promise<ItemContenido[]> {
  const c = TIPOS[tipo];
  const { results } = await db
    .prepare(`SELECT ${columnasSeleccion(tipo)} FROM ${c.tabla} WHERE deleted_at IS NULL ORDER BY ${c.colTitulo} COLLATE NOCASE ASC`)
    .all<ItemContenido>();
  return results ?? [];
}

/** Contenido en la papelera, lo más recientemente enviado primero. */
export async function listarPapelera(db: D1Database, tipo: TipoContenido): Promise<ItemContenido[]> {
  const c = TIPOS[tipo];
  const { results } = await db
    .prepare(`SELECT ${columnasSeleccion(tipo)} FROM ${c.tabla} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC`)
    .all<ItemContenido>();
  return results ?? [];
}

export async function obtenerEnPapelera(
  db: D1Database,
  tipo: TipoContenido,
  id: number
): Promise<ItemContenido | null> {
  const c = TIPOS[tipo];
  return db
    .prepare(`SELECT ${columnasSeleccion(tipo)} FROM ${c.tabla} WHERE id = ? AND deleted_at IS NOT NULL`)
    .bind(id)
    .first<ItemContenido>();
}

/** Cuántos hay visibles y cuántos en la papelera, por tipo (para las pestañas). */
export async function contarPorTipo(
  db: D1Database
): Promise<Record<TipoContenido, { activos: number; papelera: number }>> {
  const salida = {} as Record<TipoContenido, { activos: number; papelera: number }>;
  const filas = await Promise.all(
    TIPOS_LISTA.map((tipo) =>
      db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END), 0) AS activos,
             COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS papelera
           FROM ${TIPOS[tipo].tabla}`
        )
        .first<{ activos: number; papelera: number }>()
    )
  );
  TIPOS_LISTA.forEach((tipo, i) => {
    salida[tipo] = { activos: filas[i]?.activos ?? 0, papelera: filas[i]?.papelera ?? 0 };
  });
  return salida;
}

/** Oculta el contenido del sitio sin borrar nada (ni su imagen). */
export async function moverAPapelera(db: D1Database, tipo: TipoContenido, id: number): Promise<boolean> {
  const c = TIPOS[tipo];
  const r = await db
    .prepare(`UPDATE ${c.tabla} SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function restaurar(db: D1Database, tipo: TipoContenido, id: number): Promise<boolean> {
  const c = TIPOS[tipo];
  const r = await db
    .prepare(`UPDATE ${c.tabla} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`)
    .bind(id)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

/**
 * Borra la fila para siempre. Solo actúa sobre contenido que YA está en la
 * papelera (la condición va en el propio DELETE, no solo en el chequeo previo).
 * Devuelve la clave de la imagen para que quien llama la borre de R2 *después*
 * de que la fila se haya borrado bien, o null si no había nada que borrar.
 */
export async function eliminarDefinitivo(
  db: D1Database,
  tipo: TipoContenido,
  id: number
): Promise<{ imagen: string | null } | null> {
  const c = TIPOS[tipo];
  const fila = await db
    .prepare(`SELECT ${c.colImagen} AS imagen FROM ${c.tabla} WHERE id = ? AND deleted_at IS NOT NULL`)
    .bind(id)
    .first<{ imagen: string | null }>();
  if (!fila) return null;

  const r = await db
    .prepare(`DELETE FROM ${c.tabla} WHERE id = ? AND deleted_at IS NOT NULL`)
    .bind(id)
    .run();
  if ((r.meta.changes ?? 0) === 0) return null;
  return { imagen: fila.imagen };
}

/** ¿Existe ese slug pero está en la papelera? Sirve para responder 410 en vez de 404. */
export async function fueEliminado(db: D1Database, tipo: TipoContenido, slug: string): Promise<boolean> {
  const c = TIPOS[tipo];
  const fila = await db
    .prepare(`SELECT 1 AS x FROM ${c.tabla} WHERE slug = ? AND deleted_at IS NOT NULL`)
    .bind(slug)
    .first();
  return !!fila;
}

// ---------- Eliminación programada (solo artículos) ----------

/** Fija (o quita, con 'none') la fecha en que un artículo pasa a la papelera. */
export async function programarEliminacion(db: D1Database, id: number, opcion: string): Promise<boolean> {
  const r = await db
    .prepare('UPDATE articles SET expires_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(computeExpiresAt(opcion), id)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

/** Cuántos artículos visibles ya cumplieron su fecha programada. */
export async function contarVencidos(db: D1Database): Promise<number> {
  const fila = await db
    .prepare('SELECT COUNT(*) AS n FROM articles WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?')
    .bind(new Date().toISOString())
    .first<{ n: number }>();
  return fila?.n ?? 0;
}

/** Manda a la papelera (no borra) los artículos cuya fecha programada ya pasó. */
export async function moverVencidosAPapelera(db: D1Database): Promise<number> {
  const r = await db
    .prepare(
      `UPDATE articles SET deleted_at = datetime('now')
       WHERE deleted_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?`
    )
    .bind(new Date().toISOString())
    .run();
  return r.meta.changes ?? 0;
}
