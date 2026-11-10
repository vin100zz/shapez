import { BeltSystem } from './belts';
import { OFFER_BLOCKED, OFFER_NONE, OFFER_OK, PORTS, TICK_DT, type OfferResult, type ToolType } from './defs';
import { type Dir, inBounds, worldToLocal } from './geometry';
import type { Op, Snap } from './history';
import { tickMachine, type MachineHost } from './machines';
import type { Piece } from './piece';
import { Progress, type Order } from './progress';
import { World } from './world';

export interface GameEvents {
  onDeliver?(piece: Piece, matched: boolean, x: number, y: number, side: Dir): void;
  onOrderComplete?(order: Order, index: number): void;
}

/** Partie en cours : monde, convoyeurs, machines, progression. Aucune dépendance au navigateur. */
export class Game {
  readonly world: World;
  readonly belts: BeltSystem;
  readonly progress: Progress;
  ticks = 0;
  events: GameEvents = {};
  private readonly host: MachineHost;

  constructor(readonly seed = 1) {
    this.world = new World(seed);
    this.progress = new Progress(seed);
    this.belts = new BeltSystem(this.world, this.offer);
    this.host = { offer: this.offer, machineSpeed: 1 };
  }

  /** Remise d'une pièce à la case (x, y), entrant par le côté monde `side`. */
  readonly offer = (x: number, y: number, side: Dir, piece: Piece): OfferResult => {
    const n = this.world.get(x, y);
    if (!n) return OFFER_NONE;
    if (n.type === 'hub') {
      this.deliver(piece, x, y, side);
      return OFFER_OK;
    }
    const local = worldToLocal(side, n.rot);
    if (!PORTS[n.type].inputs.includes(local)) return OFFER_NONE;
    if (n.type === 'belt') return this.belts.insert(n, side, piece) ? OFFER_OK : OFFER_BLOCKED;
    if (n.type === 'trash') {
      n.anim = 1;
      return OFFER_OK;
    }
    if (n.inBuf[local]) return OFFER_BLOCKED;
    n.inBuf[local] = piece;
    return OFFER_OK;
  };

  private deliver(piece: Piece, x: number, y: number, side: Dir): void {
    const index = this.progress.orderIndex;
    const result = this.progress.deliver(piece);
    this.world.hub.pulse = Math.max(this.world.hub.pulse, result.matched ? 1 : 0.25);
    this.events.onDeliver?.(piece, result.matched, x, y, side);
    if (result.completed) this.events.onOrderComplete?.(result.completed, index);
  }

  /** Un pas de simulation fixe. */
  step(dt = TICK_DT): void {
    if (this.belts.dirty) this.belts.rebuild();
    this.host.machineSpeed = this.progress.machineSpeed;
    const machines = this.world.machines;
    for (let i = 0; i < machines.length; i++) tickMachine(machines[i], dt, this.host);
    this.belts.tick(dt, this.progress.beltSpeed);
    const hub = this.world.hub;
    if (hub.pulse > 0) hub.pulse = Math.max(0, hub.pulse - dt * 1.5);
    this.ticks++;
  }

  canPlace(type: ToolType, x: number, y: number, respectLocks = true): boolean {
    if (!inBounds(x, y)) return false;
    if (this.world.get(x, y)?.type === 'hub') return false;
    if (type === 'extractor' && !this.world.deposits.at(x, y)) return false;
    return !respectLocks || this.progress.isUnlocked(type);
  }

  snapAt(x: number, y: number): Snap | null {
    const b = this.world.get(x, y);
    return b && b.type !== 'hub' ? { type: b.type, rot: b.rot } : null;
  }

  /** Construit (ou réoriente) un bâtiment. Renvoie les opérations à enregistrer pour l'annulation. */
  place(type: ToolType, x: number, y: number, rot: Dir): Op[] {
    if (!this.canPlace(type, x, y)) return [];
    const before = this.snapAt(x, y);
    if (before && before.type === type && before.rot === rot) return [];
    const after: Snap = { type, rot };
    this.applySnap(x, y, after);
    return [{ x, y, before, after }];
  }

  remove(x: number, y: number): Op[] {
    const before = this.snapAt(x, y);
    if (!before) return [];
    this.applySnap(x, y, null);
    return [{ x, y, before, after: null }];
  }

  /** Met la case dans l'état demandé, sans contrôle de déblocage (annulation, chargement). */
  applySnap(x: number, y: number, snap: Snap | null): void {
    const e = this.world.get(x, y);
    if (e?.type === 'hub') return;
    if (!snap) {
      if (e) this.world.remove(e);
    } else if (e && e.type === 'belt' && snap.type === 'belt') {
      e.rot = snap.rot; // un convoyeur réorienté garde ses pièces
      this.world.touch(x, y);
    } else {
      if (e) this.world.remove(e);
      if (snap.type === 'belt') this.world.createBelt(x, y, snap.rot);
      else this.world.createMachine(snap.type, x, y, snap.rot);
    }
    this.belts.markDirty();
  }

  /** Empreinte de l'état de simulation (tests de déterminisme). */
  stateHash(): string {
    if (this.belts.dirty) this.belts.rebuild();
    const p = this.progress;
    const parts: string[] = [`${this.ticks}|${p.orderIndex}|${p.orderCount}|${p.delivered}|${p.beltLevel}|${p.machineLevel}`];
    for (const m of this.world.machines) {
      parts.push(`${m.type}${m.x},${m.y},${m.rot}:${m.inBuf.join('/')}:${m.outBuf.map((o) => o.piece + o.dir).join('/')}:${m.busy ? 1 : 0}:${m.t.toFixed(5)}:${m.rr}`);
    }
    const stash = this.belts.stash();
    for (const b of this.world.belts) {
      const items = stash.get(b);
      if (items) parts.push(`${b.x},${b.y}:${items.map((i) => i.piece + i.t.toFixed(5)).join('/')}`);
    }
    let h = 0x811c9dc5;
    const s = parts.join(';');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16) + ':' + s.length;
  }
}

export { OFFER_BLOCKED, OFFER_NONE, OFFER_OK };
