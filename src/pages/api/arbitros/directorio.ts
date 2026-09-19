import type { APIRoute } from 'astro';
// La Cache API de Cloudflare (Astro.locals.runtime.caches) tipa Request/Response
// contra @cloudflare/workers-types, que es un tipo distinto (aunque compatible
// en runtime) del Request/Response del DOM que usa el resto de Astro. De ahí
// los casts puntuales (via unknown/any) en el borde donde se tocan ambos.
import { listArbitrosPage } from '../../../lib/arbitros';

export const prerender = false;

// Público a propósito, ver la excepción PUBLIC_API_PATHS en middleware.ts
// (mismo espíritu que /api/search: cualquier visitante debe poder listar
// y buscar en el directorio sin sesión).

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

  // Cache de borde por URL exacta (params incluidos). Cache-Control abajo
  // es lo que respeta la Cache API; sin cursor (primera página) es lo que
  // pega la página al cargar y lo que más vale la pena cachear.
  const cache = locals.runtime.caches.default;
  const cacheKey = url.toString();
  const cached = await cache.match(cacheKey);
  if (cached) return cached as unknown as Response;

  try {
    const db = locals.runtime.env.DB;
    // Nota: no calculamos COUNT(*) acá -- el frontend de /arbitros solo lee
    // items/nextCursor de esta respuesta. El "N árbitros registrados" del
    // encabezado se calcula aparte, directo en el servidor al renderizar la
    // página (ver src/pages/arbitros/index.astro), no pasa por este endpoint.
    const { items, nextCursor } = await listArbitrosPage(db, { estado, titulo, q, cursor, limit });

    const response = new Response(JSON.stringify({ items, nextCursor }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });

    // No bloqueamos la respuesta por escribir a cache.
    locals.runtime.ctx.waitUntil(cache.put(cacheKey, response.clone() as unknown as any));
    return response;
  } catch (err) {
    console.error('Error en /api/arbitros/directorio:', err);
    return new Response(JSON.stringify({ error: 'No se pudo cargar el directorio.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};