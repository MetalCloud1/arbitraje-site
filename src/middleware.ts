import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { readSession } from './lib/auth';
import { isCrossOriginWrite, withSecurityHeaders } from './lib/security';
import { getEdgeCache, isCacheablePagePath, ttlForPagePath } from './lib/edge-cache';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);

const PUBLIC_API_PATHS = new Set([
  '/api/arbitros/directorio',
  '/api/entrenadores/directorio',
  '/api/clubes/directorio',
  '/api/clubes/postular',
]);

// El canonical de BaseLayout.astro se arma con Astro.url.origin (el host
// real de cada request), y no había ningún redirect entre www y sin-www:
// si ambos hosts responden en vivo, cada uno se autodeclara canónico y
// Google puede indexar el sitio dos veces como contenido duplicado. El
// dominio elegido como canónico es sin www (ver astro.config.mjs `site`),
// así que cualquier visita a www se manda con 301 al apex antes que nada.
// Se excluye /api/ para no convertir un POST en GET al seguir el redirect.
const WWW_HOST = 'www.lahoradelarbitraje.pro';
const APEX_HOST = 'lahoradelarbitraje.pro';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (context.url.hostname === WWW_HOST && !pathname.startsWith('/api/')) {
    const target = new URL(context.url);
    target.hostname = APEX_HOST;
    return context.redirect(target.toString(), 301);
  }

  // CSRF: las escrituras a /api solo se aceptan desde este mismo origen.
  if (pathname.startsWith('/api/') && isCrossOriginWrite(context.request, context.url.origin)) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookieHeader = context.request.headers.get('cookie');
  const session = await readSession(env.SESSION_SECRET, cookieHeader);
  context.locals.session = session;

  const isAdminPage = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.has(pathname);
  const isProtectedApi =
    !PUBLIC_API_PATHS.has(pathname) &&
    (pathname.startsWith('/api/articles') ||
      pathname.startsWith('/api/arbitros') ||
      pathname.startsWith('/api/entrenadores') ||
      pathname.startsWith('/api/clubes') ||
      pathname.startsWith('/api/upload') ||
      pathname.startsWith('/api/cleanup') ||
      pathname.startsWith('/api/daily'));

  if ((isAdminPage || isProtectedApi) && !session) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect('/admin/login');
  }

  // Cache de borde para páginas públicas (mismo patrón que ya usan las
  // rutas de API bajo /api/*/directorio y los feeds XML): sin esto, cada
  // visita a /articulos, una ficha de artículo, etc. se vuelve a renderizar
  // en el Worker aunque el contenido no haya cambiado -- es la principal
  // razón de un cache hit rate bajo, ya que son las rutas con más tráfico.
  // Solo aplica a GET sin sesión (defensa extra: aunque hoy ninguna página
  // pública lee locals.session, si alguna vez alguna lo hiciera, un admin
  // navegando el sitio público no debe terminar sirviendo su versión desde
  // este caché compartido a otros visitantes).
  const isCacheableRequest =
    context.request.method === 'GET' && !session && isCacheablePagePath(pathname);

  const cache = getEdgeCache();
  const cacheKey = context.request.url;

  if (isCacheableRequest) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached as unknown as Response;
  }

  const response = withSecurityHeaders(await next());

  if (isCacheableRequest && response.status === 200 && !response.headers.has('Set-Cookie')) {
    response.headers.set('Cache-Control', `public, max-age=${ttlForPagePath(pathname)}`);
    context.locals.cfContext.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
});