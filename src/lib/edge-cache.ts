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
