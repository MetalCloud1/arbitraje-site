import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { verifyDangerPassword, createDangerCookie } from '../../../lib/auth';

export const prerender = false;

// Desbloquea la zona restringida con su contraseña propia. Exige sesión admin
// (lo garantiza el middleware: /api/zona está entre las rutas protegidas).
// Limita intentos igual que el login: 5 fallos cada 15 minutos por IP.
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;
const BACK = '/admin/zona-restringida';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    const session = locals.session;
    if (!session) return redirect('/admin/login');

    // Sin secretos configurados la zona queda cerrada (nunca abierta).
    if (!env.ADMIN_DANGER_PASS_HASH || !env.SESSION_SECRET) {
      return redirect(`${BACK}?error=noconfig`);
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const rlKey = `zona_attempts:${ip}`;
    const current = await env.RATE_LIMIT_KV.get(rlKey);
    const attempts = current ? parseInt(current, 10) : 0;
    if (attempts >= MAX_ATTEMPTS) return redirect(`${BACK}?error=ratelimit`);

    const form = await request.formData();
    const pass = form.get('pass');
    if (typeof pass !== 'string' || pass.length === 0 || pass.length > 256) {
      return redirect(`${BACK}?error=1`);
    }

    if (!(await verifyDangerPassword(env, pass))) {
      await env.RATE_LIMIT_KV.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(`${BACK}?error=1`);
    }

    await env.RATE_LIMIT_KV.delete(rlKey);

    const isHttps = new URL(request.url).protocol === 'https:';
    const cookie = await createDangerCookie(env.SESSION_SECRET, session.user, isHttps);
    return new Response(null, { status: 302, headers: { Location: BACK, 'Set-Cookie': cookie } });
  } catch (err) {
    console.error('Error inesperado en /api/zona/acceso:', err);
    return redirect(`${BACK}?error=1`);
  }
};
