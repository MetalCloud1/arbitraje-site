import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { searchArticles } from '../../lib/db';
import { canonicalCacheKey, getEdgeCache } from '../../lib/edge-cache';
import { formatDateEs } from '../../lib/text';
import { resolveThumbnail } from '../../lib/video';

export const prerender = false;

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const SUGGESTIONS_LIMIT = 6;
const CACHE_TTL_SECONDS = 60;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Público a propósito (no vive bajo /api/articles, /api/upload ni /api/cleanup,
// que son los prefijos que el middleware protege) — cualquier visitante debe
// poder usar el buscador sin sesión.
export const GET: APIRoute = async ({ url, locals }) => {
  // "  Árbitro   FIDE " y "árbitro fide" deben ser la misma búsqueda.
  const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);

  if (q.length < MIN_QUERY_LENGTH) {
    return new Response(JSON.stringify({ query: q, results: [] }), { headers: JSON_HEADERS });
  }

  // Caché de borde: cada pausa al teclear era una consulta LIKE '%q%' a D1
  // (recorre la tabla). El mismo texto buscado por distintos visitantes, o por
  // el mismo en pocos segundos, ahora se sirve del caché. Solo las búsquedas
  // ASCII se pasan a minúsculas en la clave: el LIKE de SQLite distingue
  // mayúsculas en letras con acento, y ahí "Á" y "á" dan resultados distintos.
  const cache = getEdgeCache();
  const keyUrl = new URL(url);
  keyUrl.search = '';
  keyUrl.searchParams.set('q', /^[\x00-\x7f]*$/.test(q) ? q.toLowerCase() : q);
  const cacheKey = canonicalCacheKey(keyUrl, new Set(['q']));

  const cached = await cache.match(cacheKey);
  if (cached) return cached as unknown as Response;

  try {
    const db = env.DB;
    const articles = await searchArticles(db, q, SUGGESTIONS_LIMIT);

    const results = articles.map((article) => {
      const thumb = resolveThumbnail(article);
      return {
        slug: article.slug,
        title: article.title,
        category: article.category,
        publishedAt: formatDateEs(article.published_at),
        readMinutes: article.read_minutes,
        imageUrl: thumb.imageUrl,
        isVideo: thumb.isVideo,
      };
    });

    const response = new Response(JSON.stringify({ query: q, results }), {
      headers: { ...JSON_HEADERS, 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
    });
    // Los errores (500) no se cachean; este camino solo se alcanza con éxito.
    locals.cfContext.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error('Error en /api/search:', err);
    return new Response(JSON.stringify({ query: q, error: 'No se pudo completar la búsqueda.' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
