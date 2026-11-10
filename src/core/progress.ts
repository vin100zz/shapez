import { BELT_SPEED, type ToolType } from './defs';
import { EMPTY, type Piece } from './piece';
import { mulberry32 } from './rng';

export interface Unlock {
  tools?: ToolType[];
  upgrade?: 'belt' | 'machine';
  label: string;
}

export interface Order {
  piece: Piece;
  count: number;
  title: string;
  hint: string;
  unlock: Unlock | null;
}

export const STARTING_TOOLS: readonly ToolType[] = ['belt', 'extractor'];

/** Premier anneau : chaque médaillon enseigne une notion et débloque la suivante. */
export const RING1: readonly Order[] = [
  { piece: 'rrrr', count: 8, title: 'Premier verre', hint: 'Posez un Extracteur sur le sable rubis et reliez-le à la rosace avec des convoyeurs.', unlock: { tools: ['cutter', 'trash'], label: 'Découpeuse et Recycleur' } },
  { piece: 'yy--', count: 10, title: 'La découpe', hint: 'Une Découpeuse tournée vers le haut envoie la moitié haut-droite par sa droite.', unlock: { tools: ['assembler'], label: 'Sertisseuse' } },
  { piece: 'rrbb', count: 20, title: 'Le sertissage', hint: 'Sertissez une moitié rubis (haut-droite) avec une moitié cobalt (bas-gauche).', unlock: { tools: ['rotator'], label: 'Pivot' } },
  { piece: 'vvvv', count: 12, title: 'La superposition', hint: 'Deux vitres pleines superposées mélangent leurs teintes : rubis + cobalt = améthyste.', unlock: { tools: ['splitter'], label: 'Répartiteur' } },
  { piece: 'ovvo', count: 14, title: 'Crépuscule', hint: 'Tournée vers la droite, la Découpeuse coupe selon l\'autre diagonale.', unlock: { upgrade: 'belt', label: 'Convoyeurs 50 % plus rapides' } },
  { piece: 'rbrb', count: 16, title: 'Le moulin', hint: 'Coupez deux fois (Pivot ou deux Découpeuses) pour isoler des triangles.', unlock: { upgrade: 'machine', label: 'Machines 50 % plus rapides' } },
  { piece: 'rybg', count: 20, title: 'La lumière', hint: 'Quatre triangles, quatre couleurs : le cœur de la rosace.', unlock: { label: 'Second anneau de la rosace' } },
];
export const RING2_SIZE = 12;
/** Nombre de médaillons de la rosace (premier anneau + second anneau). */
export const ROSACE_SIZE = RING1.length + RING2_SIZE;

function randomPiece(rnd: () => number): Piece {
  const palette = 'rybogv';
  let p = '';
  for (let i = 0; i < 4; i++) p += rnd() < 0.12 ? '-' : palette[Math.floor(rnd() * palette.length)];
  return p === EMPTY ? 'gggg' : p;
}

const cache = new Map<string, Order>();

/** Commande n° `index` (scénarisée, puis générée à partir de la graine). */
export function orderAt(index: number, seed: number): Order {
  if (index < RING1.length) return RING1[index];
  const key = `${seed}:${index}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rnd = mulberry32((seed * 7919 + index * 104729) | 0);
  let order: Order;
  if (index < ROSACE_SIZE) {
    const j = index - RING1.length;
    const unlock: Unlock | null = j === 5 ? { upgrade: 'belt', label: 'Convoyeurs encore plus rapides' } : j === 11 ? { upgrade: 'machine', label: 'Machines encore plus rapides' } : null;
    order = { piece: randomPiece(rnd), count: 16 + j * 2, title: `Médaillon libre ${j + 1}`, hint: 'Second anneau : commandes générées. Construisez des lignes réutilisables !', unlock };
  } else {
    order = { piece: randomPiece(rnd), count: 30, title: 'Commande libre', hint: 'La rosace est achevée. Les prochaines verrières arriveront dans une version ultérieure.', unlock: null };
  }
  cache.set(key, order);
  return order;
}

/** Index du médaillon qui débloque un outil, ou null s'il est disponible d'emblée. */
export function unlockedBy(tool: ToolType): number | null {
  const i = RING1.findIndex((o) => o.unlock?.tools?.includes(tool));
  return i < 0 ? null : i;
}

export interface DeliveryResult { matched: boolean; completed: Order | null }

export class Progress {
  orderIndex = 0;
  orderCount = 0;
  delivered = 0;
  unlocked = new Set<ToolType>(STARTING_TOOLS);
  beltLevel = 0;
  machineLevel = 0;
  /** Bac à sable : tous les outils sont disponibles. */
  sandbox = false;

  constructor(readonly seed: number) {}

  get order(): Order {
    return orderAt(this.orderIndex, this.seed);
  }

  get beltSpeed(): number {
    return BELT_SPEED * (1 + 0.5 * this.beltLevel);
  }

  get machineSpeed(): number {
    return 1 + 0.5 * this.machineLevel;
  }

  isUnlocked(tool: ToolType): boolean {
    return this.sandbox || this.unlocked.has(tool);
  }

  /** Avancement d'un médaillon de la rosace, entre 0 et 1. */
  fraction(index: number): number {
    if (index < this.orderIndex) return 1;
    if (index > this.orderIndex) return 0;
    return this.orderCount / this.order.count;
  }

  deliver(piece: Piece): DeliveryResult {
    this.delivered++;
    const order = this.order;
    if (piece !== order.piece) return { matched: false, completed: null };
    this.orderCount++;
    if (this.orderCount < order.count) return { matched: true, completed: null };
    if (order.unlock) {
      for (const t of order.unlock.tools ?? []) this.unlocked.add(t);
      if (order.unlock.upgrade === 'belt') this.beltLevel++;
      if (order.unlock.upgrade === 'machine') this.machineLevel++;
    }
    this.orderIndex++;
    this.orderCount = 0;
    return { matched: true, completed: order };
  }
}
