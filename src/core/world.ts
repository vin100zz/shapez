import type { BeltPath } from './belts';
import type { BuildingType, MachineType } from './defs';
import { HUB_MIN, HUB_SIZE } from './defs';
import { Deposits } from './deposits';
import { CHUNK, type Dir, chunkCoord, chunkKey, tileKey } from './geometry';
import type { Color, Piece } from './piece';

interface Base {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  rot: Dir;
  /** Position dans la liste de son espèce (suppression en O(1)). */
  slot: number;
  removed: boolean;
}

export interface Belt extends Base {
  type: 'belt';
  path: BeltPath | null;
  index: number;
  /** Côté (monde) de l'entrée principale : arrière, ou côté si le convoyeur fait un virage. */
  inSide: Dir;
}

export interface Output { piece: Piece; dir: Dir; drop: boolean }

export interface Machine extends Base {
  type: MachineType;
  /** Tampon d'entrée par côté local. */
  inBuf: (Piece | null)[];
  outBuf: Output[];
  busy: boolean;
  t: number;
  pending: Output[] | null;
  /** Prochaine sortie du répartiteur. */
  rr: number;
  /** Compteur d'animation (rendu uniquement). */
  anim: number;
  /** Couleur du gisement sous un extracteur. */
  dep: Color | null;
}

export interface Hub extends Base { type: 'hub'; pulse: number }

export type Building = Belt | Machine | Hub;

/** Stockage du monde : cases occupées, index par bloc pour le rendu, listes ordonnées pour la simulation. */
export class World {
  readonly deposits: Deposits;
  readonly belts: Belt[] = [];
  readonly machines: Machine[] = [];
  readonly hub: Hub;
  private readonly tiles = new Map<number, Building>();
  private readonly chunks = new Map<number, Set<Building>>();
  private readonly versions = new Map<number, number>();
  private nextId = 1;

  constructor(readonly seed: number) {
    this.deposits = new Deposits(seed);
    this.hub = { id: this.nextId++, type: 'hub', x: HUB_MIN, y: HUB_MIN, rot: 0, slot: -1, removed: false, pulse: 0 };
    for (let dy = 0; dy < HUB_SIZE; dy++)
      for (let dx = 0; dx < HUB_SIZE; dx++) this.tiles.set(tileKey(HUB_MIN + dx, HUB_MIN + dy), this.hub);
    this.indexChunk(this.hub, true);
  }

  get(x: number, y: number): Building | undefined {
    return this.tiles.get(tileKey(x, y));
  }

  get count(): number {
    return this.belts.length + this.machines.length;
  }

  createBelt(x: number, y: number, rot: Dir): Belt {
    const b: Belt = { id: this.nextId++, type: 'belt', x, y, rot, slot: this.belts.length, removed: false, path: null, index: 0, inSide: ((rot + 2) % 4) as Dir };
    this.belts.push(b);
    this.attach(b);
    return b;
  }

  createMachine(type: MachineType, x: number, y: number, rot: Dir): Machine {
    const m: Machine = {
      id: this.nextId++, type, x, y, rot, slot: this.machines.length, removed: false,
      inBuf: [null, null, null, null], outBuf: [], busy: false, t: 0, pending: null, rr: 0, anim: 0,
      dep: type === 'extractor' ? this.deposits.at(x, y) : null,
    };
    this.machines.push(m);
    this.attach(m);
    return m;
  }

  remove(b: Building): void {
    if (b.type === 'hub' || b.removed) return;
    const list: Building[] = b.type === 'belt' ? this.belts : this.machines;
    const last = list.pop()!;
    if (last !== b) {
      list[b.slot] = last;
      last.slot = b.slot;
    }
    b.removed = true;
    this.tiles.delete(tileKey(b.x, b.y));
    this.indexChunk(b, false);
    this.touch(b.x, b.y);
  }

  /** Numéro de version d'un bloc : change dès qu'un bâtiment du bloc ou de son voisinage change (cache de rendu). */
  chunkVersion(cx: number, cy: number): number {
    return this.versions.get(chunkKey(cx, cy)) ?? 0;
  }

  /** Signale un changement en (x, y) : les blocs voisins sont concernés (virages des convoyeurs). */
  touch(x: number, y: number): void {
    const seen = new Set<number>();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = chunkKey(chunkCoord(x + dx), chunkCoord(y + dy));
        if (seen.has(key)) continue;
        seen.add(key);
        this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
      }
    }
  }

  /** Bâtiments d'un bloc (pour le rendu). */
  inChunk(cx: number, cy: number): ReadonlySet<Building> | undefined {
    return this.chunks.get(chunkKey(cx, cy));
  }

  private attach(b: Building): void {
    this.tiles.set(tileKey(b.x, b.y), b);
    this.indexChunk(b, true);
    this.touch(b.x, b.y);
  }

  private indexChunk(b: Building, add: boolean): void {
    const span = b.type === 'hub' ? HUB_SIZE : 1;
    const seen = new Set<number>();
    for (let dy = 0; dy < span; dy++) {
      for (let dx = 0; dx < span; dx++) {
        const key = chunkKey(chunkCoord(b.x + dx), chunkCoord(b.y + dy));
        if (seen.has(key)) continue;
        seen.add(key);
        let set = this.chunks.get(key);
        if (add) {
          if (!set) this.chunks.set(key, (set = new Set()));
          set.add(b);
        } else if (set) {
          set.delete(b);
          if (!set.size) this.chunks.delete(key);
        }
      }
    }
  }
}

export const CHUNK_SIZE = CHUNK;
