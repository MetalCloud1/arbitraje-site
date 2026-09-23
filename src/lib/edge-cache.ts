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

export function isCacheablePagePath(pathname: string): boolean {
  if (CACHEABLE_STATIC_PAGES.has(pathname)) return true;
  return CACHEABLE_SECTION_PREFIXES.some(
    (prefix) =>
      pathname === prefix || (pathname.startsWith(prefix + '/') && !pathname.endsWith('/postular'))
  );
}

export function ttlForPagePath(pathname: string): number {
  const isListing = CACHEABLE_STATIC_PAGES.has(pathname) || CACHEABLE_SECTION_PREFIXES.includes(pathname);
  return isListing ? LISTING_TTL_SECONDS : DETAIL_TTL_SECONDS;
}