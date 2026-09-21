import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { validateClubPostulacion, buildClubPostulacionEmail } from '../../../lib/club-postulacion';
import { verifyTurnstile } from '../../../lib/turnstile';
import { reserveEmailQuota, sendEmail } from '../../../lib/email';

export const prerender = false;

// Endpoint propio para clubes (a diferencia de árbitros/entrenadores, que
// comparten /api/postular.ts): los campos no se parecen lo suficiente
// como para justificar un formulario/validador compartido. Sí se reutiliza
// toda la infraestructura antispam genérica (rate limit, honeypot,
// Turnstile, cuota de Resend) -- eso no es específico de un directorio.
// Público a propósito, ver PUBLIC_API_PATHS en middleware.ts.

const MAX_ATTEMPTS = 4;
const WINDOW_SECONDS = 60 * 60; // 1 hora
const TURNSTILE_ACTION = 'postular-club';

function redirectError(origin: string, message: string) {
  const back = new URL('/clubes/postular', origin);
  back.searchParams.set('error', message);
  return back.toString();
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const origin = new URL(request.url).origin;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const userAgent = request.headers.get('User-Agent') ?? '(no disponible)';

  try {
    // --- 1. Rate limit (barato, antes que todo) ---
    const kv = env.RATE_LIMIT_KV;
    const rlKey = `postular-club:${ip}`;
    const current = await kv.get(rlKey);
    const attempts = current ? parseInt(current, 10) : 0;
    if (attempts >= MAX_ATTEMPTS) {
      return redirect(redirectError(origin, 'Demasiados envíos desde tu conexión. Intenta de nuevo más tarde.'));
    }

    const form = await request.formData();

    // --- 2. Honeypot: campo oculto que un humano nunca llena ---
    const honeypot = String(form.get('sitio_contacto') ?? '');
    if (honeypot.trim() !== '') {
      // No delatamos el honeypot: pretendemos éxito y no mandamos nada.
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect('/clubes/postular?enviado=1');
    }

    // --- 3. Turnstile: token presente antes de gastar tiempo validando el resto ---
    const turnstileToken = form.get('cf-turnstile-response');
    if (typeof turnstileToken !== 'string' || turnstileToken.length === 0 || turnstileToken.length > 4096) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(redirectError(origin, 'Verificación de seguridad faltante. Recarga la página e intenta de nuevo.'));
    }

    // --- 4. Validación estricta de campos ---
    const result = validateClubPostulacion(form);
    if (!result.ok) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(redirectError(origin, result.error));
    }
    const data = result.data;

    // --- 5. Turnstile de verdad ---
    if (!env.TURNSTILE_SECRET_KEY) {
      console.error('TURNSTILE_SECRET_KEY no está definido en el entorno.');
      return redirect(redirectError(origin, 'No se pudo verificar la seguridad del formulario. Intenta más tarde.'));
    }
    const hostname = new URL(request.url).hostname;
    const captchaOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip, hostname, TURNSTILE_ACTION);
    if (!captchaOk) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(redirectError(origin, 'Verificación de seguridad fallida. Recarga la página e intenta de nuevo.'));
    }

    // Recién ahora, con todo validado, contamos el intento como legítimo.
    await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });

    // --- 6. Corte preventivo de cuota de Resend ---
    const hasQuota = await reserveEmailQuota(env.DB);
    if (!hasQuota) {
      console.error('Cuota mensual de emails agotada: postulación de club no enviada.');
      return redirect(redirectError(origin, 'No se pudo enviar tu postulación en este momento. Intenta más tarde.'));
    }

    // --- 7. Enviar. Bandeja de clubes es opcional: si no está configurada, cae en la de árbitros. ---
    const notifyEmail = env.CLUBES_NOTIFY_EMAIL || env.ARBITROS_NOTIFY_EMAIL;
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !notifyEmail) {
      console.error('Faltan variables de Resend en el entorno (RESEND_API_KEY / RESEND_FROM_EMAIL / *_NOTIFY_EMAIL).');
      return redirect(redirectError(origin, 'No se pudo enviar tu postulación en este momento. Intenta más tarde.'));
    }

    const { subject, text } = buildClubPostulacionEmail({ data, ip, userAgent });
    const sent = await sendEmail(env.RESEND_API_KEY, {
      to: notifyEmail,
      from: env.RESEND_FROM_EMAIL,
      replyTo: data.email,
      subject,
      text,
    });

    if (!sent) {
      return redirect(redirectError(origin, 'No se pudo enviar tu postulación. Intenta de nuevo en unos minutos.'));
    }

    return redirect('/clubes/postular?enviado=1');
  } catch (err) {
    console.error('Error inesperado procesando postulación de club:', err);
    return redirect(redirectError(origin, 'Ocurrió un error inesperado. Intenta de nuevo.'));
  }
};
