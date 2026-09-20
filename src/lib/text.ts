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

// El sanitizador vive en widgets/sanitize.ts (lista blanca con parser HTML real,
// más validación de widgets). Se re-exporta acá para no cambiar los imports.
export { sanitizeHtml, sanitizeArticleHtml } from './widgets/sanitize';

/**
 * Quita los widgets (<figure data-widget>…</figure>) del HTML. Su contenido
 * alternativo (lista de jugadas, FEN, preguntas) no es texto del artículo:
 * no debe contar para el tiempo de lectura ni terminar en el extracto.
 * Seguro con una regex porque el sanitizador emite los widgets en forma
 * canónica: el valor de los atributos va escapado y nunca anida otro <figure>.
 */
export function stripWidgets(html: string): string {
  return html.replace(/<figure\b[^>]*\bdata-widget=[^>]*>[\s\S]*?<\/figure>/gi, ' ');
}

/**
 * Para el RSS: los lectores de feeds no ejecutan JavaScript, así que del widget
 * solo sirve el contenido alternativo. Se quitan los data-* (p. ej. el JSON de
 * una trivia) para no llenar el feed de atributos que nadie usa.
 */
export function simplifyWidgetsForFeed(html: string): string {
  return html.replace(/<figure\b[^>]*\bdata-widget=[^>]*>/gi, '<figure>');
}

export function estimateReadMinutes(html: string): number {
  const words = stripWidgets(html).replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function excerptFromHtml(html: string, maxLen = 160): string {
  const text = stripWidgets(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen - 1).trimEnd() + '…' : text;
}

export function formatDateEs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
}

// ---------- Corte tras el primer párrafo ----------

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr']);
const TEXT_BLOCKS = new Set(['p', 'div']);
const ANY_BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'table', 'figure', 'pre']);

function hasText(fragment: string): boolean {
  return fragment.replace(/&nbsp;|\s/gi, '').length > 0;
}

/**
 * Parte el HTML del artículo justo después de su primer párrafo con texto,
 * para poder insertar ahí la imagen/video sin dejarlos al final ni empujar
 * el arranque de la lectura. Solo corta en el nivel superior (nunca dentro
 * de una cita o lista, que quedaría con etiquetas sin cerrar).
 *
 * El editor del panel (contenteditable) puede producir tres formas de
 * primer párrafo, y las tres se reconocen: <p>…</p>, <div>…</div>, o texto
 * suelto seguido de un <br> o de otro bloque. Un encabezado, lista o cita
 * al inicio no cuenta como "párrafo": se sigue buscando más adelante.
 *
 * Si no hay dónde cortar devuelve head = "" y tail = el HTML completo (la
 * media va entonces antes del texto, no al final).
 */
export function splitAfterFirstParagraph(html: string): { head: string; tail: string } {
  const tagRe = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi;
  let depth = 0;
  let cursor = 0;
  let topText = false; // texto suelto a nivel superior (sin etiqueta contenedora)
  let blockText = false; // texto dentro del bloque de nivel superior actual

  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    const [tag, slash, rawName, selfClose] = match;
    const name = rawName.toLowerCase();
    const segment = html.slice(cursor, match.index);
    cursor = match.index + tag.length;

    if (hasText(segment)) {
      if (depth === 0) topText = true;
      else blockText = true;
    }

    if (VOID_TAGS.has(name) || selfClose) {
      // <br> tras texto suelto = fin de la primera línea.
      if (name === 'br' && depth === 0 && topText) {
        return { head: html.slice(0, cursor), tail: html.slice(cursor) };
      }
      continue;
    }

    if (!slash) {
      // Texto suelto seguido de un bloque: ese texto era el primer párrafo.
      if (depth === 0 && topText && ANY_BLOCKS.has(name)) {
        return { head: html.slice(0, match.index), tail: html.slice(match.index) };
      }
      if (depth === 0) blockText = false;
      depth++;
    } else {
      depth = Math.max(depth - 1, 0);
      if (depth === 0) {
        if (TEXT_BLOCKS.has(name) && blockText) {
          return { head: html.slice(0, cursor), tail: html.slice(cursor) };
        }
        blockText = false;
      }
    }
  }

  return { head: '', tail: html };
}

/**
 * Envuelve cada <table> en un contenedor con scroll horizontal (.table-scroll)
 * para que una tabla ancha se desplace sola en el celular en vez de salirse
 * de la pantalla. Solo para mostrar en la página: lo guardado en la base de
 * datos y el feed RSS conservan la tabla sin envoltorio.
 */
export function wrapTables(html: string): string {
  return html
    .replace(/<table\b/gi, '<div class="table-scroll"><table')
    .replace(/<\/table>/gi, '</table></div>');
}