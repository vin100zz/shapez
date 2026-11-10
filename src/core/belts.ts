import { ITEM_SPACING, OFFER_OK, PORTS, type OfferResult } from './defs';
import { DX, DY, type Dir, opposite, turn } from './geometry';
import type { Piece } from './piece';
import type { Belt, World } from './world';

/**
 * Une pièce sur un chemin. `gap` est la distance (en cases) à la pièce qui la précède,
 * ou au bout du chemin pour la première : on ne stocke que des écarts, jamais de positions absolues.
 */
export interface BeltItem {
  piece: Piece;
  gap: number;
  /** Côté (monde) par lequel la pièce est entrée sur la case `sideTile`, si ce n'est pas l'entrée principale. */
  side: Dir | -1;
  sideTile: number;
}

/** Pièce rangée sur un convoyeur précis : `t` ∈ [0, 1] = avancement sur la case. */
export interface StashedItem { piece: Piece; t: number; side: Dir | -1 }

/** Suite de convoyeurs qui se suivent : la simulation la traite comme une seule file. */
export class BeltPath {
  readonly belts: Belt[] = [];
  /** Pièces, de la plus avancée (en bout de chemin) à la plus en retrait. */
  items: BeltItem[] = [];
  /** Le chemin boucle sur lui-même. */
  loop = false;
  /** Borne basse de l'indice de la première pièce qui peut encore avancer (optimisation). */
  scanFrom = 0;
}

export type OfferFn = (x: number, y: number, side: Dir, piece: Piece) => OfferResult;

const EPS = 1e-9;

/**
 * Système de convoyeurs. Les convoyeurs sont regroupés en chemins à chaque modification de la carte ;
 * à chaque tic, un chemin fluide ne coûte qu'une soustraction, quel que soit son nombre de pièces.
 */
export class BeltSystem {
  paths: BeltPath[] = [];
  dirty = true;
  private incoming: Map<Belt, StashedItem[]> | null = null;

  constructor(private readonly world: World, private readonly offer: OfferFn) {}

  markDirty(): void {
    this.dirty = true;
  }

  /** Pièces à replacer au prochain regroupement (chargement d'une sauvegarde). */
  load(items: Map<Belt, StashedItem[]>): void {
    this.incoming = items;
    this.dirty = true;
  }

  /** Pièces actuellement posées, rangées par convoyeur. Les pièces des convoyeurs supprimés sont perdues. */
  stash(): Map<Belt, StashedItem[]> {
    const out = new Map<Belt, StashedItem[]>();
    for (const p of this.paths) {
      const len = p.belts.length;
      let d = 0;
      for (const it of p.items) {
        d += it.gap;
        const s = len - d;
        let idx = Math.floor(s);
        let t = s - idx;
        if (idx >= len) { idx = len - 1; t = 1; } else if (idx < 0) { idx = 0; t = 0; }
        const belt = p.belts[idx];
        if (belt.removed) continue;
        let list = out.get(belt);
        if (!list) out.set(belt, (list = []));
        list.push({ piece: it.piece, t, side: it.sideTile === idx ? it.side : -1 });
      }
    }
    return out;
  }

  /** Regroupe les convoyeurs en chemins et y replace les pièces. Coût linéaire, à chaque modification. */
  rebuild(): void {
    const stash = this.stash();
    if (this.incoming) {
      for (const [belt, list] of this.incoming) stash.set(belt, list);
      this.incoming = null;
    }
    const belts = this.world.belts;
    for (const b of belts) b.inSide = this.computeInSide(b);
    const next = new Map<Belt, Belt>();
    const hasUpstream = new Set<Belt>();
    for (const b of belts) {
      const up = this.upstream(b);
      if (up) {
        next.set(up, b);
        hasUpstream.add(b);
      }
    }
    const paths: BeltPath[] = [];
    const visited = new Set<Belt>();
    const walk = (start: Belt, loop: boolean): void => {
      const p = new BeltPath();
      p.loop = loop;
      let cur: Belt | undefined = start;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        cur.path = p;
        cur.index = p.belts.length;
        p.belts.push(cur);
        cur = next.get(cur);
      }
      paths.push(p);
    };
    for (const b of belts) if (!hasUpstream.has(b)) walk(b, false);
    for (const b of belts) if (!visited.has(b)) walk(b, true); // boucles fermées

    for (const p of paths) {
      const len = p.belts.length;
      let prev = 0;
      for (let i = len - 1; i >= 0; i--) {
        const list = stash.get(p.belts[i]);
        if (!list) continue;
        list.sort((a, b) => b.t - a.t);
        for (const s of list) {
          const d = len - (i + s.t);
          p.items.push({
            piece: s.piece,
            gap: Math.max(0, d - prev),
            side: s.side !== -1 && s.side !== p.belts[i].inSide ? s.side : -1,
            sideTile: i,
          });
          prev = Math.max(prev, d);
        }
      }
    }
    this.paths = paths;
    this.dirty = false;
  }

  /** Dépose une pièce sur un convoyeur, entrant par le côté monde `side`. */
  insert(b: Belt, side: Dir, piece: Piece): boolean {
    const p = b.path;
    if (!p || side === b.rot) return false;
    const items = p.items;
    const dNew = p.belts.length - b.index;
    let d = 0;
    let i = 0;
    for (; i < items.length; i++) {
      const nd = d + items[i].gap;
      if (nd > dNew) break;
      d = nd;
    }
    if (i > 0 && dNew - d < ITEM_SPACING - EPS) return false; // trop près de la pièce de devant
    if (i < items.length && d + items[i].gap - dNew < ITEM_SPACING - EPS) return false; // trop près de celle de derrière
    const gap = dNew - d;
    if (i < items.length) items[i].gap -= gap;
    items.splice(i, 0, { piece, gap, side: side !== b.inSide ? side : -1, sideTile: b.index });
    if (i < p.scanFrom) p.scanFrom = i;
    return true;
  }

  tick(dt: number, speed: number): void {
    const step = speed * dt;
    for (const p of this.paths) {
      const items = p.items;
      if (!items.length) continue;
      // La pièce de tête est arrivée au bout : on tente de la remettre au voisin.
      if (items[0].gap <= EPS) {
        items[0].gap = 0;
        const last = p.belts[p.belts.length - 1];
        if (this.offer(last.x + DX[last.rot], last.y + DY[last.rot], opposite(last.rot), items[0].piece) === OFFER_OK) {
          items.shift();
          p.scanFrom = 0;
          if (!items.length) continue;
        }
      }
      // Avancer : réduire le premier écart compressible fait avancer d'un coup toutes les pièces derrière lui.
      let m = step;
      let i = items[0].gap > EPS ? 0 : Math.max(1, p.scanFrom);
      let first = -1;
      for (; i < items.length && m > EPS; i++) {
        const it = items[i];
        const can = it.gap - (i === 0 ? 0 : ITEM_SPACING);
        if (can > EPS) {
          if (first < 0) first = i;
          const take = can < m ? can : m;
          it.gap -= take;
          m -= take;
        }
      }
      p.scanFrom = first < 0 ? items.length : first;
    }
  }

  /** Parcourt les pièces d'un chemin avec leur case et leur avancement sur la case. */
  forEachItem(p: BeltPath, cb: (item: BeltItem, belt: Belt, t: number) => void): void {
    const len = p.belts.length;
    let d = 0;
    for (const it of p.items) {
      d += it.gap;
      const s = len - d;
      let idx = Math.floor(s);
      let t = s - idx;
      if (idx >= len) { idx = len - 1; t = 1; } else if (idx < 0) { idx = 0; t = 0; }
      cb(it, p.belts[idx], t);
    }
  }

  itemCount(): number {
    let n = 0;
    for (const p of this.paths) n += p.items.length;
    return n;
  }

  private feeds(b: Belt, side: Dir): boolean {
    const n = this.world.get(b.x + DX[side], b.y + DY[side]);
    if (!n || n.type === 'hub') return false;
    const toward = opposite(side);
    if (n.type === 'belt') return n.rot === toward;
    return PORTS[n.type].outputs.some((l) => turn(l, n.rot) === toward);
  }

  private computeInSide(b: Belt): Dir {
    const back = turn(b.rot, 2), right = turn(b.rot, 1), left = turn(b.rot, 3);
    if (this.feeds(b, back)) return back;
    const fr = this.feeds(b, right), fl = this.feeds(b, left);
    if (fr && !fl) return right;
    if (fl && !fr) return left;
    return back;
  }

  private upstream(b: Belt): Belt | null {
    const n = this.world.get(b.x + DX[b.inSide], b.y + DY[b.inSide]);
    return n && n.type === 'belt' && n.rot === opposite(b.inSide) ? n : null;
  }
}
