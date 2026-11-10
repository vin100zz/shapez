import { HUB_MIN, HUB_SIZE, type ToolType } from '../core/defs';
import type { Deposits } from '../core/deposits';
import type { Game } from '../core/game';
import { CHUNK, chunkCoord, chunkKey, DX, DY, type Dir, turn } from '../core/geometry';
import type { Piece } from '../core/piece';
import { ROSACE_SIZE, orderAt } from '../core/progress';
import { hash2 } from '../core/rng';
import type { Belt, Building, Machine } from '../core/world';
import { Camera } from './camera';
import { ACCENT, arrowHead, bezier, colorHex, drawMachineAnim, drawRosace, drawTrack, roundRect, trackPoints, TS, type RosaceModel } from './draw';
import { BELT_FRAMES, Sprites } from './sprites';

export type ToolId = ToolType | 'hand' | 'erase';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }

export interface RenderInput {
  game: Game;
  camera: Camera;
  /** Temps de simulation (s) : anime convoyeurs et machines, s'arrête en pause. */
  simTime: number;
  /** Temps réel (s) : animations d'interface. */
  realTime: number;
  tool: ToolId;
  rot: Dir;
  hover: { x: number; y: number } | null;
  showGhost: boolean;
  particles: readonly Particle[];
}

const ITEM = TS * 0.42;
const DEP_RES = 8; // pixels par case pour les images de gisements
const DURATIONS: Record<string, number> = { extractor: 1, cutter: 0.5, rotator: 0.35, assembler: 0.7 };

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private readonly sprites = new Sprites();
  private readonly depChunks = new Map<number, HTMLCanvasElement | null>();
  private readonly layers = new Map<number, { img: HTMLCanvasElement; version: number; q: number }>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  /** Remet à zéro le cache des gisements (nouvelle partie, autre graine). */
  resetWorld(): void {
    this.depChunks.clear();
    this.layers.clear();
  }

  render(r: RenderInput): void {
    const { game, camera: cam } = r;
    const c = this.ctx, dpr = this.dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#f6f1e7';
    c.fillRect(0, 0, cam.viewW, cam.viewH);
    const scale = cam.z * dpr;
    const q = Sprites.quantize(scale);
    c.setTransform(scale, 0, 0, scale, dpr * (cam.viewW / 2 - cam.x * cam.z), dpr * (cam.viewH / 2 - cam.y * cam.z));
    const [ax, ay] = cam.screenToWorld(0, 0), [bx, by] = cam.screenToWorld(cam.viewW, cam.viewH);
    const x0 = Math.floor(ax / TS) - 1, y0 = Math.floor(ay / TS) - 1, x1 = Math.floor(bx / TS) + 1, y1 = Math.floor(by / TS) + 1;
    // Trois niveaux de détail : complet, intermédiaire (couches par bloc), simplifié.
    const far = TS * cam.z < 14;
    const mid = !far && TS * cam.z < 22;

    this.drawDeposits(game.world.deposits, x0, y0, x1, y1, cam.z);
    if (cam.z >= 0.45) {
      c.strokeStyle = 'rgba(120,100,70,.10)'; c.lineWidth = 1 / cam.z; c.beginPath();
      for (let x = x0; x <= x1 + 1; x++) { c.moveTo(x * TS, y0 * TS); c.lineTo(x * TS, (y1 + 1) * TS); }
      for (let y = y0; y <= y1 + 1; y++) { c.moveTo(x0 * TS, y * TS); c.lineTo((x1 + 1) * TS, y * TS); }
      c.stroke();
    }

    // Bâtiments visibles, par bloc.
    const belts: Belt[] = [], machines: Machine[] = [];
    const inView = (b: Building) => b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1;
    for (let cy = chunkCoord(y0); cy <= chunkCoord(y1); cy++) {
      for (let cx = chunkCoord(x0); cx <= chunkCoord(x1); cx++) {
        const set = game.world.inChunk(cx, cy);
        if (!set) continue;
        for (const b of set) {
          if (b.type === 'hub' || !inView(b)) continue;
          if (b.type === 'belt') belts.push(b); else machines.push(b);
        }
      }
    }

    if (mid) {
      for (let cy = chunkCoord(y0); cy <= chunkCoord(y1); cy++) {
        for (let cx = chunkCoord(x0); cx <= chunkCoord(x1); cx++) {
          const img = this.chunkLayer(game, cx, cy, q);
          if (img) c.drawImage(img, cx * CHUNK * TS, cy * CHUNK * TS, CHUNK * TS, CHUNK * TS);
        }
      }
      this.drawBeltFlows(game, belts, x0, y0, x1, y1);
    } else if (far) {
      c.fillStyle = '#d3c6b1';
      for (const b of belts) c.fillRect(b.x * TS + 4, b.y * TS + 4, TS - 8, TS - 8);
      for (const m of machines) { c.fillStyle = m.type === 'extractor' && m.dep ? colorHex(m.dep) : '#5b5468'; c.fillRect(m.x * TS + 6, m.y * TS + 6, TS - 12, TS - 12); }
    } else {
      const phase = ((r.simTime * game.progress.beltSpeed) % 0.5) / 0.5;
      const frame = Math.floor(phase * BELT_FRAMES) % BELT_FRAMES;
      for (const b of belts) c.drawImage(this.sprites.belt(b.inSide, b.rot, frame, q), b.x * TS, b.y * TS, TS, TS);
      for (const m of machines) {
        c.drawImage(this.sprites.machine(m.type, m.rot, m.dep, q), m.x * TS, m.y * TS, TS, TS);
        if (m.type === 'extractor' || m.type === 'trash') drawMachineAnim(c, m.type, (m.x + 0.5) * TS, (m.y + 0.5) * TS, TS, m.anim);
      }
      this.drawBeltItems(game, belts, q, x0, y0, x1, y1);
      for (const m of machines) this.drawMachineItems(m, q);
    }

    this.drawHub(game, r.realTime);
    for (const p of r.particles) {
      c.globalAlpha = Math.max(0, Math.min(1, p.life));
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, 3, 0, 7); c.fill();
    }
    c.globalAlpha = 1;
    if (r.showGhost) this.drawGhost(r, q);
  }

  private drawPieceAt(p: Piece, x: number, y: number, size: number, q: number): void {
    const img = this.sprites.piece(p, size, q);
    const w = size * 1.2;
    this.ctx.drawImage(img, x - w / 2, y - w / 2, w, w);
  }

  private drawBeltItems(game: Game, belts: Belt[], q: number, x0: number, y0: number, x1: number, y1: number): void {
    const paths = new Set(belts.map((b) => b.path).filter((p) => p !== null));
    for (const path of paths) {
      game.belts.forEachItem(path, (it, belt, t) => {
        if (belt.x < x0 || belt.x > x1 || belt.y < y0 || belt.y > y1) return;
        const inW = it.side !== -1 && it.sideTile === belt.index ? it.side : belt.inSide;
        const [x, y] = bezier(trackPoints((belt.x + 0.5) * TS, (belt.y + 0.5) * TS, TS, inW, belt.rot), t);
        this.drawPieceAt(it.piece, x, y, ITEM, q);
      });
    }
  }

  /** Niveau intermédiaire : les pièces deviennent des carrés de couleur, dessinés en un lot par couleur. */
  private drawBeltFlows(game: Game, belts: Belt[], x0: number, y0: number, x1: number, y1: number): void {
    const batches = new Map<string, Path2D>();
    const size = TS * 0.34;
    const paths = new Set(belts.map((b) => b.path).filter((p) => p !== null));
    for (const path of paths) {
      game.belts.forEachItem(path, (it, belt, t) => {
        if (belt.x < x0 || belt.x > x1 || belt.y < y0 || belt.y > y1) return;
        const [x, y] = bezier(trackPoints((belt.x + 0.5) * TS, (belt.y + 0.5) * TS, TS, belt.inSide, belt.rot), t);
        const col = [...it.piece].find((ch) => ch !== '-') ?? 'k';
        let batch = batches.get(col);
        if (!batch) batches.set(col, (batch = new Path2D()));
        batch.rect(x - size / 2, y - size / 2, size, size);
      });
    }
    for (const [col, batch] of batches) { this.ctx.fillStyle = colorHex(col); this.ctx.fill(batch); }
  }

  /** Couche pré-rendue d'un bloc (convoyeurs immobiles et machines), refaite seulement si le bloc a changé. */
  private chunkLayer(game: Game, cx: number, cy: number, q: number): HTMLCanvasElement | null {
    const set = game.world.inChunk(cx, cy);
    if (!set) return null;
    const key = chunkKey(cx, cy), version = game.world.chunkVersion(cx, cy);
    const hit = this.layers.get(key);
    if (hit && hit.version === version && hit.q === q) return hit.img;
    if (this.layers.size > 64) this.layers.delete(this.layers.keys().next().value!);
    const img = hit?.img ?? document.createElement('canvas');
    const px = Math.ceil(CHUNK * TS * q);
    img.width = img.height = px;
    const lc = img.getContext('2d')!;
    lc.setTransform(q, 0, 0, q, -cx * CHUNK * TS * q, -cy * CHUNK * TS * q);
    for (const b of set) {
      if (b.type === 'hub') continue;
      const sprite = b.type === 'belt' ? this.sprites.belt(b.inSide, b.rot, 0, q) : this.sprites.machine(b.type, b.rot, b.dep, q);
      lc.drawImage(sprite, b.x * TS, b.y * TS, TS, TS);
    }
    this.layers.delete(key);
    this.layers.set(key, { img, version, q });
    return img;
  }

  private drawMachineItems(m: Machine, q: number): void {
    const cx = (m.x + 0.5) * TS, cy = (m.y + 0.5) * TS, s = TS * 0.34;
    for (let l = 0; l < 4; l++) {
      const p = m.inBuf[l];
      if (p) { const d = turn(l, m.rot); this.drawPieceAt(p, cx + DX[d] * TS * 0.27, cy + DY[d] * TS * 0.27, s, q); }
    }
    if (m.busy && m.pending) {
      const f = Math.min(1, m.t / (DURATIONS[m.type] || 1));
      this.ctx.globalAlpha = 0.3 + 0.7 * f;
      for (const o of m.pending) this.drawPieceAt(o.piece, cx + DX[o.dir] * TS * 0.32 * f, cy + DY[o.dir] * TS * 0.32 * f, s * (0.55 + 0.45 * f), q);
      this.ctx.globalAlpha = 1;
    }
    for (const o of m.outBuf) this.drawPieceAt(o.piece, cx + DX[o.dir] * TS * 0.32, cy + DY[o.dir] * TS * 0.32, s, q);
  }

  private drawHub(game: Game, time: number): void {
    const c = this.ctx, hub = game.world.hub;
    const x = HUB_MIN * TS, y = HUB_MIN * TS, s = HUB_SIZE * TS;
    roundRect(c, x + 4, y + 4, s - 8, s - 8, 20);
    c.fillStyle = '#eee5d4'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#3b3547'; c.stroke();
    if (hub.pulse > 0) {
      c.save(); c.globalAlpha = hub.pulse * 0.5; c.strokeStyle = '#f2c46d'; c.lineWidth = 6;
      c.beginPath(); c.arc(x + s / 2, y + s / 2, s * 0.46 + (1 - hub.pulse) * 14, 0, 7); c.stroke(); c.restore();
    }
    drawRosace(c, x + s / 2, y + s / 2, s * 0.42, rosaceModel(game), time);
  }

  private drawGhost(r: RenderInput, q: number): void {
    const { hover, tool, rot, game } = r;
    if (!hover || tool === 'hand') return;
    const c = this.ctx, { x, y } = hover;
    const cx = (x + 0.5) * TS, cy = (y + 0.5) * TS;
    if (tool === 'erase') {
      const b = game.world.get(x, y);
      c.strokeStyle = '#e0566b'; c.lineWidth = 3;
      if (b && b.type !== 'hub') { roundRect(c, x * TS + 2, y * TS + 2, TS - 4, TS - 4, 8); c.stroke(); }
      else { c.globalAlpha = 0.4; roundRect(c, x * TS + 6, y * TS + 6, TS - 12, TS - 12, 6); c.stroke(); c.globalAlpha = 1; }
      return;
    }
    const ok = game.canPlace(tool, x, y);
    c.save(); c.globalAlpha = 0.6;
    if (tool === 'belt') drawTrack(c, cx, cy, TS, turn(rot, 2), rot, 0);
    else c.drawImage(this.sprites.machine(tool, rot, game.world.deposits.at(x, y), q), x * TS, y * TS, TS, TS);
    c.restore();
    if (tool === 'belt') { c.fillStyle = ACCENT; arrowHead(c, cx + DX[rot] * TS * 0.18, cy + DY[rot] * TS * 0.18, [-Math.PI / 2, 0, Math.PI / 2, Math.PI][rot], TS * 0.14); }
    if (!ok) { c.fillStyle = 'rgba(224,86,107,.28)'; roundRect(c, x * TS + 2, y * TS + 2, TS - 4, TS - 4, 8); c.fill(); }
  }

  private drawDeposits(dep: Deposits, x0: number, y0: number, x1: number, y1: number, zoom: number): void {
    const c = this.ctx;
    for (let cy = chunkCoord(y0); cy <= chunkCoord(y1); cy++) {
      for (let cx = chunkCoord(x0); cx <= chunkCoord(x1); cx++) {
        const img = this.depositChunk(dep, cx, cy);
        if (img) c.drawImage(img, cx * CHUNK * TS, cy * CHUNK * TS, CHUNK * TS, CHUNK * TS);
      }
    }
    if (zoom < 0.55) return;
    // Cristaux de sable, dessinés à la volée de près.
    const byColor = new Map<string, Path2D>();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const col = dep.at(x, y);
        if (!col) continue;
        let path = byColor.get(col);
        if (!path) byColor.set(col, (path = new Path2D()));
        for (let j = 0; j < 3; j++) {
          const u = 0.18 + hash2(x, y, 11 + j) * 0.64, v = 0.18 + hash2(x, y, 23 + j) * 0.64;
          const r = (0.05 + hash2(x, y, 37 + j) * 0.05) * TS, a = hash2(x, y, 51 + j) * Math.PI;
          const px = (x + u) * TS, py = (y + v) * TS;
          path.moveTo(px + Math.cos(a) * r * 1.6, py + Math.sin(a) * r * 1.6);
          path.lineTo(px + Math.cos(a + 1.57) * r, py + Math.sin(a + 1.57) * r);
          path.lineTo(px - Math.cos(a) * r * 1.6, py - Math.sin(a) * r * 1.6);
          path.lineTo(px - Math.cos(a + 1.57) * r, py - Math.sin(a + 1.57) * r);
          path.closePath();
        }
      }
    }
    c.globalAlpha = 0.55;
    for (const [col, path] of byColor) { c.fillStyle = colorHex(col); c.fill(path); }
    c.globalAlpha = 1;
  }

  /** Taches de sable d'un bloc, rendues une fois en basse résolution puis mises en cache. */
  private depositChunk(dep: Deposits, cx: number, cy: number): HTMLCanvasElement | null {
    const key = chunkKey(cx, cy);
    if (this.depChunks.has(key)) return this.depChunks.get(key) ?? null;
    if (this.depChunks.size > 400) this.depChunks.clear();
    const pad = 2, size = CHUNK + pad * 2;
    const tiles = new Map<string, [number, number][]>();
    for (let ty = -pad; ty < CHUNK + pad; ty++) {
      for (let tx = -pad; tx < CHUNK + pad; tx++) {
        const col = dep.at(cx * CHUNK + tx, cy * CHUNK + ty);
        if (!col) continue;
        let list = tiles.get(col);
        if (!list) tiles.set(col, (list = []));
        list.push([tx + pad, ty + pad]);
      }
    }
    if (!tiles.size) { this.depChunks.set(key, null); return null; }
    const out = document.createElement('canvas');
    out.width = out.height = CHUNK * DEP_RES;
    const oc = out.getContext('2d')!;
    for (const [col, list] of tiles) {
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = size * DEP_RES;
      const tc = tmp.getContext('2d')!;
      tc.fillStyle = colorHex(col);
      for (const [tx, ty] of list) { tc.beginPath(); tc.arc((tx + 0.5) * DEP_RES, (ty + 0.5) * DEP_RES, DEP_RES * 0.78, 0, 7); tc.fill(); }
      oc.globalAlpha = 0.22;
      oc.filter = `blur(${DEP_RES * 0.45}px)`;
      oc.drawImage(tmp, -pad * DEP_RES, -pad * DEP_RES);
      oc.filter = 'none';
    }
    this.depChunks.set(key, out);
    return out;
  }
}

export function rosaceModel(game: Game): RosaceModel {
  const p = game.progress;
  return {
    count: ROSACE_SIZE,
    current: p.orderIndex,
    fraction: (i) => p.fraction(i),
    piece: (i) => orderAt(i, game.seed).piece,
  };
}
