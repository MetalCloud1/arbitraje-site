// Nodo de Tiptap que representa un widget dentro del editor visual.
//
// Sin esto, el editor visual descartaba cualquier cosa que no conociera (y un
// simple retoque de tipografía borraba los widgets del artículo). Con este
// nodo los widgets sobreviven al ir y volver entre Visual y HTML, se ven en
// vivo mientras se escribe y se editan con un formulario.

import { Node } from '@tiptap/core';
import { WIDGET_LABELS, isWidgetType, type WidgetType } from '../schema';
import { IMG_CLASSES } from '../article-classes';
import { mountWidget } from '../client/mount';
import { h } from '../client/dom';
import { openWidgetDialog } from './widget-dialog';

type Data = Record<string, string>;

/** Igual que la lista blanca de "class" del sanitizador (sanitize.ts) para el resto de las figuras. */
function cleanClass(value: string | null): string | null {
  if (!value) return null;
  const kept = value.split(/\s+/).filter((token) => IMG_CLASSES.has(token));
  return kept.length ? kept.join(' ') : null;
}

export const Widget = Node.create({
  name: 'widget',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      wtype: { default: 'chess-board', rendered: false },
      data: { default: {}, rendered: false },
      class: {
        default: null as string | null,
        parseHTML: (el) => cleanClass(el.getAttribute('class')),
        renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
      },
    };
  },

  // Acepta tanto el <figure> canónico como un <div data-widget> escrito a mano en modo HTML.
  parseHTML() {
    return [
      {
        tag: '[data-widget]',
        priority: 100,
        getAttrs: (el) => {
          const node = el as HTMLElement;
          const type = node.getAttribute('data-widget') ?? '';
          if (!isWidgetType(type)) return false;
          const data: Data = {};
          for (const attr of Array.from(node.attributes)) {
            if (attr.name.startsWith('data-') && attr.name !== 'data-widget') data[attr.name.slice(5)] = attr.value;
          }
          return { wtype: type, data };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = { 'data-widget': node.attrs.wtype };
    if (node.attrs.class) attrs.class = node.attrs.class;
    for (const [key, value] of Object.entries(node.attrs.data as Data)) attrs[`data-${key}`] = value;
    return ['figure', attrs];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node;
      let dispose: (() => void) | undefined;
      let renderId = 0;

      const label = h('span', { class: 'widget-block-label' }, '');
      const editBtn = h('button', { type: 'button', class: 'widget-block-btn' }, 'Editar');
      const removeBtn = h('button', { type: 'button', class: 'widget-block-btn is-danger' }, 'Quitar');
      const bar = h('div', { class: 'widget-block-bar' }, label, h('span', { class: 'widget-block-actions' }, editBtn, removeBtn));
      const preview = h('figure', { class: 'widget-block-preview' });
      const dom = h('div', { class: 'widget-block', contenteditable: 'false' }, bar, preview);

      async function render() {
        const id = ++renderId;
        dispose?.();
        dispose = undefined;
        const type = current.attrs.wtype as WidgetType;
        label.textContent = WIDGET_LABELS[type] ?? 'Widget';
        // Se recrea el <figure> de vista previa con los datos actuales.
        for (const name of preview.getAttributeNames()) if (name.startsWith('data-')) preview.removeAttribute(name);
        preview.replaceChildren();
        preview.setAttribute('data-widget', type);
        preview.className = 'widget-block-preview' + (current.attrs.class ? ` ${current.attrs.class}` : '');
        for (const [key, value] of Object.entries(current.attrs.data as Data)) preview.setAttribute(`data-${key}`, value);
        const d = await mountWidget(preview);
        if (id !== renderId) d?.(); // llegó tarde: ya hay un render más nuevo
        else dispose = d;
        if (preview.dataset.ready === 'error') {
          preview.replaceChildren(h('p', { class: 'widget-block-error' }, 'La vista previa no está disponible: revisa los datos del widget.'));
        }
      }

      editBtn.addEventListener('click', async () => {
        const type = current.attrs.wtype as WidgetType;
        const next = await openWidgetDialog(type, current.attrs.data as Data);
        if (!next) return;
        const pos = getPos();
        if (typeof pos !== 'number') return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { wtype: type, data: next }));
      });

      removeBtn.addEventListener('click', () => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
      });

      void render();

      return {
        dom,
        // Los eventos dentro del widget (arrastrar piezas, botones) no son del editor.
        stopEvent: () => true,
        ignoreMutation: () => true,
        update(updated) {
          if (updated.type !== current.type) return false;
          const changed = JSON.stringify(updated.attrs) !== JSON.stringify(current.attrs);
          current = updated;
          if (changed) void render();
          return true;
        },
        selectNode: () => dom.classList.add('is-selected'),
        deselectNode: () => dom.classList.remove('is-selected'),
        destroy: () => {
          renderId++;
          dispose?.();
        },
      };
    };
  },
});