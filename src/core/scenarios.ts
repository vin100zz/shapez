import type { ToolType } from './defs';
import type { Game } from './game';
import type { Dir } from './geometry';

/** Pose une ligne de convoyeurs passant par les cases données ; chaque convoyeur pointe vers le suivant. */
export function beltLine(game: Game, cells: readonly [number, number][], lastDir: Dir): void {
  for (let i = 0; i < cells.length; i++) {
    const [x, y] = cells[i];
    let dir = lastDir;
    if (i < cells.length - 1) {
      const [nx, ny] = cells[i + 1];
      dir = nx > x ? 1 : nx < x ? 3 : ny > y ? 2 : 0;
    }
    game.applySnap(x, y, { type: 'belt', rot: dir });
  }
}

/** Cases d'un segment horizontal ou vertical, bornes comprises. */
export function segment(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  for (let x = x0, y = y0; ; x += dx, y += dy) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
  }
  return out;
}

const put = (game: Game, type: ToolType, x: number, y: number, rot: Dir): void => game.applySnap(x, y, { type, rot });

/**
 * Usine de démonstration : une ligne « sertissage » (moitiés rubis + cobalt) et une ligne
 * « superposition » (vitres cobalt + rubis -> améthyste). Elle sertit seule les médaillons 3 et 4.
 */
export function buildDemo(game: Game): void {
  const p = game.progress;
  p.orderIndex = 2;
  p.orderCount = 0;
  for (const t of ['cutter', 'trash', 'assembler'] as const) p.unlocked.add(t);
  // Moitié rubis haut-droite
  put(game, 'extractor', -12, -5, 1);
  beltLine(game, [...segment(-11, -5, -8, -5)], 2);
  put(game, 'cutter', -8, -4, 2);
  put(game, 'trash', -9, -4, 0);
  beltLine(game, [...segment(-7, -4, -4, -4), ...segment(-4, -3, -4, -2)], 2);
  // Moitié cobalt bas-gauche
  put(game, 'extractor', -12, 5, 1);
  beltLine(game, [...segment(-11, 5, -8, 5)], 0);
  put(game, 'cutter', -8, 4, 0);
  put(game, 'trash', -7, 4, 0);
  beltLine(game, [[-9, 4], ...segment(-9, 3, -4, 3), ...segment(-4, 2, -4, 0)], 0);
  put(game, 'assembler', -4, -1, 1);
  beltLine(game, segment(-3, -1, -2, -1), 1);
  // Superposition : vitre cobalt (gauche) + vitre rubis (droite)
  put(game, 'extractor', -12, 6, 1);
  beltLine(game, segment(-11, 6, -1, 6), 1);
  put(game, 'assembler', 0, 6, 0);
  beltLine(game, segment(0, 5, 0, 2), 0);
  put(game, 'extractor', 10, 7, 3);
  beltLine(game, [...segment(9, 7, 1, 7), [1, 6]], 3);
}
