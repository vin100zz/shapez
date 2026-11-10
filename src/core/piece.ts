import type { Dir } from './geometry';

/**
 * Une pièce de verre est un carré partagé par ses deux diagonales en quatre triangles.
 * Elle est codée par 4 caractères : triangle du haut, de droite, du bas, de gauche.
 * '-' = triangle vide. Les pièces sont des chaînes immuables : comparaison immédiate, cache de rendu facile.
 */
export type Color = 'r' | 'y' | 'b' | 'o' | 'g' | 'v' | 'k';
export type Slot = Color | '-';
export type Piece = string;

export const PRIMARY: readonly Color[] = ['r', 'y', 'b'];
export const SECONDARY: readonly Color[] = ['o', 'g', 'v'];

export const COLORS: Readonly<Record<Color, { name: string; hex: string }>> = {
  r: { name: 'rubis', hex: '#e0566b' },
  y: { name: 'ambre', hex: '#f4b942' },
  b: { name: 'cobalt', hex: '#3f72d9' },
  o: { name: 'corail', hex: '#f08a3c' },
  g: { name: 'émeraude', hex: '#38a878' },
  v: { name: 'améthyste', hex: '#8d5bd1' },
  k: { name: 'grisaille', hex: '#6b7280' },
};

const MIX2: Readonly<Record<string, Color>> = { ry: 'o', yr: 'o', yb: 'g', by: 'g', rb: 'v', br: 'v' };
const SECONDARY_PARTS: Readonly<Record<string, string>> = { o: 'ry', g: 'yb', v: 'rb' };

/** Superposer deux verres mélange leurs teintes (mélange soustractif simplifié). */
export function mix(a: Slot, b: Slot): Slot {
  if (a === '-') return b;
  if (b === '-') return a;
  if (a === b) return a;
  const pair = MIX2[a + b];
  if (pair) return pair;
  if (SECONDARY_PARTS[b]?.includes(a)) return b;
  if (SECONDARY_PARTS[a]?.includes(b)) return a;
  return 'k';
}

export const EMPTY: Piece = '----';
export const isEmpty = (p: Piece): boolean => p === EMPTY;
export const fullPane = (c: Color): Piece => c + c + c + c;

/** Quart de tour dans le sens horaire : le triangle du haut passe à droite. */
export const rotateCW = (p: Piece): Piece => p[3] + p[0] + p[1] + p[2];

export function keepSlots(p: Piece, slots: readonly number[]): Piece {
  let out = '';
  for (let i = 0; i < 4; i++) out += slots.includes(i) ? p[i] : '-';
  return out;
}

/** Sertissage : assemble deux pièces ; là où deux verres se recouvrent, les teintes se mélangent. */
export function superpose(a: Piece, b: Piece): Piece {
  let out = '';
  for (let i = 0; i < 4; i++) out += mix(a[i] as Slot, b[i] as Slot);
  return out;
}

/**
 * Découpe selon la diagonale qui sépare l'avant-droite de l'arrière-gauche d'une machine orientée `rot`.
 * `right` sort par le côté droit de la machine, `left` par le côté gauche.
 */
export function cutPiece(p: Piece, rot: Dir): { right: Piece; left: Piece } {
  return {
    right: keepSlots(p, [rot, (rot + 1) % 4]),
    left: keepSlots(p, [(rot + 2) % 4, (rot + 3) % 4]),
  };
}

const VALID = /^[rybogvk-]{4}$/;
export const isValidPiece = (p: unknown): p is Piece => typeof p === 'string' && VALID.test(p) && p !== EMPTY;

const SLOT_NAMES = ['haut', 'droite', 'bas', 'gauche'];

/** Description en français, pour l'interface. */
export function describePiece(p: Piece): string {
  if (p[0] !== '-' && p === p[0].repeat(4)) return `Vitre pleine ${COLORS[p[0] as Color].name}`;
  const groups = new Map<string, string[]>();
  for (let i = 0; i < 4; i++) {
    const list = groups.get(p[i]) ?? [];
    list.push(SLOT_NAMES[i]);
    groups.set(p[i], list);
  }
  return [...groups]
    .map(([c, where]) => `${c === '-' ? 'vide' : COLORS[c as Color].name} (${where.join(', ')})`)
    .join(' · ');
}
