// Punto de entrada de los widgets en el navegador.
//
// - Solo se carga (import dinámico) en artículos que tienen algún widget.
// - Cada widget carga su propio módulo cuando se acerca a la pantalla, así
//   chess.js y el tablero no pesan en artículos sin ajedrez.
// - Es idempotente: se puede llamar en cada navegación (ClientRouter).
// - Si algo falla, el contenido alternativo del servidor se queda visible.

import { normalizeWidget, type WidgetProps } from '../schema';

type Disposer = () => void;
type Loader = (el: HTMLElement, props: never) => Disposer | void;

const modules: Record<string, () => Promise<{ mount: Loader }>> = {
  'chess-board': () => import('./chess-board'),
  'chess-puzzle': () => import('./chess-puzzle'),
  quiz: () => import('./quiz'),
  embed: () => import('./embed'),
  gallery: () => import('./gallery'),
};

const disposers = new Set<Disposer>();
let cleanupRegistered = false;

/** Lee los data-* del elemento y los valida con el mismo esquema que el servidor. */
function readProps(el: HTMLElement): WidgetProps | null {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(el.dataset)) {
    if (key !== 'widget' && key !== 'ready' && typeof value === 'string') raw[key] = value;
  }
  const result = normalizeWidget(el.dataset.widget ?? '', raw);
  return result.ok ? result.props : null;
}

/**
 * Monta un widget ahora mismo (lo usa el editor para su vista previa).
 * Devuelve la función que lo destruye (tableros, temporizadores).
 */
export async function mountWidget(el: HTMLElement): Promise<Disposer | undefined> {
  if (el.dataset.ready) return;
  const type = el.dataset.widget ?? '';
  const load = modules[type];
  const props = readProps(el);
  if (!load || !props) {
    el.dataset.ready = 'error';
    return;
  }
  el.dataset.ready = 'loading';
  try {
    const mod = await load();
    const dispose = (mod.mount as (el: HTMLElement, props: WidgetProps) => Disposer | void)(el, props);
    el.dataset.ready = 'true';
    if (!dispose) return;
    disposers.add(dispose);
    return () => {
      disposers.delete(dispose);
      dispose();
    };
  } catch (error) {
    // Queda el contenido alternativo; no se rompe el resto del artículo.
    console.error(`[widgets] no se pudo iniciar "${type}"`, error);
    el.dataset.ready = 'error';
  }
}

export function hydrateWidgets(root: ParentNode = document): void {
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    // Al navegar a otra página se detienen temporizadores y se destruyen los tableros.
    document.addEventListener('astro:before-swap', () => {
      disposers.forEach((dispose) => dispose());
      disposers.clear();
    });
  }

  const pending = Array.from(root.querySelectorAll<HTMLElement>('[data-widget]:not([data-ready])'));
  if (pending.length === 0) return;

  if (typeof IntersectionObserver === 'undefined') {
    pending.forEach((el) => void mountWidget(el));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        void mountWidget(entry.target as HTMLElement);
      }
    },
    { rootMargin: '300px 0px' }
  );
  pending.forEach((el) => observer.observe(el));
}