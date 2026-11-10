import { describe, expect, it } from 'vitest';
import { Deposits, SPAWN_PATCHES } from '../src/core/deposits';

describe('gisements procéduraux', () => {
  it('place les gisements de départ près de la rosace', () => {
    const d = new Deposits(7);
    for (const p of SPAWN_PATCHES) expect(d.at(p.x, p.y)).toBe(p.color);
    expect(d.at(0, 0)).toBeNull();
  });

  it('ne dépend que de la graine, pas de l\'ordre de lecture', () => {
    const a = new Deposits(3), b = new Deposits(3), c = new Deposits(4);
    const cells: [number, number][] = [];
    for (let i = 0; i < 4000; i++) cells.push([((i * 37) % 300) - 150, ((i * 91) % 300) - 150]);
    const ra = cells.map(([x, y]) => a.at(x, y));
    const rb = [...cells].reverse().map(([x, y]) => b.at(x, y)).reverse();
    expect(rb).toEqual(ra);
    expect(cells.map(([x, y]) => c.at(x, y))).not.toEqual(ra);
    expect(ra.filter(Boolean).length).toBeGreaterThan(100);
  });
});
