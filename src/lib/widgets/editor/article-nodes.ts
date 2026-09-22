// El sanitizador (sanitize.ts) es la autoridad final sobre qué HTML se
// guarda, pero el editor VISUAL tiene su propio esquema (ProseMirror) que
// no sabe nada de nuestras clases: por defecto, Blockquote/BulletList/
// OrderedList/Heading de Tiptap no declaran ningún atributo "class", así que
// en cuanto el autor toca el editor visual (aunque sea para editar otra
// parte del artículo), lo vuelve a serializar SIN la clase que escribió a
// mano en modo HTML. Estas extensiones agregan justo ese atributo,
// restringido a la misma lista blanca que ya usa el sanitizador, para que
// sobreviva.
//
// <img>, <mark>, <hr> y el <div> de los recuadros no tienen nodo propio en
// este editor (no hay extensión Image/Highlight, y horizontalRule está
// apagado en StarterKit), así que esas clases solo persisten mientras el
// autor no toque el editor visual — es una limitación del editor, no del
// sanitizador, que sí las acepta siempre. Si hace falta que sobrevivan
// también ahí, la solución es agregar esas extensiones con el mismo patrón.

import { Blockquote } from '@tiptap/extension-blockquote';
import { Heading } from '@tiptap/extension-heading';
import { BulletList, OrderedList } from '@tiptap/extension-list';
import { HEADING_CLASSES, LIST_CLASSES, QUOTE_CLASSES } from '../article-classes';

/** Atributo "class" que solo acepta valores de `allowed`; cualquier otro se descarta al leer el HTML. */
function classAttribute(allowed: Set<string>) {
  return {
    class: {
      default: null as string | null,
      parseHTML: (el: HTMLElement) => {
        const kept = (el.getAttribute('class') ?? '').split(/\s+/).filter((token) => allowed.has(token));
        return kept.length ? kept.join(' ') : null;
      },
      renderHTML: (attrs: { class?: string | null }) => (attrs.class ? { class: attrs.class } : {}),
    },
  };
}

export const ArticleBlockquote = Blockquote.extend({
  addAttributes() {
    return { ...this.parent?.(), ...classAttribute(QUOTE_CLASSES) };
  },
});

export const ArticleBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...classAttribute(LIST_CLASSES) };
  },
});

export const ArticleOrderedList = OrderedList.extend({
  addAttributes() {
    // OrderedList ya define su propio atributo "start" (para reiniciar la
    // numeración): hay que conservarlo, no solo agregar "class".
    return { ...this.parent?.(), ...classAttribute(LIST_CLASSES) };
  },
});

export const ArticleHeading = Heading.extend({
  addAttributes() {
    // Heading ya define su propio atributo "level" (h2 vs h3): igual que
    // arriba, hay que conservarlo.
    return { ...this.parent?.(), ...classAttribute(HEADING_CLASSES) };
  },
});
