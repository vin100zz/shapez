/** Directions du monde : 0 = haut (nord), 1 = droite (est), 2 = bas (sud), 3 = gauche (ouest). */
export type Dir = 0 | 1 | 2 | 3;

export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];

export const turn = (d: number, r: number): Dir => ((((d + r) % 4) + 4) % 4) as Dir;
export const opposite = (d: Dir): Dir => turn(d, 2);

/** Côtés locaux d'un bâtiment : 0 = avant, 1 = droite, 2 = arrière, 3 = gauche. */
export const localToWorld = (local: number, rot: Dir): Dir => turn(local, rot);
export const worldToLocal = (world: Dir, rot: Dir): number => turn(world, -rot);

/** Le monde est « infini » dans la limite de ±COORD_LIMIT cases, largement hors d'atteinte d'une partie. */
export const COORD_LIMIT = 30000;
export const inBounds = (x: number, y: number): boolean =>
  Math.abs(x) <= COORD_LIMIT && Math.abs(y) <= COORD_LIMIT;

export const tileKey = (x: number, y: number): number => (x + 32768) * 65536 + (y + 32768);

/** Taille d'un bloc (chunk), en cases. */
export const CHUNK = 32;
export const chunkCoord = (v: number): number => Math.floor(v / CHUNK);
export const chunkKey = (cx: number, cy: number): number => (cx + 32768) * 65536 + (cy + 32768);
