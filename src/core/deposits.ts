import { CHUNK, chunkCoord, chunkKey } from './geometry';
import type { Color } from './piece';
import { hash2, mulberry32 } from './rng';

interface Patch { x: number; y: number; r: number; color: Color }

const CODES: readonly Color[] = ['r', 'y', 'b', 'o', 'g', 'v', 'k'];
/** Taille d'une région de génération : au plus un gisement aléatoire par région. */
const REGION = 12;
/** Rayon autour de la rosace réservé aux gisements de départ. */
const SPAWN_RADIUS = 17;
const MAX_REACH = 4;

/** Gisements de départ, fixes, à portée de la rosace. */
export const SPAWN_PATCHES: readonly Patch[] = [
  { x: -10, y: -4, r: 2.7, color: 'r' },
  { x: -10, y: 5, r: 2.7, color: 'b' },
  { x: 9, y: -7, r: 2.5, color: 'y' },
  { x: 9, y: 8, r: 2.2, color: 'r' },
];

/**
 * Gisements de sable coloré, générés à la demande et mis en cache par bloc.
 * Le résultat ne dépend que de la graine : deux parties de même graine ont la même carte.
 */
export class Deposits {
  private readonly cache = new Map<number, Int8Array>();
  private readonly regions = new Map<number, Patch | null>();

  constructor(readonly seed: number) {}

  at(x: number, y: number): Color | null {
    const cx = chunkCoord(x), cy = chunkCoord(y);
    const key = chunkKey(cx, cy);
    let chunk = this.cache.get(key);
    if (!chunk) {
      chunk = this.generate(cx, cy);
      this.cache.set(key, chunk);
    }
    const code = chunk[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
    return code ? CODES[code - 1] : null;
  }

  private regionPatch(rx: number, ry: number): Patch | null {
    const key = chunkKey(rx, ry);
    if (this.regions.has(key)) return this.regions.get(key) ?? null;
    const rnd = mulberry32(Math.floor(hash2(rx, ry, this.seed) * 2 ** 31));
    let patch: Patch | null = null;
    if (rnd() < 0.62) {
      const x = rx * REGION + 2 + rnd() * (REGION - 4);
      const y = ry * REGION + 2 + rnd() * (REGION - 4);
      const r = 1.7 + rnd() * 1.6;
      const dist = Math.hypot(x, y);
      if (dist - r - 1 > SPAWN_RADIUS) {
        const secondary = dist > 48 && rnd() < 0.3;
        const palette = secondary ? ['o', 'g', 'v'] : ['r', 'y', 'b'];
        patch = { x, y, r, color: palette[Math.floor(rnd() * 3)] as Color };
      }
    }
    this.regions.set(key, patch);
    return patch;
  }

  private generate(cx: number, cy: number): Int8Array {
    const out = new Int8Array(CHUNK * CHUNK);
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const patches: Patch[] = [];
    for (const p of SPAWN_PATCHES) {
      if (p.x + MAX_REACH >= x0 && p.x - MAX_REACH < x0 + CHUNK && p.y + MAX_REACH >= y0 && p.y - MAX_REACH < y0 + CHUNK) patches.push(p);
    }
    const rx0 = Math.floor((x0 - MAX_REACH) / REGION), rx1 = Math.floor((x0 + CHUNK + MAX_REACH) / REGION);
    const ry0 = Math.floor((y0 - MAX_REACH) / REGION), ry1 = Math.floor((y0 + CHUNK + MAX_REACH) / REGION);
    for (let ry = ry0; ry <= ry1; ry++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const p = this.regionPatch(rx, ry);
        if (p) patches.push(p);
      }
    }
    if (!patches.length) return out;
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const x = x0 + tx, y = y0 + ty;
        const jitter = hash2(x, y, this.seed ^ 0x5bd1e995);
        for (const p of patches) {
          if (Math.hypot(x - p.x, y - p.y) <= p.r - 0.4 + jitter * 0.9) {
            out[ty * CHUNK + tx] = CODES.indexOf(p.color) + 1;
            break;
          }
        }
      }
    }
    return out;
  }
}
