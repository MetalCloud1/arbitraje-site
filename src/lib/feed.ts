// Utilidades compartidas por /rss.xml (RSS 2.0 para MSN y lectores) y
// /news-sitemap.xml (Google News). Todo lo que tiene que ver con armar XML,
// fechas y caché vive acá para que ambos endpoints se comporten igual.

import type { Article } from './db';

export const SITE_NAME = 'La Hora del Arbitraje';
export const SITE_LANGUAGE = 'es';

// ---------- Consulta ----------

const DAY_MS = 24 * 60 * 60 * 1000;

// MSN no ingiere contenido con más de 365 días de antigüedad, y exige que la
// fecha de publicación esté en el pasado. Ambas reglas se aplican acá.
const MAX_AGE_DAYS = 364;

export interface FeedArticle extends Article {
  /** published_at ya convertido a instante real (Date válido, en el pasado). */
  publishedDate: Date;
  /** Última modificación real (updated_at, nunca antes de publishedDate). */
  modifiedDate: Date;
}

/**
 * `published_at` viene del <input type="date"> del panel: "2026-09-18", sin
 * hora. Un feed necesita un instante, y varios artículos del mismo día con
 * exactamente la misma hora se ven mal. Entonces: si trae solo fecha, se le
 * pone la hora (UTC) en que se creó el registro; si ya trae hora, se respeta.
 */
function toInstant(publishedAt: string, createdAt: string | null): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(publishedAt.trim());
  if (!dateOnly) return new Date(publishedAt);

  const timePart = createdAt?.match(/(\d{2}:\d{2}:\d{2})/)?.[1] ?? '12:00:00';
  return new Date(`${publishedAt.trim()}T${timePart}Z`);
}

// D1 guarda datetime('now') como "YYYY-MM-DD HH:MM:SS" en UTC (sin "Z"):
// hay que tratarlo explícitamente como UTC o `new Date` lo lee como hora local.
function parseSqliteUtc(value: string | null): Date | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Últimos artículos publicados, del más nuevo al más viejo. Excluye los que
 * ya vencieron (expires_at), los que tienen fecha futura y los de más de
 * ~1 año. `limit` es el máximo a devolver.
 */
export async function listFeedArticles(
  db: D1Database,
  limit: number,
  { maxAgeDays = MAX_AGE_DAYS }: { maxAgeDays?: number } = {}
): Promise<FeedArticle[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const minDate = new Date(now.getTime() - maxAgeDays * DAY_MS).toISOString().slice(0, 10);

  // Se piden algunos de más porque el filtro fino (fecha+hora real) se hace
  // en JS, y un artículo con fecha de hoy pero hora futura podría caerse.
  const { results } = await db
    .prepare(
      `SELECT * FROM articles
       WHERE published_at >= ?
         AND published_at <= ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY published_at DESC, id DESC
       LIMIT ?`
    )
    .bind(minDate, nowIso, nowIso, limit + 5)
    .all<Article>();

  const items: FeedArticle[] = [];
  for (const article of results ?? []) {
    const publishedDate = toInstant(article.published_at, article.created_at);
    if (Number.isNaN(publishedDate.getTime()) || publishedDate.getTime() > now.getTime()) continue;

    const updated = parseSqliteUtc(article.updated_at);
    const modifiedDate = updated && updated.getTime() > publishedDate.getTime() ? updated : publishedDate;
    items.push({ ...article, publishedDate, modifiedDate });
  }

  return items.slice(0, limit);
}

// ---------- Texto / XML ----------

// Caracteres de control ilegales en XML 1.0 (MSN rechaza ítems que los traen).
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function cleanXmlText(value: string): string {
  return value.replace(ILLEGAL_XML_CHARS, '');
}

export function escapeXml(value: string): string {
  return cleanXmlText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Envuelve HTML en CDATA; "]]>" dentro del contenido cortaría el bloque. */
export function cdata(value: string): string {
  return `<![CDATA[${cleanXmlText(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Convierte entidades HTML (&amp;, &#39;, &nbsp;…) a texto plano. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Texto plano (sin HTML ni entidades) para <description> / abstract. */
export function toPlainText(value: string | null): string {
  if (!value) return '';
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * En el feed no puede haber URLs relativas (MSN las rechaza): convierte
 * src/href que empiezan con "/" a absolutas. Las "//host" (protocol-relative)
 * y las que ya son absolutas se dejan tal cual.
 */
export function absolutizeHtml(html: string, origin: string): string {
  return html.replace(
    /(\s(?:src|href|poster)\s*=\s*)(["'])(\/(?!\/)[^"']*)\2/gi,
    (_m, prefix: string, quote: string, path: string) => `${prefix}${quote}${origin}${path}${quote}`
  );
}

// ---------- Imagen de portada ----------

export interface FeedImage {
  url: string;
  /** MIME type según la extensión de la key en R2. */
  mime: string;
  /** MSN solo acepta JPG/PNG como miniatura (no WebP); WebP sí sirve dentro del cuerpo. */
  usableAsThumbnail: boolean;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function coverImage(coverKey: string | null, origin: string): FeedImage | null {
  if (!coverKey) return null;
  const ext = coverKey.split('.').pop()?.toLowerCase() ?? '';
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  return {
    url: `${origin}/api/img/${coverKey}`,
    mime,
    usableAsThumbnail: mime === 'image/jpeg' || mime === 'image/png',
  };
}

// ---------- Fechas ----------

export function toRfc822(date: Date): string {
  return date.toUTCString(); // "Fri, 18 Sep 2026 14:30:00 GMT" (RFC 822/1123)
}

export function toRfc3339(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ---------- Respuesta con caché de borde + 304 ----------

interface CacheRuntime {
  caches: { default: any };
  ctx: { waitUntil(promise: Promise<any>): void };
}

export interface BuiltXml {
  body: string;
  /** Instante de la última modificación del contenido (para Last-Modified). */
  lastModified: Date | null;
}

async function etagOf(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `"${hex}"`;
}

function isNotModified(request: Request, etag: string | null, lastModified: string | null): boolean {
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch && etag) {
    const norm = (tag: string) => tag.trim().replace(/^W\//, '');
    return ifNoneMatch.trim() === '*' || ifNoneMatch.split(',').some((tag) => norm(tag) === norm(etag));
  }

  const ifModifiedSince = request.headers.get('if-modified-since');
  if (ifModifiedSince && lastModified) {
    const since = Date.parse(ifModifiedSince);
    const modified = Date.parse(lastModified);
    return !Number.isNaN(since) && !Number.isNaN(modified) && modified <= since;
  }

  return false;
}

/**
 * Sirve un XML generado a pedido, con:
 *  - caché de borde de Cloudflare (Cache API) durante `ttlSeconds`, así D1
 *    solo se consulta una vez por ventana aunque los bots pregunten seguido;
 *  - ETag + Last-Modified y respuesta 304 (MSN los usa para no reprocesar
 *    un feed que no cambió).
 * La clave de caché ignora query strings: es una URL fija a propósito.
 */
export async function serveXml(opts: {
  request: Request;
  url: URL;
  runtime: CacheRuntime;
  path: string;
  contentType: string;
  ttlSeconds: number;
  build: () => Promise<BuiltXml>;
}): Promise<Response> {
  const { request, url, runtime, path, contentType, ttlSeconds, build } = opts;
  const cache = runtime.caches.default;
  const cacheKey = `${url.origin}${path}`;

  const cached = (await cache.match(cacheKey)) as Response | undefined;
  if (cached) {
    if (isNotModified(request, cached.headers.get('ETag'), cached.headers.get('Last-Modified'))) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: cached.headers.get('ETag') ?? '',
          'Cache-Control': cached.headers.get('Cache-Control') ?? '',
        },
      });
    }
    return cached;
  }

  const { body, lastModified } = await build();
  const etag = await etagOf(body);
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': `public, max-age=${ttlSeconds}`,
    ETag: etag,
  };
  if (lastModified) headers['Last-Modified'] = lastModified.toUTCString();

  if (isNotModified(request, etag, headers['Last-Modified'] ?? null)) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': headers['Cache-Control'] } });
  }

  const response = new Response(body, { headers });
  runtime.ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
