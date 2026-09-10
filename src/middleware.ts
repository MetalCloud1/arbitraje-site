import { defineMiddleware } from 'astro:middleware';
import { readSession } from './lib/auth';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const env = context.locals.runtime.env;

  const cookieHeader = context.request.headers.get('cookie');
  const session = await readSession(env.SESSION_SECRET, cookieHeader);
  context.locals.session = session;

  const isAdminPage = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.has(pathname);
  const isProtectedApi =
    pathname.startsWith('/api/articles') ||
    pathname.startsWith('/api/upload') ||
    pathname.startsWith('/api/cleanup');

  if ((isAdminPage || isProtectedApi) && !session) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect('/admin/login');
  }

  return next();
});
