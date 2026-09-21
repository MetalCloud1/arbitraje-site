// Detecta si un link es de YouTube o Facebook y genera lo necesario
// para insertarlo como video embebido (sin almacenar el archivo).

export type VideoProvider = 'youtube' | 'facebook';

export interface ParsedVideo {
  provider: VideoProvider;
  /** URL original tal como la pegó el admin (se usa para el embed de Facebook). */
  originalUrl: string;
  /** URL lista para poner en el src de un <iframe>. */
  embedUrl: string;
  /** Miniatura disponible sin API (solo YouTube; Facebook no ofrece una gratis). */
  thumbnailUrl: string | null;
}

function extractYoutubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return id || null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      return url.searchParams.get('v');
    }
    if (url.pathname.startsWith('/shorts/')) {
      return url.pathname.split('/')[2] || null;
    }
    if (url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/')[2] || null;
    }
    if (url.pathname.startsWith('/live/')) {
      return url.pathname.split('/')[2] || null;
    }
  }

  return null;
}

function isFacebookHost(url: URL): boolean {
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  return host === 'facebook.com' || host === 'fb.watch';
}

/**
 * Valida un link pegado por el admin y devuelve los datos necesarios
 * para embeberlo. Lanza un Error con mensaje legible si el link no
 * corresponde a YouTube o Facebook.
 */
export function parseVideoUrl(rawUrl: string): ParsedVideo {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('El link de video no es una URL válida.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('El link de video debe empezar con http:// o https://.');
  }

  const youtubeId = extractYoutubeId(url);
  if (youtubeId) {
    return {
      provider: 'youtube',
      originalUrl: url.toString(),
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  if (isFacebookHost(url)) {
    // El "Video Plugin" de Facebook acepta cualquier link público a un
    // video o a una publicación que contenga un video, sin necesidad de
    // App ID ni token para contenido público.
    const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
      url.toString()
    )}&show_text=false`;
    return {
      provider: 'facebook',
      originalUrl: url.toString(),
      embedUrl,
      thumbnailUrl: null,
    };
  }

  throw new Error('El link de video debe ser de YouTube o de Facebook.');
}

/** Igual que parseVideoUrl pero devuelve null en vez de lanzar (para renderizar). */
export function parseVideoUrlSafe(rawUrl: string | null | undefined): ParsedVideo | null {
  if (!rawUrl) return null;
  try {
    return parseVideoUrl(rawUrl);
  } catch {
    return null;
  }
}

export interface ArticleThumbnail {
  /** true si el artículo tiene un video asociado (se debe mostrar el ícono de play). */
  isVideo: boolean;
  /**
   * URL de la imagen a usar como fondo de la miniatura. Puede ser:
   * la miniatura automática de YouTube, la imagen de portada subida
   * (usada también como respaldo para videos de Facebook, que no
   * ofrecen miniatura automática), o null si no hay ninguna.
   */
  imageUrl: string | null;
}

/**
 * Resuelve qué imagen usar como miniatura de un artículo en tarjetas y
 * listados, centralizando la prioridad video > portada manual.
 */
export function resolveThumbnail(article: {
  video_url: string | null;
  cover_key: string | null;
}): ArticleThumbnail {
  const video = parseVideoUrlSafe(article.video_url);
  const coverUrl = article.cover_key ? `/api/img/${article.cover_key}` : null;

  if (video) {
    return { isVideo: true, imageUrl: video.thumbnailUrl ?? coverUrl };
  }
  return { isVideo: false, imageUrl: coverUrl };
}