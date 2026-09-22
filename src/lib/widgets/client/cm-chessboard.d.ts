// cm-chessboard está escrito en JS sin tipos. Declaramos solo la parte que usamos.
declare module 'cm-chessboard/src/Chessboard.js' {
  export const COLOR: { white: 'w'; black: 'b' };
  export const INPUT_EVENT_TYPE: {
    moveInputStarted: string;
    validateMoveInput: string;
    moveInputCanceled: string;
    moveInputFinished: string;
    movingOverSquare: string;
  };
  export interface MoveInputEvent {
    type: string;
    squareFrom: string;
    squareTo?: string;
    piece?: string;
  }
  export interface PromotionResult {
    type: string;
    piece?: string;
    square?: string;
  }
  export class Chessboard {
    constructor(context: HTMLElement, props?: Record<string, unknown>);
    setPosition(fen: string, animated?: boolean): Promise<void>;
    setOrientation(color: 'w' | 'b', animated?: boolean): Promise<void>;
    getOrientation(): 'w' | 'b';
    enableMoveInput(handler: (event: MoveInputEvent) => boolean | void, color?: 'w' | 'b'): void;
    disableMoveInput(): void;
    destroy(): void;
    // Añadidos por las extensiones Markers, Arrows y PromotionDialog:
    addMarker(type: unknown, square: string): void;
    removeMarkers(type?: unknown, square?: string): void;
    addLegalMovesMarkers(moves: unknown[]): void;
    removeLegalMovesMarkers(): void;
    addArrow(type: unknown, from: string, to: string): void;
    removeArrows(type?: unknown, from?: string, to?: string): void;
    showPromotionDialog(square: string, color: 'w' | 'b', callback: (result: PromotionResult) => void): void;
  }
}
declare module 'cm-chessboard/src/extensions/markers/Markers.js' {
  export const MARKER_TYPE: Record<'frame' | 'circlePrimary' | 'square' | 'dot' | 'bevel', unknown>;
  export class Markers {}
}
declare module 'cm-chessboard/src/extensions/arrows/Arrows.js' {
  export const ARROW_TYPE: Record<'default' | 'success' | 'secondary' | 'warning' | 'info' | 'danger', unknown>;
  export class Arrows {}
}
declare module 'cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js' {
  export class PromotionDialog {}
}