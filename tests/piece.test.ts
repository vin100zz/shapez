import { describe, expect, it } from 'vitest';
import { cutPiece, describePiece, isValidPiece, mix, rotateCW, superpose } from '../src/core/piece';

describe('pièces de verre', () => {
  it('mélange les teintes comme des verres superposés', () => {
    expect(mix('r', 'b')).toBe('v');
    expect(mix('y', 'r')).toBe('o');
    expect(mix('b', 'y')).toBe('g');
    expect(mix('r', 'o')).toBe('o');
    expect(mix('r', 'g')).toBe('k');
    expect(mix('-', 'g')).toBe('g');
    expect(mix('b', 'b')).toBe('b');
  });

  it('pivote d\'un quart de tour horaire', () => {
    expect(rotateCW('rr--')).toBe('-rr-');
    expect(rotateCW(rotateCW(rotateCW(rotateCW('rybg'))))).toBe('rybg');
  });

  it('découpe selon la diagonale liée à l\'orientation de la machine', () => {
    expect(cutPiece('rrrr', 0)).toEqual({ right: 'rr--', left: '--rr' });
    expect(cutPiece('rrrr', 1)).toEqual({ right: '-rr-', left: 'r--r' });
    expect(cutPiece('rr--', 1)).toEqual({ right: '-r--', left: 'r---' });
  });

  it('sertit deux moitiés complémentaires', () => {
    expect(superpose('rr--', '--bb')).toBe('rrbb');
    expect(superpose('rrrr', 'bbbb')).toBe('vvvv');
  });

  it('valide et décrit', () => {
    expect(isValidPiece('rr-b')).toBe(true);
    expect(isValidPiece('----')).toBe(false);
    expect(isValidPiece('rrx-')).toBe(false);
    expect(describePiece('rrrr')).toBe('Vitre pleine rubis');
    expect(describePiece('rrbb')).toBe('rubis (haut, droite) · cobalt (bas, gauche)');
  });
});
