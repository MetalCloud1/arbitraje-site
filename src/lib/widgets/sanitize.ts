// Sanitizador del HTML de los artículos. Reemplaza al antiguo basado en
// expresiones regulares (que dejaba pasar, por ejemplo, <scr<script>…).
//
// Cómo funciona: un parser HTML real (htmlparser2) recorre la entrada y se
// RE-ESCRIBE la salida desde cero solo con etiquetas y atributos de una lista
// blanca. Todo lo demás se descarta: nada "se filtra", solo lo permitido se
// reconstruye. El texto y los valores de atributos se escapan siempre.
//
// Los widgets (<figure data-widget="…">) se validan con schema.ts y se
// vuelven a emitir en su forma canónica, con contenido alternativo generado
// por el servidor: lo que el autor escriba dentro del widget se ignora.
//
// Es JS puro, sin APIs de Node ni de Workers, así que funciona igual en
// `astro dev`, en el build y en Cloudflare.

import { Parser } from 'htmlparser2';
import { escapeAttr, escapeHtml, isWidgetType, normalizeWidget, renderWidgetElement, type RawWidget } from './schema';
import { CALLOUT_CLASSES, DIVIDER_CLASSES, HEADING_CLASSES, IMG_CLASSES, LIST_CLASSES, MARK_CLASSES, QUOTE_CLASSES } from './article-classes';

const VOID_TAGS = new Set(['br', 'hr', 'img']);

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'code', 'pre',
  'ul', 'ol', 'li', 'blockquote',
  'a', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'figure', 'figcaption', 'details', 'summary',
  'div',
]);

// Etiquetas que solo se dejan pasar si, tras limpiar sus atributos, les quedó
// una clase reconocida (ver ATTRS más abajo); si no, se tratan como etiqueta
// desconocida (se quita la etiqueta, se conserva el contenido). Hoy es solo
// <div>: sirve para los recuadros destacados sin abrirle la puerta a
// cualquier <div> suelto.
const REQUIRES_CLASS = new Set(['div']);

// El título del artículo ya es el <h1> de la página.
const TAG_ALIASES: Record<string, string> = { h1: 'h2', h5: 'h4', h6: 'h4' };

// Etiquetas que se eliminan CON su contenido (texto incluido).
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'template',
  'textarea', 'title', 'svg', 'math', 'head', 'xmp', 'noembed', 'noframes', 'plaintext', 'select',
  'audio', 'video', 'canvas', 'form',
]);

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** Devuelve la URL si es segura (esquema permitido o ruta relativa); si no, null. */
export function safeUrl(value: string): string | null {
  const v = value.trim();
  if (!v || v.length > 2048) return null;
  // Los navegadores ignoran espacios y caracteres de control dentro del esquema
  // ("java\tscript:"), así que el esquema se evalúa sobre la versión compactada.
  // eslint-disable-next-line no-control-regex
  const compact = v.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  const scheme = compact.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) return SAFE_SCHEMES.has(scheme[1].toLowerCase()) ? v : null;
  return v;
}

const digits = (value: string, max: number): string | null => {
  const n = /^\d{1,4}$/.test(value.trim()) ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? String(n) : null;
};

/** Limpiador de atributo "class": deja solo los tokens que estén en `allowed`, descarta el resto en silencio. */
const classAttr = (allowed: Set<string>) => (value: string): string | null => {
  const kept = value
    .trim()
    .split(/\s+/)
    .filter((token) => allowed.has(token));
  return kept.length ? Array.from(new Set(kept)).join(' ') : null;
};

/** Atributos permitidos por etiqueta → función que devuelve el valor limpio o null. */
const ATTRS: Record<string, Record<string, (v: string) => string | null>> = {
  a: {
    href: safeUrl,
    title: (v) => v.slice(0, 200),
    target: (v) => (v === '_blank' ? v : null),
  },
  img: {
    src: (v) => {
      const url = safeUrl(v);
      return url && !/^(mailto|tel):/i.test(url) ? url : null;
    },
    alt: (v) => v.slice(0, 300),
    title: (v) => v.slice(0, 200),
    width: (v) => digits(v, 5000),
    height: (v) => digits(v, 5000),
    class: classAttr(IMG_CLASSES),
  },
  figure: { class: classAttr(IMG_CLASSES) },
  mark: { class: classAttr(MARK_CLASSES) },
  h2: { class: classAttr(HEADING_CLASSES) },
  h3: { class: classAttr(HEADING_CLASSES) },
  h4: { class: classAttr(HEADING_CLASSES) },
  blockquote: { class: classAttr(QUOTE_CLASSES) },
  ul: { class: classAttr(LIST_CLASSES) },
  ol: { start: (v) => digits(v, 9999), class: classAttr(LIST_CLASSES) },
  hr: { class: classAttr(DIVIDER_CLASSES) },
  div: { class: classAttr(CALLOUT_CLASSES) },
  th: { colspan: (v) => digits(v, 50), rowspan: (v) => digits(v, 50) },
  td: { colspan: (v) => digits(v, 50), rowspan: (v) => digits(v, 50) },
  details: { open: () => '' },
};

interface Frame {
  /** Etiqueta de cierre a emitir (null si no se emitió apertura o es vacía). */
  close: string | null;
  /** Se ignora todo el contenido hasta cerrar este marco. */
  skip: boolean;
}

export interface SanitizeResult {
  html: string;
  /** Mensajes de widgets inválidos que se descartaron. */
  errors: string[];
}

function buildOpenTag(name: string, attribs: Record<string, string>): string {
  const rules = ATTRS[name];
  let out = `<${name}`;
  if (rules) {
    for (const [attr, clean] of Object.entries(rules)) {
      if (!(attr in attribs)) continue;
      const value = clean(attribs[attr] ?? '');
      if (value === null) continue;
      out += value === '' && attr === 'open' ? ' open' : ` ${attr}="${escapeAttr(value)}"`;
    }
  }
  if (name === 'a' && out.includes(' target="_blank"')) out += ' rel="noopener noreferrer"';
  return out + '>';
}

/** Sanitiza el HTML de un artículo y valida sus widgets. */
export function sanitizeArticleHtml(input: string): SanitizeResult {
  const out: string[] = [];
  const errors: string[] = [];
  const stack: Frame[] = [];
  let skipping = 0; // cuántos marcos de la pila descartan su contenido

  const parser = new Parser(
    {
      onopentag(rawName, attribs) {
        if (skipping > 0) {
          stack.push({ close: null, skip: false });
          return;
        }

        // Cualquier elemento con data-widget es un candidato a widget.
        if ('data-widget' in attribs) {
          const type = attribs['data-widget'];
          if (isWidgetType(type)) {
            const raw: RawWidget = {};
            for (const [key, value] of Object.entries(attribs)) {
              if (key.startsWith('data-') && key !== 'data-widget') raw[key.slice(5)] = value;
            }
            const result = normalizeWidget(type, raw);
            if (result.ok) out.push(renderWidgetElement(type, result.attrs, result.fallback));
            else errors.push(result.error);
          } else {
            errors.push(`Tipo de widget desconocido: "${type}".`);
          }
          stack.push({ close: null, skip: true });
          skipping++;
          return;
        }

        if (DROP_WITH_CONTENT.has(rawName)) {
          stack.push({ close: null, skip: true });
          skipping++;
          return;
        }

        const name = TAG_ALIASES[rawName] ?? rawName;
        if (ALLOWED_TAGS.has(name)) {
          const openTag = buildOpenTag(name, attribs);
          if (REQUIRES_CLASS.has(name) && !openTag.includes(' class="')) {
            // Sin una clase reconocida (p. ej. <div> a secas): se trata como
            // etiqueta desconocida, igual que antes de existir esta lista.
            stack.push({ close: null, skip: false });
          } else {
            out.push(openTag);
            stack.push({ close: VOID_TAGS.has(name) ? null : name, skip: false });
          }
        } else {
          // Etiqueta desconocida (span, font…): se quita la etiqueta y se conserva el texto.
          stack.push({ close: null, skip: false });
        }
      },

      ontext(text) {
        if (skipping === 0) out.push(escapeHtml(text));
      },

      onclosetag() {
        const frame = stack.pop();
        if (!frame) return;
        if (frame.skip) skipping--;
        else if (frame.close && skipping === 0) out.push(`</${frame.close}>`);
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
  );

  parser.write(input);
  parser.end();

  return { html: out.join(''), errors };
}

/** Versión simple: solo devuelve el HTML limpio. */
export function sanitizeHtml(input: string): string {
  return sanitizeArticleHtml(input).html;
}