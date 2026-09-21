// Widget "Problema": el lector mueve las piezas y se valida contra la solución.
// Todo ocurre en el navegador; no se guarda nada.

import type { WidgetProps } from '../schema';
import { formatMovetext } from '../schema';
import { COLOR, INPUT_EVENT_TYPE, MARKER_TYPE, createBoard, markLastMove, type Chessboard } from './board';
import { PuzzleSession } from './game';
import { add, button, h } from './dom';

type Props = Extract<WidgetProps, { type: 'chess-puzzle' }>;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function mount(el: HTMLElement, props: Props): () => void {
  const session = new PuzzleSession(props.fen, props.solution);
  const white = session.playerColor === 'w';
  let mistakes = 0;
  let busy = false;
  let disposed = false;

  const host = h('div', { class: 'wg-board-host' });
  const turn = h('p', { class: 'wg-turn' }, h('span', { class: `wg-dot ${white ? 'wg-dot-w' : 'wg-dot-b'}`, 'aria-hidden': 'true' }), white ? 'Juegan blancas' : 'Juegan negras');
  const status = h('p', { class: 'wg-status', 'aria-live': 'polite' });
  const hintBtn = button('Ver una pista', { icon: 'hint', text: 'Pista' });
  const solutionBtn = button('Mostrar la solución', { icon: 'eye', text: 'Solución' });
  const resetBtn = button('Reiniciar el problema', { icon: 'reset', text: 'Reiniciar' });
  const actions = h('div', { class: 'wg-actions' }, hintBtn, solutionBtn, resetBtn);

  // Alternativa accesible (teclado / lector de pantalla / móvil): escribir la jugada.
  const input = h('input', { type: 'text', class: 'wg-input', placeholder: 'Ej.: Qh7+', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Jugada en notación algebraica' });
  const tryBtn = h('button', { type: 'submit', class: 'wg-btn wg-btn-primary' }, 'Probar');
  const form = h('form', { class: 'wg-typed' }, input, tryBtn);
  const typed = h('details', { class: 'wg-details' }, h('summary', {}, 'Escribir la jugada'), form);

  const side = h('div', { class: 'wg-side' }, turn, status, actions, typed);
  const root = h('div', { class: 'wg wg-game wg-puzzle' }, h('div', { class: 'wg-stage' }, host), side);
  el.replaceChildren(root);
  if (props.caption) add(el, h('figcaption', { class: 'wg-caption' }, props.caption));

  const board: Chessboard = createBoard(host, props.fen, white ? 'white' : 'black');

  function say(text: string, tone: 'info' | 'ok' | 'bad' = 'info') {
    status.textContent = text;
    status.dataset.tone = tone;
  }

  function enableInput() {
    board.enableMoveInput(onInput, white ? COLOR.white : COLOR.black);
  }

  function finish() {
    board.disableMoveInput();
    board.removeMarkers(MARKER_TYPE.circlePrimary);
    say(mistakes === 0 ? '¡Correcto! Lo resolviste a la primera.' : `¡Correcto! Resuelto tras ${mistakes} ${mistakes === 1 ? 'intento fallido' : 'intentos fallidos'}.`, 'ok');
    root.classList.add('is-solved');
  }

  /** Aplica una jugada del jugador. Devuelve true si es correcta. */
  function play(from: string, to: string, promotion?: string, typedSan?: string): boolean {
    const result = typedSan ? session.attemptSan(typedSan) : session.attempt(from, to, promotion);
    if (result.kind === 'illegal') {
      say('Esa jugada no es legal en esta posición.', 'bad');
      return false;
    }
    if (result.kind === 'wrong') {
      mistakes++;
      say('Buena idea, pero no es la jugada. Prueba otra.', 'bad');
      return false;
    }
    board.removeMarkers(MARKER_TYPE.circlePrimary);
    // La librería mueve la pieza arrastrada por su cuenta; se re-sincroniza la
    // posición real (enroques, captura al paso, coronación) tras el evento.
    setTimeout(async () => {
      if (disposed) return;
      busy = true;
      await board.setPosition(result.afterPlayer, true);
      markLastMove(board, result.played.from, result.played.to);
      if (result.reply) {
        say('Bien. El rival responde…', 'info');
        await wait(550);
        if (disposed) return;
        await board.setPosition(session.fen, true);
        markLastMove(board, result.reply.from, result.reply.to);
        if (!result.solved) say('Sigue así. ¿Cuál es la siguiente jugada?', 'ok');
      }
      busy = false;
      if (result.solved) finish();
    }, 0);
    return true;
  }

  function onInput(event: { type: string; squareFrom: string; squareTo?: string }): boolean | void {
    if (event.type === INPUT_EVENT_TYPE.moveInputStarted) {
      if (busy || session.solved) return false;
      board.removeLegalMovesMarkers();
      const moves = session.legalMoves(event.squareFrom);
      if (moves.length === 0) return false;
      board.addLegalMovesMarkers(moves);
      return true;
    }
    if (event.type === INPUT_EVENT_TYPE.validateMoveInput) {
      board.removeLegalMovesMarkers();
      const to = event.squareTo as string;
      if (session.isPromotion(event.squareFrom, to)) {
        board.showPromotionDialog(to, session.playerColor, (choice) => {
          const piece = choice.piece?.charAt(1);
          if (!piece || !play(event.squareFrom, to, piece)) void board.setPosition(session.fen, true);
        });
        return true;
      }
      return play(event.squareFrom, to);
    }
    if (event.type === INPUT_EVENT_TYPE.moveInputCanceled) board.removeLegalMovesMarkers();
  }

  hintBtn.addEventListener('click', () => {
    const square = session.hintSquare();
    if (!square || busy) return;
    board.removeMarkers(MARKER_TYPE.circlePrimary);
    board.addMarker(MARKER_TYPE.circlePrimary, square);
    say(props.hint ?? 'Fíjate en la pieza marcada.', 'info');
  });

  solutionBtn.addEventListener('click', async () => {
    if (busy || session.solved) return;
    busy = true;
    board.disableMoveInput();
    board.removeMarkers(MARKER_TYPE.circlePrimary);
    const steps = session.reveal();
    say(`Solución: ${formatMovetext(props.fen, props.solution)}`, 'info');
    for (const step of steps) {
      await wait(650);
      if (disposed) return;
      await board.setPosition(step.fen, true);
      markLastMove(board, step.move.from, step.move.to);
    }
    busy = false;
    root.classList.add('is-solved');
  });

  resetBtn.addEventListener('click', async () => {
    session.reset();
    mistakes = 0;
    busy = false;
    root.classList.remove('is-solved');
    board.removeMarkers(MARKER_TYPE.circlePrimary);
    board.removeMarkers(MARKER_TYPE.square);
    await board.setPosition(props.fen, true);
    say('Encuentra la mejor jugada.', 'info');
    enableInput();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy || session.solved) return;
    if (play('', '', undefined, text)) input.value = '';
  });

  say('Encuentra la mejor jugada.', 'info');
  enableInput();

  return () => {
    disposed = true;
    board.destroy();
  };
}
