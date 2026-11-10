import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../src/core/defs';
import { Game } from '../src/core/game';
import { History } from '../src/core/history';
import { decodeSave, encodeSave, SaveError, serialize } from '../src/core/save';
import { beltLine, buildDemo, segment } from '../src/core/scenarios';

const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * TICK_RATE; i++) g.step(); };

describe('machines', () => {
  it('découpe et recycle la moitié non raccordée', () => {
    const g = new Game(1);
    g.applySnap(0, 20, { type: 'cutter', rot: 0 });
    beltLine(g, segment(1, 20, 3, 20), 1);
    g.step();
    g.offer(0, 20, 2, 'rrrr');
    run(g, 2);
    const stash = g.belts.stash();
    const pieces = [...stash.values()].flat().map((i) => i.piece);
    expect(pieces).toEqual(['rr--']);
  });

  it('superpose deux vitres dans la sertisseuse', () => {
    const g = new Game(1);
    g.applySnap(0, 20, { type: 'assembler', rot: 0 });
    beltLine(g, segment(0, 19, 0, 17), 0);
    g.step();
    g.offer(0, 20, 3, 'rrrr');
    g.offer(0, 20, 1, 'bbbb');
    run(g, 2);
    expect([...g.belts.stash().values()].flat().map((i) => i.piece)).toEqual(['vvvv']);
  });

  it('répartit en alternance', () => {
    const g = new Game(1);
    g.applySnap(0, 20, { type: 'splitter', rot: 0 });
    for (const [x, y] of [[0, 19], [1, 20], [-1, 20]]) g.applySnap(x, y, { type: 'trash', rot: 0 });
    g.step();
    const hits: number[] = [];
    for (let i = 0; i < 6; i++) {
      g.offer(0, 20, 2, 'yyyy');
      g.step();
      hits.push(g.world.machines.findIndex((m) => m.type === 'trash' && m.anim > 0.9));
      for (const m of g.world.machines) m.anim = 0;
    }
    expect(new Set(hits).size).toBe(3);
  });
});

describe('progression', () => {
  it('livre, termine un médaillon et débloque des outils', () => {
    const g = new Game(1);
    expect(g.progress.isUnlocked('cutter')).toBe(false);
    expect(g.place('cutter', 0, 20, 0)).toEqual([]);
    g.place('extractor', -10, -4, 1);
    beltLine(g, [...segment(-9, -4, -2, -4), ...segment(-2, -3, -2, -2)], 2);
    g.place('belt', -2, -1, 1);
    run(g, 20);
    expect(g.progress.orderIndex).toBe(1);
    expect(g.progress.isUnlocked('cutter')).toBe(true);
    expect(g.place('cutter', 0, 20, 0)).toHaveLength(1);
  });

  it('l\'usine de démonstration sertit seule les médaillons 3 et 4', () => {
    const g = new Game(1);
    buildDemo(g);
    run(g, 60);
    expect(g.progress.orderIndex).toBe(4);
  });
});

describe('annuler / rétablir', () => {
  it('annule un tracé entier puis le rétablit', () => {
    const g = new Game(1);
    const h = new History();
    h.begin();
    for (let x = 0; x < 4; x++) h.record(g.place('belt', x, 20, 1));
    h.end();
    h.record(g.place('extractor', -10, -4, 1));
    expect(g.world.count).toBe(5);
    h.undo(g);
    expect(g.world.count).toBe(4);
    h.undo(g);
    expect(g.world.count).toBe(0);
    h.redo(g);
    expect(g.world.count).toBe(4);
    expect(g.world.get(3, 20)?.rot).toBe(1);
  });

  it('restaure le bâtiment remplacé', () => {
    const g = new Game(1);
    g.progress.sandbox = true;
    const h = new History();
    h.record(g.place('cutter', 0, 20, 2));
    h.record(g.place('rotator', 0, 20, 1));
    h.undo(g);
    expect(g.snapAt(0, 20)).toEqual({ type: 'cutter', rot: 2 });
  });
});

describe('sauvegarde', () => {
  it('reprend exactement là où on s\'est arrêté (déterminisme)', () => {
    const a = new Game(42);
    buildDemo(a);
    run(a, 10);
    const restored = decodeSave(encodeSave(serialize(a, { x: 1, y: 2, z: 1 })));
    expect(restored.camera).toEqual({ x: 1, y: 2, z: 1 });
    const b = restored.game;
    expect(b.stateHash()).toBe(a.stateHash());
    run(a, 15);
    run(b, 15);
    expect(b.stateHash()).toBe(a.stateHash());
    expect(b.progress.orderIndex).toBe(a.progress.orderIndex);
  });

  it('refuse une sauvegarde invalide avec un message clair', () => {
    expect(() => decodeSave('pas du json')).toThrow(SaveError);
    expect(() => decodeSave('{"format":"autre","v":1}')).toThrow(/pas une partie de Rosace/);
    expect(() => decodeSave('{"format":"rosace","v":99}')).toThrow(/version 99 inconnue/);
  });
});
