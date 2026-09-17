import type { APIRoute } from 'astro';
import { verifyCredentials, createSessionCookie } from '../../../lib/auth';

export const prerender = false;

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15 minutos

function isNonEmptyString(v: FormDataEntryValue | null, maxLen: number): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}

async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string,
  expectedHostname: string
): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean; action?: string; hostname?: string };
    // No basta con `success`: un token válido pero resuelto en otro
    // hostname/acción (p. ej. reusado desde otra propiedad con la misma
    // cuenta de Cloudflare) no debería alcanzar para entrar acá.
    return data.success === true && data.action === 'login' && data.hostname === expectedHostname;
  } catch (err) {
    console.error('Error verificando Turnstile:', err);
    return false; // si Cloudflare falla, no dejamos pasar por defecto
  }
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  try {
    const env = locals.runtime.env;
    const kv = env.RATE_LIMIT_KV;
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const rlKey = `login_attempts:${ip}`;

    // --- 1. Rate limit (chequeo barato antes que todo lo demás) ---
    const current = await kv.get(rlKey);
    const attempts = current ? parseInt(current, 10) : 0;

    if (attempts >= MAX_ATTEMPTS) {
      return redirect('/admin/login?error=ratelimit');
    }

    // --- 2. Parseo y validación estricta del form ---
    const form = await request.formData();
    const userRaw = form.get('user');
    const passRaw = form.get('pass');
    const turnstileToken = form.get('cf-turnstile-response');

    if (!isNonEmptyString(userRaw, 64) || !isNonEmptyString(passRaw, 256) || !isNonEmptyString(turnstileToken, 4096)) {
      return redirect('/admin/login?error=1');
    }

    // Whitelist de caracteres en el usuario (evita inyección en logs/queries)
    if (!/^[a-zA-Z0-9_.-]+$/.test(userRaw)) {
      return redirect('/admin/login?error=1');
    }

    const user = userRaw;
    const pass = passRaw;

    // --- 3. Verificar Turnstile antes de tocar credenciales ---
    if (!env.TURNSTILE_SECRET_KEY) {
      console.error('TURNSTILE_SECRET_KEY no está definido en el entorno.');
      return redirect('/admin/login?error=1');
    }

    const captchaOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip, new URL(request.url).hostname);
    if (!captchaOk) {
      return redirect('/admin/login?error=captcha');
    }

    // --- 4. Verificar credenciales ---
    const valid = await verifyCredentials(env, user, pass);
    if (!valid) {
      // Solo incrementamos el contador en fallos reales (post-captcha)
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect('/admin/login?error=1');
    }

    if (!env.SESSION_SECRET) {
      console.error('SESSION_SECRET no está definido en el entorno.');
      return redirect('/admin/login?error=1');
    }

    // --- 5. Éxito: limpiar contador y crear sesión ---
    await kv.delete(rlKey);

    // wrangler pages dev / local corre en http:// — una cookie "Secure" ahí
    // nunca se guarda, así que el login parecería fallar silenciosamente.
    const isHttps = new URL(request.url).protocol === 'https:';
    const cookie = await createSessionCookie(env.SESSION_SECRET, user, isHttps);

    return new Response(null, {
      status: 302,
      headers: {
        Location: '/admin',
        'Set-Cookie': cookie,
      },
    });
  } catch (err) {
    // Red de seguridad: cualquier fallo inesperado (env mal configurado, etc.)
    // muestra el error de login en vez de un 500 crudo.
    console.error('Error inesperado en /api/auth/login:', err);
    return redirect('/admin/login?error=1');
  }
};