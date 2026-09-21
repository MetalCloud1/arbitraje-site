import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { readSession } from './lib/auth';
import { isCrossOriginWrite, withSecurityHeaders } from './lib/security';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);

const PUBLIC_API_PATHS = new Set([
  '/api/arbitros/directorio',
  '/api/entrenadores/directorio',
  '/api/clubes/directorio',
  '/api/clubes/postular',
]);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

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
      pathname.startsWith('/api/cleanup'));

  if ((isAdminPage || isProtectedApi) && !session) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect('/admin/login');
  }

  return withSecurityHeaders(await next());
});