import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import {
  SITE_LANGUAGE,
  SITE_NAME,
  escapeXml,
  listFeedArticles,
  serveXml,
  toRfc3339,
  type BuiltXml,
} from '../lib/feed';

// Sitemap de Google News: solo artículos de las últimas 48 horas (así lo
// pide Google; los más viejos ya los cubre /sitemap.xml). Con un sitio que
// publica poco, es normal que a veces salga vacío.
export const prerender = false;

const MAX_URLS = 1000; // límite de Google por sitemap de noticias
const WINDOW_MS = 48 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 300;

export const GET: APIRoute = async ({ request, url, locals }) => {
  const origin = url.origin;

  const build = async (): Promise<BuiltXml> => {
    // Se piden hasta 3 días por el filtro de fecha en SQL (que trabaja con
    // fechas sin hora) y se recorta exacto a 48 h acá.
    const candidates = await listFeedArticles(env.DB, MAX_URLS, { maxAgeDays: 3 });
    const cutoff = Date.now() - WINDOW_MS;
    const articles = candidates.filter((a) => a.publishedDate.getTime() >= cutoff);

    const lastModified = articles.reduce<Date | null>(
      (latest, a) => (!latest || a.modifiedDate > latest ? a.modifiedDate : latest),
      null
    );

    const entries = articles.map(
      (article) => `  <url>
    <loc>${escapeXml(`${origin}/articulos/${article.slug}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>${SITE_LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${toRfc3339(article.publishedDate)}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`
    );

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries.join('\n')}
</urlset>
`;

    return { body, lastModified };
  };

  try {
    return await serveXml({
      request,
      url,
      ctx: locals.cfContext,
      path: '/news-sitemap.xml',
      contentType: 'application/xml; charset=utf-8',
      ttlSeconds: CACHE_TTL_SECONDS,
      build,
    });
  } catch (err) {
    console.error('Error generando /news-sitemap.xml:', err);
    return new Response('No se pudo generar el sitemap.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
};
