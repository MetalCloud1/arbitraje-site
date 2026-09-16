import type { APIRoute } from 'astro';
import { searchArticles } from '../../lib/db';
import { formatDateEs } from '../../lib/text';
import { resolveThumbnail } from '../../lib/video';

export const prerender = false;

const MIN_QUERY_LENGTH = 2;
const SUGGESTIONS_LIMIT = 6;

// Público a propósito (no vive bajo /api/articles, /api/upload ni /api/cleanup,
// que son los prefijos que el middleware protege) — cualquier visitante debe
// poder usar el buscador sin sesión.
export const GET: APIRoute = async ({ url, locals }) => {
  const q = (url.searchParams.get('q') ?? '').trim();

  if (q.length < MIN_QUERY_LENGTH) {
    return new Response(JSON.stringify({ query: q, results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = locals.runtime.env.DB;
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

    return new Response(JSON.stringify({ query: q, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error en /api/search:', err);
    return new Response(JSON.stringify({ query: q, error: 'No se pudo completar la búsqueda.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};