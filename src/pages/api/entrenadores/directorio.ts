import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEdgeCache } from '../../../lib/edge-cache';
import { listEntrenadoresPage } from '../../../lib/entrenadores';

export const prerender = false;

// Público a propósito, ver la excepción PUBLIC_API_PATHS en middleware.ts.
// Misma agresividad que /api/arbitros/directorio: páginas chicas y caché
// de borde de 2 minutos, para no pegarle a D1 en cada scroll.

const PAGE_SIZE = 8;
const MAX_LIMIT = 24;
const CACHE_TTL_SECONDS = 120;

export const GET: APIRoute = async ({ url, locals }) => {
  const estado = url.searchParams.get('estado');
  const titulo = url.searchParams.get('titulo');
  const q = url.searchParams.get('q');
  const cursor = url.searchParams.get('cursor');
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : PAGE_SIZE;

  const cache = getEdgeCache();
  const cacheKey = url.toString();
  const cached = await cache.match(cacheKey);
  if (cached) return cached as unknown as Response;

  try {
    const db = env.DB;
    const { items, nextCursor } = await listEntrenadoresPage(db, { estado, tituloAjedrez: titulo, q, cursor, limit });

    const response = new Response(JSON.stringify({ items, nextCursor }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });

    locals.cfContext.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error('Error en /api/entrenadores/directorio:', err);
    return new Response(JSON.stringify({ error: 'No se pudo cargar el directorio.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
