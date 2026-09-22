// Widget "Imagen / Galería": una foto sola se ve como cualquier imagen de
// artículo (a todo ancho, con su pie debajo) y varias arman una cuadrícula en
// mosaico. En ambos casos, tocar la imagen abre un visor a pantalla completa
// (con las flechas, teclado o deslizando) -- así se cubren los dos usos que
// pedían: hojear varias fotos en cuadrícula Y verlas grandes una por una.
//
// El visor es un <dialog> (mismo truco que el menú lateral del header: entra
// a la "top layer" del navegador, sin pelear con z-index de nada del artículo).

import type { WidgetProps } from '../schema';
import { add, button, h } from './dom';

type Props = Extract<WidgetProps, { type: 'gallery' }>;

export function mount(el: HTMLElement, props: Props): () => void {
  const images = props.images;
  let index = 0;

  const thumbs = images.map((img, i) =>
    h(
      'button',
      { type: 'button', class: 'wg-gallery-thumb', 'aria-label': `Ver imagen ${i + 1} de ${images.length} en grande` },
      h('img', { src: `/api/img/${img.key}`, alt: img.alt, loading: i === 0 ? 'eager' : 'lazy' })
    )
  );
  const grid = h('div', { class: 'wg-gallery-grid', 'data-count': String(Math.min(images.length, 6)) }, ...thumbs);
  const wrap = h('div', { class: 'wg-gallery' }, grid);

  // Una sola imagen: el pie queda visible debajo, como una foto normal de
  // artículo. Con varias, el pie de cada una solo aparece dentro del visor
  // (si se mostraran todos bajo la cuadrícula sería mucho ruido visual).
  if (images.length === 1 && images[0].caption) {
    add(wrap, h('p', { class: 'wg-caption' }, images[0].caption));
  }

  // ---------- Visor ----------
  const stageImg = h('img', { alt: '' });
  const caption = h('p', { class: 'wg-lightbox-caption' });
  const counter = h('p', { class: 'wg-lightbox-counter' });
  const prevBtn = button('Imagen anterior', { icon: 'prev', class: 'wg-lightbox-nav wg-lightbox-prev' });
  const nextBtn = button('Imagen siguiente', { icon: 'next', class: 'wg-lightbox-nav wg-lightbox-next' });
  // Sin icono propio: la cruz se dibuja con CSS (dos líneas cruzadas).
  const closeBtn = button('Cerrar', { class: 'wg-lightbox-close' });
  const dialog = h(
    'dialog',
    { class: 'wg-lightbox', 'aria-label': 'Imagen ampliada' },
    closeBtn,
    h('div', { class: 'wg-lightbox-stage' }, stageImg, images.length > 1 ? prevBtn : null, images.length > 1 ? nextBtn : null),
    h('div', { class: 'wg-lightbox-foot' }, caption, images.length > 1 ? counter : null)
  );
  add(wrap, dialog);
  el.replaceChildren(wrap);

  function show(i: number) {
    index = (i + images.length) % images.length;
    const img = images[index];
    stageImg.src = `/api/img/${img.key}`;
    stageImg.alt = img.alt;
    caption.textContent = img.caption ?? '';
    caption.hidden = !img.caption;
    counter.textContent = `${index + 1} / ${images.length}`;
  }

  function open(i: number) {
    show(i);
    if (!dialog.open) dialog.showModal();
  }

  thumbs.forEach((thumb, i) => thumb.addEventListener('click', () => open(i)));
  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));

  // Clic en el fondo (fuera de la imagen y los controles) cierra, igual que
  // tocar el ::backdrop de un <dialog> normal.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  const onKeydown = (e: KeyboardEvent) => {
    if (!dialog.open) return;
    if (e.key === 'ArrowRight') show(index + 1);
    else if (e.key === 'ArrowLeft') show(index - 1);
  };
  document.addEventListener('keydown', onKeydown);

  // ---- Deslizar para cambiar de imagen (táctil) ----
  let startX = 0;
  let startY = 0;
  let swiping = false;
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || images.length < 2) return;
    startX = e.clientX;
    startY = e.clientY;
    swiping = true;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!swiping) return;
    swiping = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
  };
  dialog.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('pointerup', onPointerUp);

  closeBtn.addEventListener('click', () => dialog.close());

  return () => {
    document.removeEventListener('keydown', onKeydown);
    if (dialog.open) dialog.close();
    dialog.remove();
  };
}
