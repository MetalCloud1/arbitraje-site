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
