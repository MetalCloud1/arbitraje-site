// Único punto donde se toca cm-chessboard (MIT). Si algún día se cambia de
// librería de tablero, solo se reescribe este archivo.
//
// Las piezas y los marcadores se sirven desde /widgets/ (public/widgets),
// o sea, desde nuestro propio dominio: cero solicitudes externas.

import { Chessboard, COLOR, INPUT_EVENT_TYPE } from 'cm-chessboard/src/Chessboard.js';
import { Markers, MARKER_TYPE } from 'cm-chessboard/src/extensions/markers/Markers.js';
import { PromotionDialog } from 'cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js';
import 'cm-chessboard/assets/chessboard.css';
import 'cm-chessboard/assets/extensions/markers/markers.css';
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
