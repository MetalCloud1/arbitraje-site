// Nodos de Tiptap para los bloques de diseño: columnas y conector.
//
// Sin estos nodos, el editor visual descartaba los <div> de columnas en
// cuanto el autor tocaba cualquier cosa (igual que pasaba con los widgets
// antes de existir widget-node.ts). El sanitizador (sanitize.ts) sigue
// siendo la autoridad final; esto solo hace que el diseño sobreviva al
// editor visual y se pueda armar con botones.
//
// El HTML que produce es EXACTAMENTE el canónico del sanitizador:
//   <div class="art-layout"><div class="art-cols art-cols-2 art-cols-conn">
//     <div class="art-col">…</div><div class="art-conn art-conn-arrow"></div><div class="art-col">…</div>
//   </div></div>

import { Node, mergeAttributes } from '@tiptap/core';
import { COL_CLASS, CONN_CLASS, CONN_KINDS, LAYOUT_WRAP_CLASS, colsClass, connKindOf, type ConnKind } from '../article-classes';

/**
 * Lo que cabe dentro de una columna. Lista explícita (y no "block+") a
 * propósito: así el editor tampoco permite columnas dentro de columnas, que
 * el sanitizador de todos modos rechaza.
 */
const COLUMN_CONTENT = '(paragraph | heading | blockquote | bulletList | orderedList | table | widget)+';

export const Column = Node.create({
  name: 'column',
  content: COLUMN_CONTENT,
  isolating: true,
  defining: true,
  parseHTML: () => [{ tag: `div.${COL_CLASS}` }],
  renderHTML: () => ['div', { class: COL_CLASS }, 0],
});

export const Connector = Node.create({
  name: 'connector',
  // Sin "group": solo puede aparecer donde `columns` lo declara.
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      kind: {
        default: 'arrow' as ConnKind,
        parseHTML: (el) => connKindOf(el.getAttribute('class')),
        renderHTML: () => ({}), // la clase se arma en renderHTML del nodo
      },
    };
  },

  parseHTML: () => [{ tag: `div.${CONN_CLASS}` }],

  renderHTML({ node }) {
    return ['div', { class: `${CONN_CLASS} ${CONN_CLASS}-${node.attrs.kind as ConnKind}` }];
  },

  // Un clic cambia el símbolo (flecha → VS → + → =).
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.contentEditable = 'false';
      dom.title = 'Clic para cambiar el símbolo';
      const paint = (kind: ConnKind) => (dom.className = `${CONN_CLASS} ${CONN_CLASS}-${kind}`);
      paint(node.attrs.kind as ConnKind);
      dom.addEventListener('click', () => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        const current = editor.state.doc.nodeAt(pos)?.attrs.kind as ConnKind | undefined;
        const next = CONN_KINDS[(CONN_KINDS.indexOf(current ?? 'arrow') + 1) % CONN_KINDS.length];
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { kind: next }));
      });
      return {
        dom,
        update(updated) {
          if (updated.type !== node.type) return false;
          paint(updated.attrs.kind as ConnKind);
          return true;
        },
        stopEvent: () => false,
        ignoreMutation: () => true,
      };
    };
  },
});

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  // 2 columnas (con conector opcional en medio) o 3 columnas. El conector
  // solo tiene sentido entre exactamente 2.
  content: '(column connector? column) | (column column column)',
  isolating: true,
  defining: true,

  // Acepta el bloque completo (con el contenedor art-layout) o el <div class="art-cols">
  // suelto, escrito a mano en modo HTML.
  parseHTML() {
    return [
      { tag: `div.${LAYOUT_WRAP_CLASS}`, contentElement: `.art-cols`, priority: 60 },
      { tag: `div.art-cols`, priority: 50 },
    ];
  },

  renderHTML({ node }) {
    let columns = 0;
    let connector = false;
    node.forEach((child) => {
      if (child.type.name === 'column') columns++;
      else if (child.type.name === 'connector') connector = true;
    });
    return ['div', { class: LAYOUT_WRAP_CLASS }, ['div', mergeAttributes({ class: colsClass(columns, connector) }), 0]];
  },

  addCommands() {
    const emptyColumn = () => ({ type: 'column', content: [{ type: 'paragraph' }] });
    return {
      /** Inserta un bloque nuevo de 2 o 3 columnas vacías (con flecha opcional entre 2). */
      insertColumns:
        (columns: 2 | 3, withConnector = false) =>
        ({ commands }) => {
          const content: object[] = [emptyColumn()];
          if (columns === 2 && withConnector) content.push({ type: 'connector', attrs: { kind: 'arrow' } });
          for (let i = 1; i < columns; i++) content.push(emptyColumn());
          return commands.insertContent({ type: 'columns', content });
        },

      /** Quita el bloque de columnas que contiene el cursor, conservando todo su contenido en orden. */
      unwrapColumns:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== 'columns') continue;
            if (dispatch) {
              const flat: ReturnType<typeof node.child>[] = [];
              node.forEach((child) => {
                if (child.type.name === 'column') child.forEach((inner) => flat.push(inner));
              });
              const from = $from.before(depth);
              dispatch(state.tr.replaceWith(from, from + node.nodeSize, flat));
            }
            return true;
          }
          return false;
        },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      insertColumns: (columns: 2 | 3, withConnector?: boolean) => ReturnType;
      unwrapColumns: () => ReturnType;
    };
  }
}
