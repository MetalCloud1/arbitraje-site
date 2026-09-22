// Único punto donde se toca cm-chessboard (MIT). Si algún día se cambia de
// librería de tablero, solo se reescribe este archivo.
//
// Las piezas y los marcadores se sirven desde /widgets/ (public/widgets),
// o sea, desde nuestro propio dominio: cero solicitudes externas.

import { Chessboard, COLOR, INPUT_EVENT_TYPE } from 'cm-chessboard/src/Chessboard.js';
import { Markers, MARKER_TYPE } from 'cm-chessboard/src/extensions/markers/Markers.js';
import { Arrows, ARROW_TYPE } from 'cm-chessboard/src/extensions/arrows/Arrows.js';
import { PromotionDialog } from 'cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js';
import type { MoveMark } from '../schema';
import 'cm-chessboard/assets/chessboard.css';
import 'cm-chessboard/assets/extensions/markers/markers.css';
import 'cm-chessboard/assets/extensions/arrows/arrows.css';
import 'cm-chessboard/assets/extensions/promotion-dialog/promotion-dialog.css';

export { COLOR, INPUT_EVENT_TYPE, MARKER_TYPE };
export type { Chessboard };

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createBoard(host: HTMLElement, fen: string, orientation: 'white' | 'black'): Chessboard {
  return new Chessboard(host, {
    position: fen,
    orientation: orientation === 'black' ? COLOR.black : COLOR.white,
    assetsUrl: '/widgets/',
    style: {
      // Tema propio "lha": los colores se definen en src/styles/widgets.css.
      cssClass: 'lha',
      showCoordinates: true,
      borderType: 'none',
      animationDuration: prefersReducedMotion() ? 0 : 220,
    },
    extensions: [
      { class: Markers, props: { autoMarkers: null } },
      { class: Arrows, props: {} },
      { class: PromotionDialog, props: { language: 'en' } },
    ],
  });
}

/** Resalta las casillas de la última jugada. */
export function markLastMove(board: Chessboard, from?: string, to?: string): void {
  board.removeMarkers(MARKER_TYPE.square);
  if (from) board.addMarker(MARKER_TYPE.square, from);
  if (to) board.addMarker(MARKER_TYPE.square, to);
}

/**
 * Estilo de "marcado de jugadas" (análisis tipo Lichess/chess.com): un color
 * por casilla y, opcionalmente, una flecha sugiriendo la jugada alternativa.
 * Reutiliza clases CSS que YA trae el paquete (markers.css / arrows.css) pero
 * que el objeto MARKER_TYPE de la librería no expone; por eso se declaran acá
 * en vez de sumar una dependencia o assets nuevos.
 */
const MOVE_MARK_MARKER: Record<MoveMark, { class: string; slice: string }> = {
  buena: { class: 'marker-circle-success-filled', slice: 'markerCircleFilled' },
  imprecision: { class: 'marker-circle-warning', slice: 'markerCircle' },
  error: { class: 'marker-circle-warning-filled', slice: 'markerCircleFilled' },
  grave: { class: 'marker-circle-danger-filled', slice: 'markerCircleFilled' },
};

const MOVE_MARK_ARROW: Record<MoveMark, unknown> = {
  buena: ARROW_TYPE.success,
  imprecision: ARROW_TYPE.warning,
  error: ARROW_TYPE.warning,
  grave: ARROW_TYPE.danger,
};

/** Colorea la casilla de una jugada y, si hay flecha, dibuja la alternativa sugerida. */
export function markMoveAnnotation(
  board: Chessboard,
  square: string,
  mark: MoveMark,
  arrow?: { from: string; to: string }
): void {
  board.addMarker(MOVE_MARK_MARKER[mark], square);
  if (arrow) board.addArrow(MOVE_MARK_ARROW[mark], arrow.from, arrow.to);
}

/** Quita todo el marcado de jugadas (se llama antes de aplicar el de la posición actual). */
export function clearMoveAnnotation(board: Chessboard): void {
  for (const marker of Object.values(MOVE_MARK_MARKER)) board.removeMarkers(marker);
  board.removeArrows();
}