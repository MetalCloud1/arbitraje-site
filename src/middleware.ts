import { defineMiddleware } from 'astro:middleware';
import { readSession } from './lib/auth';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);

// Excepción puntual dentro de /api/arbitros y /api/entrenadores (que por
// lo demás requieren sesión de admin): el listado/búsqueda que consumen
// las páginas públicas /arbitros y /entrenadores para su paginación con
// "cargar más" y el buscador.
const PUBLIC_API_PATHS = new Set(['/api/arbitros/directorio', '/api/entrenadores/directorio']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const env = context.locals.runtime.env;

  const cookieHeader = context.request.headers.get('cookie');
  const session = await readSession(env.SESSION_SECRET, cookieHeader);
  context.locals.session = session;

  const isAdminPage = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.has(pathname);
  const isProtectedApi =
    !PUBLIC_API_PATHS.has(pathname) &&
    (pathname.startsWith('/api/articles') ||
      pathname.startsWith('/api/arbitros') ||
      pathname.startsWith('/api/entrenadores') ||
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

  return next();
});
