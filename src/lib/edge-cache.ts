// Cache API de Cloudflare (caché de borde del centro de datos actual).
//
// Desde Astro 6 / @astrojs/cloudflare v13 `Astro.locals.runtime.caches` ya no
// existe: se usa el objeto global `caches` del runtime de Workers. `default`
// no forma parte del tipo CacheStorage del DOM, y sus Request/Response son los
// de @cloudflare/workers-types (compatibles en runtime, no en tipos), así que
// el cast vive aquí, en un solo lugar, en vez de repartido por cada endpoint.
export interface EdgeCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

export function getEdgeCache(): EdgeCache {
  return (globalThis as unknown as { caches: { default: EdgeCache } }).caches.default;
}

// Páginas públicas (HTML, sin sesión) seguras para cachear en el borde: no
// dependen de Astro.locals.session ni fijan cookies (verificado a mano, no
// hay locals.session ni Set-Cookie fuera de /admin y /api/auth). Los
// listados cambian más seguido (nuevo artículo, nueva alta) que las fichas
// de detalle (una vez publicadas, rara vez cambian), de ahí el TTL distinto.
// Se excluyen a propósito los formularios /postular: son POST-Redirect-GET
// y no vale la pena cachear su estado de confirmación (?enviado=1/?error=).
const CACHEABLE_STATIC_PAGES = new Set([
  '/',
  '/sobre-nosotros',
  '/politica-de-privacidad',
  '/terminos-y-condiciones',
  '/cursos',
  '/formacion',
]);

const CACHEABLE_SECTION_PREFIXES = ['/articulos', '/arbitros', '/entrenadores', '/clubes'];

const LISTING_TTL_SECONDS = 60;
const DETAIL_TTL_SECONDS = 300;

// Tiempo que el NAVEGADOR puede reutilizar la página sin preguntar. Va aparte
// del TTL del borde (s-maxage): antes ambos eran el mismo `max-age`, así que
// tras publicar o mandar algo a la papelera un visitante podía seguir viendo la
// versión vieja hasta 5 minutos en su propio navegador. Ahora los listados
// siempre consultan al borde (que es rápido) y las fichas se reutilizan 1 min.
const LISTING_BROWSER_TTL_SECONDS = 0;
const DETAIL_BROWSER_TTL_SECONDS = 60;

export function isCacheablePagePath(pathname: string): boolean {
  if (CACHEABLE_STATIC_PAGES.has(pathname)) return true;
  return CACHEABLE_SECTION_PREFIXES.some(
    (prefix) =>
      pathname === prefix || (pathname.startsWith(prefix + '/') && !pathname.endsWith('/postular'))
  );
}

function isListingPath(pathname: string): boolean {
  return CACHEABLE_STATIC_PAGES.has(pathname) || CACHEABLE_SECTION_PREFIXES.includes(pathname);
}

export function ttlForPagePath(pathname: string): number {
  return isListingPath(pathname) ? LISTING_TTL_SECONDS : DETAIL_TTL_SECONDS;
}

/** Cache-Control de una página pública: borde (s-maxage) y navegador (max-age) por separado. */
export function cacheControlForPagePath(pathname: string): string {
  const browser = isListingPath(pathname) ? LISTING_BROWSER_TTL_SECONDS : DETAIL_BROWSER_TTL_SECONDS;
  return `public, max-age=${browser}, s-maxage=${ttlForPagePath(pathname)}`;
}

// Única lista de parámetros que cambian el HTML de una página pública cacheable
// (filtros del directorio y de /articulos). Todo lo demás (utm_*, fbclid, gclid,
// ref, un parámetro cualquiera que invente un bot...) no altera la página, así
// que no debe crear una entrada de caché distinta. Si una página nueva empieza
// a leer otro parámetro, hay que agregarlo aquí.
const CACHE_KEY_PARAMS = new Set(['pais', 'estado', 'titulo', 'categoria', 'buscar']);

/**
 * Clave de caché canónica: solo los parámetros permitidos, en orden estable y
 * sin barra final. Dos URLs que producen la misma respuesta comparten entrada.
 */
export function canonicalCacheKey(url: URL, allowedParams: ReadonlySet<string>): string {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const key = new URL(path || '/', url.origin);
  const kept = [...url.searchParams].filter(([name]) => allowedParams.has(name));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : a === b ? 0 : 1));
  for (const [name, value] of kept) key.searchParams.append(name, value);
  return key.toString();
}

/** Clave de caché de una página pública (ver CACHE_KEY_PARAMS). */
export function pageCacheKey(url: URL): string {
  return canonicalCacheKey(url, CACHE_KEY_PARAMS);
}
