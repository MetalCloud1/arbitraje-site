// Widget "Tablero": una posición fija o una partida que se reproduce jugada a jugada.

import type { WidgetProps } from '../schema';
import { createBoard, markLastMove } from './board';
import { buildTimeline } from './game';
import { add, button, h } from './dom';

type Props = Extract<WidgetProps, { type: 'chess-board' }>;

export function mount(el: HTMLElement, props: Props): () => void {
  const timeline = buildTimeline(props.fen, props.moves);
  const total = timeline.plies.length;
  let ply = 0;
  let timer: number | undefined;

  const host = h('div', { class: 'wg-board-host' });
  const status = h('p', { class: 'wg-sr', 'aria-live': 'polite' });
  const root = h('div', { class: 'wg wg-game' }, h('div', { class: 'wg-stage' }, host));

  const first = button('Ir al inicio', { icon: 'first' });
  const prev = button('Jugada anterior', { icon: 'prev' });
  const play = button('Reproducir partida', { icon: 'play', class: 'wg-btn-primary' });
  const next = button('Jugada siguiente', { icon: 'next' });
  const last = button('Ir al final', { icon: 'last' });
  const flip = button('Voltear el tablero', { icon: 'flip' });

  const controls = h('div', { class: 'wg-controls', role: 'group', 'aria-label': 'Controles del tablero' });
  if (total > 0) add(controls, first, prev, play, next, last);
  add(controls, flip);

  const side = h('div', { class: 'wg-side' });
  const moveButtons: HTMLButtonElement[] = [];
  const list = h('div', { class: 'wg-moves', role: 'group', 'aria-label': 'Jugadas' });
  timeline.plies.forEach((p, i) => {
    if (p.color === 'w' || i === 0) add(list, h('span', { class: 'wg-num' }, `${p.number}${p.color === 'w' ? '.' : '…'}`));
    const b = h('button', { type: 'button', class: 'wg-move' }, p.san);
    b.addEventListener('click', () => {
      stop();
      goTo(i + 1);
    });
    moveButtons.push(b);
    add(list, b);
  });
  if (total > 0) add(side, list);
  add(side, controls);

  if (total === 0) root.classList.add('wg-static');
  add(root, side);

  el.replaceChildren(root, status);
  if (props.caption) add(el, h('figcaption', { class: 'wg-caption' }, props.caption));

  // El tablero se crea con el contenedor ya en el DOM (mide su ancho al nacer).
  const board = createBoard(host, props.fen, props.orientation);

  function stop() {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    play.setAttribute('aria-label', 'Reproducir partida');
    play.title = 'Reproducir partida';
    play.classList.remove('is-playing');
  }

  function goTo(n: number, animate = false) {
    const target = Math.max(0, Math.min(total, n));
    const animated = animate && Math.abs(target - ply) === 1;
    ply = target;
    void board.setPosition(timeline.fens[ply], animated);
    const p = timeline.plies[ply - 1];
    markLastMove(board, p?.from, p?.to);

    first.disabled = prev.disabled = ply === 0;
    next.disabled = last.disabled = ply === total;
    moveButtons.forEach((b, i) => {
      if (i === ply - 1) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    const active = moveButtons[ply - 1];
    if (active) list.scrollTop = active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2;
    status.textContent = p ? `${p.number}${p.color === 'w' ? '.' : '…'} ${p.san}` : 'Posición inicial';
  }

  first.addEventListener('click', () => { stop(); goTo(0); });
  prev.addEventListener('click', () => { stop(); goTo(ply - 1, true); });
  next.addEventListener('click', () => { stop(); goTo(ply + 1, true); });
  last.addEventListener('click', () => { stop(); goTo(total); });
  flip.addEventListener('click', () => void board.setOrientation(board.getOrientation() === 'w' ? 'b' : 'w', true));
  play.addEventListener('click', () => {
    if (timer !== undefined) return stop();
    if (ply >= total) goTo(0);
    play.setAttribute('aria-label', 'Pausar');
    play.title = 'Pausar';
    play.classList.add('is-playing');
    timer = window.setInterval(() => {
      if (ply >= total) return stop();
      goTo(ply + 1, true);
    }, 1100);
  });

  const onKey = (e: KeyboardEvent) => {
    if (total === 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => goTo(ply - 1, true),
      ArrowRight: () => goTo(ply + 1, true),
      Home: () => goTo(0),
      End: () => goTo(total),
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    stop();
    action();
  };
  el.addEventListener('keydown', onKey);

  goTo(0);
  status.textContent = '';

  return () => {
    stop();
    el.removeEventListener('keydown', onKey);
    board.destroy();
  };
}
