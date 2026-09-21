import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { getArbitroById } from '../../lib/arbitros';
import { getEntrenadorById } from '../../lib/entrenadores';
import { validatePostulacion, buildPostulacionEmail, type TipoDirectorio } from '../../lib/postulacion';
import { verifyTurnstile } from '../../lib/turnstile';
import { reserveEmailQuota, sendEmail } from '../../lib/email';

export const prerender = false;

// Un único endpoint para los dos directorios (ver conversación de diseño:
// es solo un correo para revisión humana, no dos flujos de verdad
// distintos). Comparte honeypot, Turnstile, rate limit y cuota de Resend
// -- ahí es donde duplicar hubiera sido puro peso muerto. Lo que NO se
// comparte es el vocabulario de títulos (eso vive en lib/postulacion.ts,
// separado por tipoDirectorio) ni el destino del correo.

const MAX_ATTEMPTS = 4;
const WINDOW_SECONDS = 60 * 60; // 1 hora
// Acción única de Turnstile para ambos directorios: el widget no necesita
// saber qué se está postulando, y un solo rate limit compartido por IP
// es más difícil de esquivar alternando de tipo que uno por directorio.
const TURNSTILE_ACTION = 'postular';

function tipoDirectorioSeguro(form: FormData): TipoDirectorio {
  return form.get('tipo_directorio') === 'entrenador' ? 'entrenador' : 'arbitro';
}

/** Siempre vuelve a /postular (la única página con GET de este flujo). */
function redirectError(origin: string, tipoDirectorio: TipoDirectorio, message: string, perfilId?: number | null) {
  const back = new URL('/postular', origin);
  back.searchParams.set('tipo', tipoDirectorio);
  if (perfilId) back.searchParams.set('reclamo', String(perfilId));
  back.searchParams.set('error', message);
  return back.toString();
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const origin = new URL(request.url).origin;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const userAgent = request.headers.get('User-Agent') ?? '(no disponible)';

  // Antes de leer el form: solo para poder mandar a la persona de vuelta
  // a la página correcta si algo falla más adelante. La validación real
  // de este valor ocurre adentro de validatePostulacion().
  let tipoDirectorioParaError: TipoDirectorio = 'arbitro';

  try {
    // --- 1. Rate limit (barato, antes que todo), compartido entre directorios ---
    const kv = env.RATE_LIMIT_KV;
    const rlKey = `postular:${ip}`;
    const current = await kv.get(rlKey);
    const attempts = current ? parseInt(current, 10) : 0;
    if (attempts >= MAX_ATTEMPTS) {
      return redirect(redirectError(origin, tipoDirectorioParaError, 'Demasiados envíos desde tu conexión. Intenta de nuevo más tarde.'));
    }

    const form = await request.formData();
    tipoDirectorioParaError = tipoDirectorioSeguro(form);
    // Disponible desde acá para todos los redirectError que siguen, así
    // un error a mitad de camino no le hace perder a la persona el
    // contexto de "estoy reclamando el perfil X".
    const perfilIdFromForm = form.get('tipo') === 'reclamo' ? Number(form.get('perfil_id')) || null : null;

    // --- 2. Honeypot: campo oculto que un humano nunca llena ---
    const honeypot = String(form.get('sitio_web') ?? '');
    if (honeypot.trim() !== '') {
      // No delatamos el honeypot: pretendemos éxito y no mandamos nada.
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(`/postular?tipo=${tipoDirectorioParaError}&enviado=1`);
    }

    // --- 3. Turnstile: token presente antes de gastar tiempo validando el resto ---
    const turnstileToken = form.get('cf-turnstile-response');
    if (typeof turnstileToken !== 'string' || turnstileToken.length === 0 || turnstileToken.length > 4096) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(
        redirectError(origin, tipoDirectorioParaError, 'Verificación de seguridad faltante. Recarga la página e intenta de nuevo.', perfilIdFromForm)
      );
    }

    // --- 4. Validación estricta de campos (título correcto según el directorio, ELO, etc.) ---
    const result = validatePostulacion(form);
    if (!result.ok) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(redirectError(origin, tipoDirectorioParaError, result.error, perfilIdFromForm));
    }
    const data = result.data;

    // --- 5. Si es reclamo, el perfil debe existir EN LA TABLA CORRECTA;
    //     el nombre real sale de la base, nunca del formulario (evita que
    //     alguien reclame "ID 42" pero le ponga otro nombre en el asunto). ---
    let perfilExistenteNombre: string | undefined;
    if (data.tipo === 'reclamo') {
      const perfil =
        data.tipoDirectorio === 'arbitro'
          ? await getArbitroById(env.DB, data.perfilId!)
          : await getEntrenadorById(env.DB, data.perfilId!);
      if (!perfil) {
        await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
        return redirect(redirectError(origin, data.tipoDirectorio, 'El perfil que intentas reclamar no existe.'));
      }
      perfilExistenteNombre = perfil.nombre_completo;
    }

    // --- 6. Turnstile de verdad ---
    if (!env.TURNSTILE_SECRET_KEY) {
      console.error('TURNSTILE_SECRET_KEY no está definido en el entorno.');
      return redirect(redirectError(origin, data.tipoDirectorio, 'No se pudo verificar la seguridad del formulario. Intenta más tarde.', data.perfilId));
    }
    const hostname = new URL(request.url).hostname;
    const captchaOk = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, ip, hostname, TURNSTILE_ACTION);
    if (!captchaOk) {
      await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
      return redirect(
        redirectError(origin, data.tipoDirectorio, 'Verificación de seguridad fallida. Recarga la página e intenta de nuevo.', data.perfilId)
      );
    }

    // Recién ahora, con todo validado, contamos el intento como legítimo
    // (los intentos fallidos de arriba ya sumaron al rate limit por su cuenta).
    await kv.put(rlKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });

    // --- 7. Corte preventivo de cuota de Resend ---
    const hasQuota = await reserveEmailQuota(env.DB);
    if (!hasQuota) {
      console.error('Cuota mensual de emails agotada: postulación no enviada.');
      return redirect(redirectError(origin, data.tipoDirectorio, 'No se pudo enviar tu postulación en este momento. Intenta más tarde.', data.perfilId));
    }

    // --- 8. Enviar. Bandeja de entrenadores es opcional: si no está
    //     configurada, cae en la de árbitros (bandeja compartida). ---
    const notifyEmail = data.tipoDirectorio === 'entrenador' ? env.ENTRENADORES_NOTIFY_EMAIL || env.ARBITROS_NOTIFY_EMAIL : env.ARBITROS_NOTIFY_EMAIL;
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !notifyEmail) {
      console.error('Faltan variables de Resend en el entorno (RESEND_API_KEY / RESEND_FROM_EMAIL / *_NOTIFY_EMAIL).');
      return redirect(redirectError(origin, data.tipoDirectorio, 'No se pudo enviar tu postulación en este momento. Intenta más tarde.', data.perfilId));
    }

    const { subject, text } = buildPostulacionEmail({ data, perfilExistenteNombre, ip, userAgent });
    const sent = await sendEmail(env.RESEND_API_KEY, {
      to: notifyEmail,
      from: env.RESEND_FROM_EMAIL,
      replyTo: data.email,
      subject,
      text,
    });

    if (!sent) {
      return redirect(redirectError(origin, data.tipoDirectorio, 'No se pudo enviar tu postulación. Intenta de nuevo en unos minutos.', data.perfilId));
    }

    return redirect(`/postular?tipo=${data.tipoDirectorio}&enviado=1`);
  } catch (err) {
    console.error('Error inesperado procesando postulación:', err);
    return redirect(redirectError(origin, tipoDirectorioParaError, 'Ocurrió un error inesperado. Intenta de nuevo.'));
  }
};
