// Widget "Incrustar": un <iframe> de un sitio de la lista blanca (schema.ts).
// El iframe se construye ACÁ con atributos fijos; el artículo solo aporta una
// URL ya validada, nunca HTML de iframe.

import { checkEmbedUrl, type WidgetProps } from '../schema';
import { h } from './dom';

type Props = Extract<WidgetProps, { type: 'embed' }>;

const RATIO: Record<string, string> = { '16:9': '16 / 9', '3:2': '3 / 2', '4:3': '4 / 3', '1:1': '1 / 1' };

export function mount(el: HTMLElement, props: Props): () => void {
  // Defensa en profundidad: se vuelve a validar antes de crear el iframe.
  const url = checkEmbedUrl(props.src);
  const isChessCom = url.hostname === 'www.chess.com';

  const frame = h('iframe', {
    src: url.toString(),
    title: props.title,
    loading: 'lazy',
    referrerpolicy: 'strict-origin-when-cross-origin',
    // Sin allow-top-navigation ni allow-forms: el contenido externo no puede redirigir la página.
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation',
    allow: 'fullscreen; picture-in-picture; encrypted-media',
    allowfullscreen: '',
  });

  const box = h('div', { class: 'wg-embed', style: `--wg-ratio:${RATIO[props.ratio] ?? RATIO['16:9']}` }, frame);
  const source = h('a', { class: 'wg-source', href: url.toString(), target: '_blank', rel: 'noopener noreferrer' }, `Abrir en ${url.hostname.replace(/^www\./, '')}`);
  el.replaceChildren(box, source);

  // Chess.com avisa la altura real de su tablero por postMessage.
  const onMessage = (e: MessageEvent) => {
    if (!isChessCom || e.origin !== 'https://www.chess.com' || e.source !== frame.contentWindow) return;
    const height = Number((e.data as { frameHeight?: unknown } | null)?.frameHeight);
    if (Number.isFinite(height) && height > 100 && height < 2000) {
      box.style.aspectRatio = 'auto';
      box.style.height = `${height + 37}px`;
    }
  };
  window.addEventListener('message', onMessage);

  return () => window.removeEventListener('message', onMessage);
}
