import type { APIRoute } from 'astro';
import { getArbitroById } from '../../lib/arbitros';
import { validatePostulacion, buildPostulacionEmail } from '../../lib/postulacion';
import { verifyTurnstile } from '../../lib/turnstile';
import { reserveEmailQuota, sendEmail } from '../../lib/email';

export const prerender = false;

const MAX_ATTEMPTS = 4;
const WINDOW_SECONDS = 60 * 60; // 1 hora
const TURNSTILE_ACTION = 'postular_arbitro';

/**
 * Siempre vuelve a /arbitros/postular (la única página con GET; este
 * endpoint solo tiene POST, así que redirigir a su propia URL daría
 * un 404). `reclamoId` viene del form ya parseado -- una petición POST
 * no trae query params propios, así que no hay forma de recuperar el
 * modo "reclamo" desde `url.searchParams` como se hacía antes.
 */
function redirectError(origin: string, message: string, reclamoId?: number | null) {
  const back = new URL('/arbitros/postular', origin);
  if (reclamoId) back.searchParams.set('reclamo', String(reclamoId));
  back.searchParams.set('error', message);
  return back.toString();
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const origin = new URL(request.url).origin;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const userAgent = request.headers.get('User-Agent') ?? '(no disponible)';

  try {
    // --- 1. Rate limit (barato, antes que todo) ---
    const kv = env.RATE_LIMIT_KV;
    const rlKey = `postular_arbitro:${ip}`;
    const current = await kv.get(rlKey);
    const attempts = current ? parseInt(current, 10) : 0;
    if (attempts >= MAX_ATTEMPTS) {
      return redirect(redirectError(origin, 'Demasiados envíos desde tu conexión. Intenta de nuevo más tarde.'));
    }

    const form = await request.formData();
    // Disponible desde acá para todos los redirectError que siguen, así
    // un error a mitad de camino no le hace perder a la persona el
    // contexto de "estoy reclamando el perfil X".
    const reclamoIdFromForm = form.get('tipo') === 'reclamo' ? Number(form.get('arbitro_id')) || null : null;

    // --- 2. Honeypot: campo oculto que un humano nunca llena ---
    const honeypot = String(form.get('sitio_web') ?? '');
    if (honeypot.trim() !== '') {
      // No delatamos el honeypot: pretendemos éxito y no mandamos nada.
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect('/arbitros/postular?enviado=1');
    }

    // --- 3. Turnstile: token presente antes de gastar tiempo validando el resto ---
    const turnstileToken = form.get('cf-turnstile-response');
    if (typeof turnstileToken !== 'string' || turnstileToken.length === 0 || turnstileToken.length > 4096) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(
        redirectError(origin, 'Verificación de seguridad faltante. Recarga la página e intenta de nuevo.', reclamoIdFromForm)
      );
    }

    // --- 4. Validación estricta de campos ---
    const result = validatePostulacion(form);
    if (!result.ok) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(redirectError(origin, result.error, reclamoIdFromForm));
    }
    const data = result.data;

    // --- 5. Si es reclamo, el perfil debe existir; el nombre real sale
    //     de la base, nunca del formulario (evita que alguien reclame
    //     "ID 42" pero le ponga otro nombre en el asunto del correo). ---
    let arbitroExistenteNombre: string | undefined;
    if (data.tipo === 'reclamo') {
      const arbitro = data.arbitroId ? await getArbitroById(env.DB, data.arbitroId) : null;
      if (!arbitro) {
        await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
        return redirect(redirectError(origin, 'El perfil que intentas reclamar no existe.'));
      }
      arbitroExistenteNombre = arbitro.nombre_completo;
    }

    // --- 6. Turnstile de verdad ---
    if (!env.TURNSTILE_SECRET_KEY) {
      console.error('TURNSTILE_SECRET_KEY no está definido en el entorno.');
      return redirect(redirectError(origin, 'No se pudo verificar la seguridad del formulario. Intenta más tarde.', reclamoIdFromForm));
    }
    const hostname = new URL(request.url).hostname;
    const captchaOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip, hostname, TURNSTILE_ACTION);
    if (!captchaOk) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(
        redirectError(origin, 'Verificación de seguridad fallida. Recarga la página e intenta de nuevo.', reclamoIdFromForm)
      );
    }

    // Recién ahora, con todo validado, contamos el intento como legítimo
    // (los intentos fallidos de arriba ya sumaron al rate limit por su cuenta).
    await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });

    // --- 7. Corte preventivo de cuota de Resend ---
    const hasQuota = await reserveEmailQuota(env.DB);
    if (!hasQuota) {
      console.error('Cuota mensual de emails agotada: postulación de árbitro no enviada.');
      return redirect(redirectError(origin, 'No se pudo enviar tu postulación en este momento. Intenta más tarde.', reclamoIdFromForm));
    }

    // --- 8. Enviar ---
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.ARBITROS_NOTIFY_EMAIL) {
      console.error('Faltan variables de Resend en el entorno (RESEND_API_KEY / RESEND_FROM_EMAIL / ARBITROS_NOTIFY_EMAIL).');
      return redirect(redirectError(origin, 'No se pudo enviar tu postulación en este momento. Intenta más tarde.', reclamoIdFromForm));
    }

    const { subject, text } = buildPostulacionEmail({ data, arbitroExistenteNombre, ip, userAgent });
    const sent = await sendEmail(env.RESEND_API_KEY, {
      to: env.ARBITROS_NOTIFY_EMAIL,
      from: env.RESEND_FROM_EMAIL,
      replyTo: data.email,
      subject,
      text,
    });

    if (!sent) {
      return redirect(redirectError(origin, 'No se pudo enviar tu postulación. Intenta de nuevo en unos minutos.', reclamoIdFromForm));
    }

    return redirect('/arbitros/postular?enviado=1');
  } catch (err) {
    console.error('Error inesperado procesando postulación de árbitro:', err);
    return redirect(redirectError(origin, 'Ocurrió un error inesperado. Intenta de nuevo.'));
  }
};
