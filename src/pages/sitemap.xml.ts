import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { listAllArticles } from '../lib/db';
import { listAllArbitros } from '../lib/arbitros';
import { listAllEntrenadores } from '../lib/entrenadores';
import { listAllClubes } from '../lib/clubes';
import { perfilTieneValorParaIndexar } from '../lib/seo';

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
  { path: '/arbitros', changefreq: 'weekly', priority: '0.7' },
  { path: '/entrenadores', changefreq: 'weekly', priority: '0.7' },
  { path: '/clubes', changefreq: 'weekly', priority: '0.7' },
  { path: '/sobre-nosotros', changefreq: 'yearly', priority: '0.4' },
  { path: '/politica-de-privacidad', changefreq: 'yearly', priority: '0.3' },
  { path: '/terminos-y-condiciones', changefreq: 'yearly', priority: '0.3' },
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ url }) => {
  const db = env.DB;
  const articles = await listAllArticles(db);
  const arbitros = await listAllArbitros(db);
  const entrenadores = await listAllEntrenadores(db);
  const clubes = await listAllClubes(db);

  const staticEntries = STATIC_ROUTES.map(
    (route) => `  <url>
    <loc>${escapeXml(url.origin + route.path)}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  );

  const articleEntries = articles.map((article) => {
    const lastmod = new Date(article.updated_at ?? article.published_at).toISOString();
    return `  <url>
    <loc>${escapeXml(`${url.origin}/articulos/${article.slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  const arbitroEntries = arbitros
    .filter((arbitro) => perfilTieneValorParaIndexar(arbitro.bio))
    .map((arbitro) => {
      const lastmod = new Date(arbitro.updated_at ?? arbitro.created_at).toISOString();
      return `  <url>
    <loc>${escapeXml(`${url.origin}/arbitros/${arbitro.slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`;
    });

  const entrenadorEntries = entrenadores
    .filter((entrenador) => perfilTieneValorParaIndexar(entrenador.bio))
    .map((entrenador) => {
      const lastmod = new Date(entrenador.updated_at ?? entrenador.created_at).toISOString();
      return `  <url>
    <loc>${escapeXml(`${url.origin}/entrenadores/${entrenador.slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`;
    });

  const clubEntries = clubes
    .filter((club) => perfilTieneValorParaIndexar(club.bio))
    .map((club) => {
      const lastmod = new Date(club.updated_at ?? club.created_at).toISOString();
      return `  <url>
    <loc>${escapeXml(`${url.origin}/clubes/${club.slug}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...articleEntries, ...arbitroEntries, ...entrenadorEntries, ...clubEntries].join('\n')}
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
