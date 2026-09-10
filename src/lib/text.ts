export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

/**
 * Limpia el HTML que sale del editor del panel antes de guardarlo.
 * El admin es una sola persona de confianza, pero igual quitamos
 * scripts, handlers inline y esquemas peligrosos como defensa extra.
 */
export function sanitizeHtml(html: string): string {
  return html
    // Tags peligrosos completos (incluye contenido)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Tags que embeben otros documentos/objetos, no hacen falta en un artículo
    .replace(/<\/?(iframe|object|embed|link|meta|base)\b[^>]*>/gi, '')
    // Manejadores de eventos on* con comillas dobles, simples, o SIN comillas
    // (ej. <img src=x onerror=alert(1)> no llevaba comillas y antes pasaba el filtro)
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    // Esquemas javascript:/data: en atributos que navegan o cargan recursos
    .replace(/\s(href|src|action|formaction)\s*=\s*"javascript:[^"]*"/gi, ' $1="#"')
    .replace(/\s(href|src|action|formaction)\s*=\s*'javascript:[^']*'/gi, " $1='#'")
    .replace(/\s(href|src|action|formaction)\s*=\s*javascript:[^\s>]*/gi, ' $1="#"')
    // style="...url(javascript:...)" o expression() (viejo IE, pero barato de bloquear)
    .replace(/\sstyle\s*=\s*"[^"]*(javascript:|expression\()[^"]*"/gi, '')
    .replace(/\sstyle\s*=\s*'[^']*(javascript:|expression\()[^']*'/gi, '');
}

export function estimateReadMinutes(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function excerptFromHtml(html: string, maxLen = 160): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen - 1).trimEnd() + '…' : text;
}

export function formatDateEs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
}
