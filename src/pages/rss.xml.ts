import type { APIRoute } from 'astro';
import {
  SITE_LANGUAGE,
  SITE_NAME,
  absolutizeHtml,
  cdata,
  coverImage,
  escapeXml,
  listFeedArticles,
  serveXml,
  toPlainText,
  toRfc3339,
  toRfc822,
  type BuiltXml,
} from '../lib/feed';

// Feed RSS 2.0 con los últimos artículos. Pensado para MSN Partner Hub
// (que lo consulta cada ~15 min) y para cualquier lector/agregador. Se arma
// al vuelo desde D1 y se cachea en el borde, así que publicar en el panel
// basta: el artículo aparece solo en la siguiente ventana de caché.
//
// Reglas de MSN que condicionan este archivo (support.microsoft.com,
// "Feed content specifications" y "Feed item metadata requirements"):
//  - URL fija, HTTPS, sin redirecciones ni parámetros.
//  - Menos de ~30 ítems frescos (acá: 20).
//  - guid estable y pubDate en el pasado; los cambios se señalan con
//    dcterms:modified, NO cambiando guid ni pubDate (si no, duplica).
//  - Título de 20 a 150 caracteres, sin HTML. Abstract en texto plano.
//  - URLs de imagen absolutas. Miniatura solo JPG/PNG (WebP no).
//  - Un solo idioma por feed.
export const prerender = false;

const FEED_SIZE = 20;
// Ventana de caché de borde. Es el retraso máximo entre publicar en el
// panel y que el artículo aparezca en el feed.
const CACHE_TTL_SECONDS = 300;

const CHANNEL_DESCRIPTION =
  'Noticias, entrevistas y análisis sobre arbitraje y ajedrez competitivo.';

export const GET: APIRoute = async ({ request, url, locals }) => {
  const origin = url.origin;

  const build = async (): Promise<BuiltXml> => {
    const articles = await listFeedArticles(locals.runtime.env.DB, FEED_SIZE);
    const lastModified = articles.reduce<Date | null>(
      (latest, a) => (!latest || a.modifiedDate > latest ? a.modifiedDate : latest),
      null
    );

    const items = articles.map((article) => {
      const link = `${origin}/articulos/${article.slug}`;
      const image = coverImage(article.cover_key, origin);

      // La portada no forma parte de content_html (se muestra aparte en la
      // página), así que se antepone al cuerpo: MSN solo autopublica
      // artículos que traen imagen, y WebP es válido dentro del cuerpo.
      const figure = image
        ? `<figure><img src="${escapeXml(image.url)}" alt="${escapeXml(article.title)}" /></figure>`
        : '';
      const body = figure + absolutizeHtml(article.content_html, origin);

      const abstract = toPlainText(article.excerpt);

      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${toRfc822(article.publishedDate)}</pubDate>
      <dcterms:modified>${toRfc3339(article.modifiedDate)}</dcterms:modified>
      <dc:creator>${escapeXml(SITE_NAME)}</dc:creator>
      <category>${escapeXml(article.category)}</category>${abstract ? `\n      <description>${escapeXml(abstract)}</description>` : ''}
      <content:encoded>${cdata(body)}</content:encoded>${
        image?.usableAsThumbnail
          ? `\n      <media:content url="${escapeXml(image.url)}" type="${image.mime}" medium="image">\n        <media:title>${escapeXml(article.title)}</media:title>\n      </media:content>`
          : ''
      }
    </item>`;
    });

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${escapeXml(origin + '/')}</link>
    <description>${escapeXml(CHANNEL_DESCRIPTION)}</description>
    <language>${SITE_LANGUAGE}</language>${lastModified ? `\n    <lastBuildDate>${toRfc822(lastModified)}</lastBuildDate>` : ''}
    <atom:link href="${escapeXml(origin + '/rss.xml')}" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`;

    return { body, lastModified };
  };

  try {
    return await serveXml({
      request,
      url,
      runtime: locals.runtime,
      path: '/rss.xml',
      contentType: 'application/rss+xml; charset=utf-8',
      ttlSeconds: CACHE_TTL_SECONDS,
      build,
    });
  } catch (err) {
    console.error('Error generando /rss.xml:', err);
    return new Response('No se pudo generar el feed.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
};
