// Lógica de ajedrez de los widgets, SIN DOM: solo chess.js. Al estar separada
// del dibujo se puede probar en Node y reutilizar en cualquier widget nuevo.

import { Chess, type Move, type Square } from 'chess.js';

export interface Ply {
  san: string;
  from: string;
  to: string;
  color: 'w' | 'b';
  /** Número de jugada tal como se escribe en la notación (1., 2., …). */
  number: number;
}

export interface Timeline {
  /** fens[0] es la posición inicial; fens[n] la posición tras la jugada n. */
  fens: string[];
  plies: Ply[];
}

/** Reproduce las jugadas y guarda cada posición para poder ir y venir sin recalcular. */
export function buildTimeline(fen: string, moves: string[]): Timeline {
  const game = new Chess(fen);
  const fens = [game.fen()];
  const plies: Ply[] = [];
  let number = parseInt(fen.split(' ')[5] ?? '1', 10) || 1;
  for (const san of moves) {
    const m = game.move(san);
    plies.push({ san: m.san, from: m.from, to: m.to, color: m.color, number });
    if (m.color === 'b') number++;
    fens.push(game.fen());
  }
  return { fens, plies };
}

export type Attempt =
  | { kind: 'illegal' }
  | { kind: 'wrong'; san: string }
  | {
      kind: 'correct';
      /** Posición tras la jugada del jugador, antes de la respuesta del rival. */
      afterPlayer: string;
      played: Move;
      /** Respuesta automática del rival (si la solución continúa). */
      reply?: Move;
      solved: boolean;
    };

/**
 * Estado de un problema. El jugador mueve primero (el bando al que le toca en
 * el FEN); la solución alterna jugada del jugador / respuesta del rival.
 * Regla extra, igual que Lichess: si la jugada da jaque mate se acepta aunque
 * no sea la de la solución (hay problemas con varios mates).
 */
export class PuzzleSession {
  private chess: Chess;
  private index = 0;
  readonly playerColor: 'w' | 'b';

  constructor(
    private readonly startFen: string,
    private readonly solution: string[]
  ) {
    this.chess = new Chess(startFen);
    this.playerColor = this.chess.turn();
  }

  get fen(): string {
    return this.chess.fen();
  }

  get solved(): boolean {
    return this.index >= this.solution.length;
  }

  legalMoves(from: string): Move[] {
    return this.chess.moves({ square: from as Square, verbose: true });
  }

  isPromotion(from: string, to: string): boolean {
    return this.legalMoves(from).some((m) => m.to === to && !!m.promotion);
  }

  attempt(from: string, to: string, promotion?: string): Attempt {
    if (this.solved) return { kind: 'illegal' };
    const trial = new Chess(this.chess.fen());
    let played: Move;
    try {
      played = trial.move({ from, to, promotion });
    } catch {
      return { kind: 'illegal' };
    }
    if (played.san !== this.solution[this.index] && !trial.isCheckmate()) {
      return { kind: 'wrong', san: played.san };
    }
    this.chess = trial;
    this.index++;
    if (trial.isCheckmate()) this.index = this.solution.length;
    const afterPlayer = trial.fen();
    let reply: Move | undefined;
    if (!this.solved) {
      reply = this.chess.move(this.solution[this.index]);
      this.index++;
    }
    return { kind: 'correct', afterPlayer, played, reply, solved: this.solved };
  }

  /** Igual que attempt(), pero a partir de una jugada escrita en SAN ("Qh7+"). */
  attemptSan(san: string): Attempt {
    try {
      const m = new Chess(this.chess.fen()).move(san.trim());
      return this.attempt(m.from, m.to, m.promotion);
    } catch {
      return { kind: 'illegal' };
    }
  }

  /** Casilla de origen de la próxima jugada correcta (para la pista). */
  hintSquare(): string | null {
    if (this.solved) return null;
    try {
      return new Chess(this.chess.fen()).move(this.solution[this.index]).from;
    } catch {
      return null;
    }
  }

  /** Juega lo que falta de la solución; devuelve cada jugada con su posición resultante. */
  reveal(): { move: Move; fen: string }[] {
    const steps: { move: Move; fen: string }[] = [];
    while (!this.solved) {
      const move = this.chess.move(this.solution[this.index]);
      this.index++;
      steps.push({ move, fen: this.chess.fen() });
    }
    return steps;
  }

  reset(): void {
    this.chess = new Chess(this.startFen);
    this.index = 0;
  }
}
