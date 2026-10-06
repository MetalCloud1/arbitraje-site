// Lista blanca de clases CSS "pre-aprobadas" que un autor puede escribir a
// mano en un artículo (modo HTML del editor). No es CSS libre: son nombres
// fijos, el diseño real vive en src/styles/global.css. Cualquier clase que no
// esté acá se descarta en silencio (ver sanitize.ts).
//
// Este archivo es la ÚNICA fuente de verdad: tanto el sanitizador (lo que se
// guarda y se sirve) como las extensiones de Tiptap (lo que sobrevive al
// pasar por el editor visual) leen de acá, para que nunca queden
// desincronizados entre sí.

/** Tamaño de una imagen o figura. Sin ninguna de estas clases, ocupa el ancho completo (comportamiento actual). */
export const IMG_SIZE_CLASSES = new Set(['art-img-small', 'art-img-medium', 'art-img-large', 'art-img-full']);
/** Alineación de una imagen o figura respecto al texto. Izquierda/derecha envuelven el texto alrededor. */
export const IMG_ALIGN_CLASSES = new Set(['art-img-left', 'art-img-center', 'art-img-right']);
export const IMG_CLASSES = new Set([...IMG_SIZE_CLASSES, ...IMG_ALIGN_CLASSES]);

/** Resaltado de texto sobre <mark>, con la paleta de colores que ya usa el sitio. */
export const MARK_CLASSES = new Set(['art-highlight-brand', 'art-highlight-alert', 'art-highlight-muted']);

/** Color de acento sobre h2/h3/h4, misma paleta que el resaltado de texto. */
export const HEADING_CLASSES = new Set(['art-heading-brand', 'art-heading-alert', 'art-heading-muted']);

/** Variantes de <blockquote>. Se pueden combinar: "art-quote-pullout art-quote-serif". */
export const QUOTE_CLASSES = new Set(['art-quote-pullout', 'art-quote-serif']);

/** Variantes de <ul>/<ol>. */
export const LIST_CLASSES = new Set(['art-list-compact', 'art-list-unstyled']);

/** Variante decorativa de <hr>. */
export const DIVIDER_CLASSES = new Set(['art-divider']);

/**
 * Recuadros destacados. Van sobre <div>, que por lo demás sigue sin estar
 * permitido: sin ninguna de estas clases, un <div> se trata como etiqueta
 * desconocida (se quita, se conserva el contenido), igual que hoy.
 */
export const CALLOUT_CLASSES = new Set(['art-callout', 'art-callout-info', 'art-callout-warning']);

/**
 * Bloques de diseño (columnas y conector). Van sobre <div>, igual que los
 * recuadros, y el sanitizador (sanitize.ts) además les impone estructura:
 *
 *   <div class="art-cols">                       2 o 3 hijos "art-col"
 *     <div class="art-col">…contenido…</div>     (máximo 3 columnas)
 *     <div class="art-conn art-conn-arrow"></div> opcional, solo entre 2 columnas
 *     <div class="art-col">…contenido…</div>
 *   </div>
 *
 * El autor solo escribe "art-cols"; el sanitizador calcula las clases
 * canónicas (cuántas columnas hay, si hay conector) y envuelve el bloque en
 * <div class="art-layout"> (el "contenedor" sobre el que el CSS decide, según
 * el ancho REAL disponible y no el de la pantalla, cuántas columnas caben).
 * "art-layout" también se acepta al leer (el HTML ya guardado lo trae): es
 * transparente, no se duplica.
 */
export const LAYOUT_WRAP_CLASS = 'art-layout';
export const COLS_CLASS = 'art-cols';
export const COL_CLASS = 'art-col';
export const CONN_CLASS = 'art-conn';

/** Símbolos del conector (lista cerrada; el dibujo está en CSS, no hay SVG ni texto libre). */
export const CONN_KINDS = ['arrow', 'vs', 'plus', 'equals'] as const;
export type ConnKind = (typeof CONN_KINDS)[number];

/** Topes de diseño: protegen el peso de la página y evitan anidaciones que no caben en un celular. */
export const MAX_COLUMNS = 3;
export const MAX_LAYOUT_BLOCKS = 12;

/** Clase CSS canónica de un bloque de columnas según cuántas tiene y si lleva conector. */
export function colsClass(columns: number, hasConnector: boolean): string {
  if (columns >= 3) return `${COLS_CLASS} ${COLS_CLASS}-3`;
  if (columns === 2) return `${COLS_CLASS} ${COLS_CLASS}-2${hasConnector ? ` ${COLS_CLASS}-conn` : ''}`;
  return `${COLS_CLASS} ${COLS_CLASS}-1`;
}

/** Primer tipo de conector reconocido en una lista de clases; "arrow" por defecto. */
export function connKindOf(classValue: string | null | undefined): ConnKind {
  const tokens = (classValue ?? '').split(/\s+/);
  for (const kind of CONN_KINDS) if (tokens.includes(`${CONN_CLASS}-${kind}`)) return kind;
  return 'arrow';
}