import type { APIRoute } from 'astro';
import { listAllArticles } from '../lib/db';

// @astrojs/sitemap no sirve aquí: según su propia documentación, no puede
// generar entradas para rutas dinámicas en modo SSR (nuestros artículos
// viven en D1, no en content collections resueltas en build time). Por eso
// generamos el XML nosotros mismos, en cada petición, leyendo D1 directo.
export const prerender = false;

// Páginas estáticas del sitio (fuera de /admin y /api). changefreq/priority
// son solo sugerencias para el crawler, no garantías.
const STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/articulos', changefreq: 'daily', priority: '0.9' },
  { path: '/sobre-nosotros', changefreq: 'yearly', priority: '0.4' },
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ url, locals }) => {
  const db = locals.runtime.env.DB;
  const articles = await listAllArticles(db);

  const staticEntries = STATIC_ROUTES.map(
    (route) => `  <url>
    <loc>${escapeXml(url.origin + route.path)}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  );

const articleEntries = articles.map((article) => {
    const rawDate = article.updated_at ?? article.published_at;
    const parsedDate = new Date(rawDate);
    const lastmod = !isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : new Date().toISOString();

    return `  <url>
    <loc>${escapeXml(`${url.origin}/articulos/${article.slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...articleEntries].join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Cache corto: los artículos se publican sin rebuild, así que el
      // sitemap debe reflejar contenido nuevo pronto, pero sin pegarle a D1
      // en cada crawl.
      'Cache-Control': 'public, max-age=1800',
    },
  });
};
