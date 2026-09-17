import type { APIRoute } from 'astro';

// robots.txt como endpoint (no archivo estático en /public) porque necesitamos
// la URL absoluta del sitio para la línea `Sitemap:`, y en SSR esa URL solo
// se conoce en el momento de la petición (Astro.url.origin), no en build time.
export const prerender = false;

export const GET: APIRoute = ({ url }) => {
  const body = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /admin
Disallow: /api/

Sitemap: ${url.origin}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
