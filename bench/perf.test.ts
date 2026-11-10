import { expect, it } from 'vitest';
import { Game } from '../src/core/game';

/** Grande usine synthétique : `lines` lignes de `len` convoyeurs, saturées, qui se vident dans des recycleurs. */
function bigFactory(lines: number, len: number): Game {
  const g = new Game(1);
  for (let l = 0; l < lines; l++) {
    const y = 40 + l;
    for (let x = 0; x < len; x++) g.applySnap(x, y, { type: 'belt', rot: 1 });
    g.applySnap(len, y, { type: 'trash', rot: 0 });
  }
  g.step();
  for (const p of g.belts.paths) {
    const max = Math.floor(p.belts.length / 0.5);
    p.items = Array.from({ length: max }, (_, i) => ({ piece: 'rrbb', gap: i === 0 ? 0.25 : 0.5, side: -1 as const, sideTile: 0 }));
  }
  return g;
}

function measure(label: string, runs: number, fn: () => void): number {
  for (let i = 0; i < Math.min(30, runs); i++) fn(); // préchauffage
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  const ms = (performance.now() - t0) / runs;
  console.log(`${label} : ${ms.toFixed(3)} ms`);
  return ms;
}

it('tient la charge visée (25 000 convoyeurs, 50 000 pièces)', () => {
  const g = bigFactory(250, 100);
  console.log(`Usine de test : ${g.world.count} bâtiments, ${g.belts.itemCount()} pièces`);
  const tick = measure('Un tic de simulation', 600, () => {
    for (const p of g.belts.paths) if (p.items.length < 200) p.items.push({ piece: 'rrbb', gap: 0.5, side: -1, sideTile: 0 });
    g.step();
  });
  console.log(`Pièces après la mesure : ${g.belts.itemCount()}`);
  const rebuild = measure('Regroupement des chemins (après une modification)', 20, () => g.belts.rebuild());
  // Budget : à 60 tics/s, la simulation doit laisser l'essentiel de l'image au rendu.
  expect(tick).toBeLessThan(4);
  expect(rebuild).toBeLessThan(50);
});
