import type { APIRoute } from 'astro';
import { clearDangerCookie } from '../../../lib/auth';

export const prerender = false;

// Vuelve a cerrar la zona restringida (borra la cookie del segundo candado).
// La sesión admin normal sigue abierta.
export const POST: APIRoute = async ({ request }) => {
  const isHttps = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 302,
    headers: { Location: '/admin', 'Set-Cookie': clearDangerCookie(isHttps) },
  });
};
