import type { APIRoute } from 'astro';

// Los tipos de Response del runtime de Cloudflare y los globales no coinciden
// del todo (mismo motivo que en api/arbitros/directorio.ts): la Cache API se
// usa con casts.

export const prerender = false;

// Las claves de R2 son únicas por subida (timestamp + uuid) y nunca se
// reescriben, así que el contenido de una URL no cambia jamás: se puede
// cachear "para siempre" tanto en el navegador como en el borde.
const IMMUTABLE = 'public, max-age=31536000, immutable';

// Un 404 se cachea poco tiempo: evita que pedir claves inexistentes en
// bucle dispare una lectura de R2 por cada intento, pero no deja "pegada"
// una imagen que se sube justo después.
const NOT_FOUND_TTL_SECONDS = 60;

function notModified(request: Request, etag: string | null): boolean {
  const ifNoneMatch = request.headers.get('if-none-match');
  if (!ifNoneMatch || !etag) return false;
  const norm = (tag: string) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.trim() === '*' || ifNoneMatch.split(',').some((tag) => norm(tag) === norm(etag));
}

export const GET: APIRoute = async ({ params, request, url, locals }) => {
  const { env, caches, ctx } = locals.runtime;
  const key = params.key;

  if (!key) {
    return new Response('No encontrado', { status: 404 });
  }

  // Caché de borde (Cache API): si la imagen ya está en este centro de datos
  // no se toca R2 ni se lee el objeto. Cada centro de datos tiene su propia
  // copia, así que hay como máximo una lectura de R2 por imagen y por centro
  // de datos mientras la copia siga en caché (no es garantía eterna).
  const cache = caches.default;
  const cacheKey = `${url.origin}/api/img/${key}`;

  const cached = (await cache.match(cacheKey)) as Response | undefined;
  if (cached) {
    if (notModified(request, cached.headers.get('ETag'))) {
      return new Response(null, { status: 304, headers: { ETag: cached.headers.get('ETag') ?? '', 'Cache-Control': IMMUTABLE } });
    }
    const hit = new Response(cached.body, cached);
    hit.headers.set('X-Img-Cache', 'HIT');
    return hit;
  }

  const object = await env.IMAGES.get(key);
  if (!object) {
    const missing = new Response('No encontrado', {
      status: 404,
      headers: { 'Cache-Control': `public, max-age=${NOT_FOUND_TTL_SECONDS}` },
    });
    ctx.waitUntil(cache.put(cacheKey, missing.clone() as unknown as any));
    return missing;
  }

  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
    'Cache-Control': IMMUTABLE,
    ETag: object.httpEtag,
  });

  if (notModified(request, object.httpEtag)) {
    return new Response(null, { status: 304, headers: { ETag: object.httpEtag, 'Cache-Control': IMMUTABLE } });
  }

  const response = new Response(object.body, { headers });
  ctx.waitUntil(cache.put(cacheKey, response.clone() as unknown as any));

  const miss = new Response(response.body, response);
  miss.headers.set('X-Img-Cache', 'MISS');
  return miss;
};