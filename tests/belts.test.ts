import { describe, expect, it } from 'vitest';
import { ITEM_SPACING, OFFER_OK, TICK_RATE } from '../src/core/defs';
import { Game } from '../src/core/game';
import { beltLine, segment } from '../src/core/scenarios';

const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE; i++) g.step(); };

function gapsOk(g: Game): boolean {
  return g.belts.paths.every((p) => p.items.every((it, i) => i === 0 ? it.gap >= -1e-9 : it.gap >= ITEM_SPACING - 1e-6));
}

describe('convoyeurs en chemins', () => {
  it('regroupe une ligne droite et ses virages en un seul chemin', () => {
    const g = new Game(1);
    beltLine(g, [...segment(0, 20, 5, 20), ...segment(5, 21, 5, 24)], 2);
    g.step();
    expect(g.belts.paths).toHaveLength(1);
    expect(g.belts.paths[0].belts).toHaveLength(10);
  });

  it('transporte une pièce à la vitesse prévue puis la remet au voisin', () => {
    const g = new Game(1);
    beltLine(g, segment(0, 20, 4, 20), 1);
    g.applySnap(5, 20, { type: 'trash', rot: 0 });
    g.step();
    expect(g.offer(0, 20, 3, 'rrrr')).toBe(OFFER_OK);
    let ticks = 0;
    while (g.belts.itemCount() > 0 && ticks < 1000) { g.step(); ticks++; }
    const expected = (5 / g.progress.beltSpeed) * TICK_RATE;
    expect(Math.abs(ticks - expected)).toBeLessThanOrEqual(3);
  });

  it('se compresse quand la sortie est bloquée, sans chevauchement', () => {
    const g = new Game(1);
    beltLine(g, segment(0, 20, 4, 20), 1);
    g.step();
    for (let i = 0; i < 400; i++) { g.offer(0, 20, 3, 'bbbb'); g.step(); }
    expect(g.belts.itemCount()).toBe(5 / ITEM_SPACING + 1);
    expect(gapsOk(g)).toBe(true);
  });

  it('accepte les pièces arrivant par le côté', () => {
    const g = new Game(1);
    beltLine(g, segment(0, 20, 5, 20), 1);
    beltLine(g, segment(3, 17, 3, 19), 2);
    g.step();
    expect(g.belts.paths).toHaveLength(2);
    g.offer(3, 17, 0, 'yyyy');
    run(g, 3);
    const stash = g.belts.stash();
    const last = g.world.get(5, 20)!;
    expect(last.type).toBe('belt');
    expect(stash.get(last as never)?.[0].piece).toBe('yyyy');
  });

  it('fait tourner une boucle fermée sans perdre de pièce', () => {
    const g = new Game(1);
    beltLine(g, [[0, 20], [1, 20], [1, 21], [0, 21]], 0);
    g.step();
    expect(g.belts.paths).toHaveLength(1);
    expect(g.belts.paths[0].loop).toBe(true);
    g.offer(1, 20, 3, 'rrrr');
    g.offer(0, 21, 1, 'bbbb');
    const before = g.stateHash();
    run(g, 10);
    expect(g.belts.itemCount()).toBe(2);
    expect(g.stateHash()).not.toBe(before);
  });

  it('conserve les pièces quand on prolonge, réoriente ou coupe une ligne', () => {
    const g = new Game(1);
    beltLine(g, segment(0, 20, 7, 20), 1);
    g.step();
    for (let i = 0; i < 120; i++) { g.offer(0, 20, 3, 'gggg'); g.step(); }
    const n = g.belts.itemCount();
    g.applySnap(8, 20, { type: 'belt', rot: 1 }); // prolonger
    g.step();
    expect(g.belts.itemCount()).toBe(n);
    g.applySnap(8, 20, { type: 'belt', rot: 2 }); // réorienter
    g.step();
    expect(g.belts.itemCount()).toBe(n);
    const onBelt = g.belts.stash().get(g.world.get(3, 20) as never)?.length ?? 0;
    g.applySnap(3, 20, null); // couper : seules les pièces de cette case disparaissent
    g.step();
    expect(g.belts.itemCount()).toBe(n - onBelt);
    expect(g.belts.paths).toHaveLength(2);
    expect(gapsOk(g)).toBe(true);
  });
});
