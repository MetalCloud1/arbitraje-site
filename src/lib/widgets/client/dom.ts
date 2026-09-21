// Utilidades mínimas para construir el DOM de los widgets.
// Regla de oro: todo texto que venga del artículo entra por `textContent`
// (o como hijo string de h()), NUNCA por innerHTML. Así el contenido del
// autor no puede convertirse en HTML aunque contenga "<" o comillas.

type Child = Node | string | null | undefined | false;

/**
 * Agrega hijos con appendChild. Se evita Element.append() a propósito: el
 * tsconfig del proyecto carga @cloudflare/workers-types, que le añade a Element
 * un append() de HTMLRewriter que choca con el del DOM y rompe los tipos.
 */
export function add<T extends Node>(parent: T, ...children: Child[]): T {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return parent;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return add(el, ...children);
}

// Iconos fijos y de confianza (no dependen de datos del artículo).
const ICONS = {
  first: '<path d="M6 5v14M19 5l-9 7 9 7z"/>',
  prev: '<path d="M17 5l-9 7 9 7z"/>',
  next: '<path d="M7 5l9 7-9 7z"/>',
  last: '<path d="M18 5v14M5 5l9 7-9 7z"/>',
  flip: '<path d="M7 4 3 8l4 4M3 8h14a4 4 0 0 1 4 4M17 20l4-4-4-4M21 16H7a4 4 0 0 1-4-4"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  hint: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): HTMLSpanElement {
  const span = h('span', { class: 'wg-ico', 'aria-hidden': 'true' });
  span.innerHTML =
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" ` +
    `stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${ICONS[name]}</svg>`;
  return span;
}

/** Botón con icono y/o texto. `label` es el nombre accesible. */
export function button(label: string, opts: { icon?: IconName; text?: string; class?: string } = {}): HTMLButtonElement {
  const btn = h('button', { type: 'button', class: `wg-btn ${opts.class ?? ''}`.trim(), 'aria-label': label, title: label });
  if (opts.icon) add(btn, icon(opts.icon));
  if (opts.text) add(btn, h('span', {}, opts.text));
  return btn;
}
