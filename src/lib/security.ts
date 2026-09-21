// Cabeceras de seguridad y verificación de origen. Centralizado acá para que
// middleware.ts quede corto y todo se ajuste desde un solo sitio.

import { EMBED_HOSTS } from './widgets/schema';

/**
 * La CSP arranca en modo "solo reportar" (Report-Only): el navegador NO bloquea
 * nada, solo anota en la consola de DevTools lo que bloquearía. Recorre el
 * sitio (portada, un artículo con widgets, /postular, /admin) con la consola
 * abierta; si no aparece ninguna violación legítima, cambia esto a `true`.
 */
export const CSP_ENFORCE = false;

/** Sitios que pueden cargarse en un <iframe>: los embeds de widgets, el video de artículo y Turnstile. */
const FRAME_SOURCES = [
  ...Object.keys(EMBED_HOSTS).map((host) => `https://${host}`),
  'https://www.facebook.com',
  'https://challenges.cloudflare.com',
];

/**
 * Lo que la CSP aporta hoy, aun con scripts inline (los generan Astro y
 * Turnstile): connect-src 'self' impide que un widget mande datos a otro
 * dominio, frame-src limita los iframes a la lista blanca, y object-src,
 * base-uri y form-action cierran vectores clásicos de inyección.
 * 'unsafe-inline' en script-src queda por Astro; el sanitizador y la lista
 * blanca de widgets son la defensa principal contra scripts inyectados.
 */
export function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self'",
    "connect-src 'self'",
    `frame-src ${FRAME_SOURCES.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Protección CSRF para las rutas /api: una petición que cambia datos solo se
 * acepta si viene de este mismo origen. Los navegadores mandan `Origin` y
 * `Sec-Fetch-Site` y una página ajena no puede falsificarlos. Las peticiones
 * sin esas cabeceras (curl, scripts) pasan igual, pero siguen necesitando sesión.
 */
export function isCrossOriginWrite(request: Request, siteOrigin: string): boolean {
  if (!UNSAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get('origin');
  if (origin && origin !== siteOrigin) return true;
  const fetchSite = request.headers.get('sec-fetch-site');
  return !!fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none';
}

/** Añade CSP y cabeceras básicas a las respuestas HTML. Devuelve la misma respuesta si no es HTML. */
export function withSecurityHeaders(response: Response): Response {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) return response;
  // Se clona la respuesta porque las cabeceras de la original pueden ser inmutables.
  const next = new Response(response.body, response);
  next.headers.set(CSP_ENFORCE ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', buildCsp());
  next.headers.set('X-Content-Type-Options', 'nosniff');
  next.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return next;
}
