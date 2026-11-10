import type { MachineType } from '../core/defs';
import { PORTS } from '../core/defs';
import { DX, DY, type Dir } from '../core/geometry';
import { COLORS, type Color, type Piece } from '../core/piece';

/** Taille d'une case en unités monde. */
export const TS = 40;
export const INK = '#3b3547';
export const ACCENT = '#c98a4b';
const LV: readonly [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const BODY: Readonly<Record<MachineType, string>> = {
  extractor: '#fff3dc', cutter: '#fdecef', rotator: '#eaf1fd', assembler: '#e8f7ee', splitter: '#f1ecfb', trash: '#ebe8ef',
};

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const colorHex = (c: string): string => COLORS[c as Color]?.hex ?? '#ccc';

export function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function arrowHead(c: Ctx, x: number, y: number, ang: number, sz: number): void {
  c.beginPath();
  c.moveTo(x + Math.cos(ang) * sz, y + Math.sin(ang) * sz);
  c.lineTo(x + Math.cos(ang + 2.4) * sz, y + Math.sin(ang + 2.4) * sz);
  c.lineTo(x + Math.cos(ang - 2.4) * sz, y + Math.sin(ang - 2.4) * sz);
  c.closePath();
  c.fill();
}

/** Pièce de verre : quatre triangles teintés, reflets, baguettes de plomb. */
export function drawPiece(c: Ctx, p: Piece, x: number, y: number, s: number): void {
  const h = s / 2;
  const P: [number, number][] = [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
  const lw = Math.max(0.8, s * 0.08);
  c.lineJoin = 'round';
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4];
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(x, y); c.closePath();
    if (p[i] === '-') { c.strokeStyle = 'rgba(59,53,71,.22)'; c.lineWidth = lw * 0.5; c.stroke(); continue; }
    c.fillStyle = colorHex(p[i]);
    c.fill();
  }
  for (let i = 0; i < 4; i++) {
    if (p[i] === '-') continue;
    const a = P[i], b = P[(i + 1) % 4];
    const ax = a[0] + (x - a[0]) * 0.24, ay = a[1] + (y - a[1]) * 0.24, bx = b[0] + (x - b[0]) * 0.24, by = b[1] + (y - b[1]) * 0.24;
    c.beginPath(); c.moveTo(ax + (bx - ax) * 0.2, ay + (by - ay) * 0.2); c.lineTo(ax + (bx - ax) * 0.55, ay + (by - ay) * 0.55);
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = lw * 0.7; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(x, y); c.closePath();
    c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
  }
}

/** Corps d'une machine dans son repère local (avant = haut), centré sur l'origine. Sans parties animées. */
export function drawMachineBody(c: Ctx, type: MachineType, s: number, dep: Color | null): void {
  const h = s / 2, m = s * 0.08;
  roundRect(c, -h + m, -h + m, s - 2 * m, s - 2 * m, s * 0.18);
  c.fillStyle = BODY[type]; c.fill(); c.lineWidth = s * 0.05; c.strokeStyle = INK; c.stroke();
  const ports = PORTS[type];
  for (const l of ports.inputs) {
    const [vx, vy] = LV[l];
    c.fillStyle = '#a79fb6';
    const len = s * 0.28, th = s * 0.07;
    if (vx === 0) c.fillRect(-len / 2, vy * (h - m) - th / 2, len, th);
    else c.fillRect(vx * (h - m) - th / 2, -len / 2, th, len);
  }
  for (const l of ports.outputs) {
    const [vx, vy] = LV[l], nx = -vy, ny = vx, bc = h - m - s * 0.05, tip = h - s * 0.005, w = s * 0.13;
    c.beginPath(); c.moveTo(vx * bc + nx * w, vy * bc + ny * w); c.lineTo(vx * tip, vy * tip); c.lineTo(vx * bc - nx * w, vy * bc - ny * w); c.closePath();
    c.fillStyle = ACCENT; c.fill();
  }
  c.lineCap = 'round'; c.lineJoin = 'round';
  switch (type) {
    case 'extractor':
      c.beginPath(); c.arc(0, 0, s * 0.25, 0, 7); c.fillStyle = dep ? colorHex(dep) : '#ccc'; c.fill();
      c.lineWidth = s * 0.045; c.strokeStyle = INK; c.stroke();
      break;
    case 'cutter':
      c.beginPath(); c.moveTo(-h + m, -h + m); c.lineTo(h - m, -h + m); c.lineTo(h - m, h - m); c.closePath(); c.fillStyle = 'rgba(201,138,75,.13)'; c.fill();
      c.beginPath(); c.moveTo(-h + m * 2.3, -h + m * 2.3); c.lineTo(h - m * 2.3, h - m * 2.3); c.strokeStyle = ACCENT; c.lineWidth = s * 0.085; c.stroke();
      c.beginPath(); c.arc(0, 0, s * 0.07, 0, 7); c.fillStyle = INK; c.fill();
      break;
    case 'rotator':
      c.beginPath(); c.arc(0, 0, s * 0.2, -2.6, 1.9); c.strokeStyle = INK; c.lineWidth = s * 0.07; c.stroke();
      c.fillStyle = INK; arrowHead(c, Math.cos(1.9) * s * 0.2, Math.sin(1.9) * s * 0.2, 1.9 + Math.PI / 2, s * 0.11);
      break;
    case 'assembler':
      c.strokeStyle = INK; c.lineWidth = s * 0.04;
      c.fillStyle = '#38a878'; c.beginPath(); c.moveTo(-s * 0.3, -s * 0.17); c.lineTo(-s * 0.04, 0); c.lineTo(-s * 0.3, s * 0.17); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#f4b942'; c.beginPath(); c.moveTo(s * 0.3, -s * 0.17); c.lineTo(s * 0.04, 0); c.lineTo(s * 0.3, s * 0.17); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = INK; arrowHead(c, 0, -s * 0.2, -Math.PI / 2, s * 0.08);
      break;
    case 'splitter':
      c.strokeStyle = INK; c.lineWidth = s * 0.06; c.beginPath();
      c.moveTo(0, s * 0.26); c.lineTo(0, -s * 0.14); c.moveTo(0, 0); c.lineTo(-s * 0.18, 0); c.moveTo(0, 0); c.lineTo(s * 0.18, 0); c.stroke();
      c.fillStyle = INK; arrowHead(c, 0, -s * 0.2, -Math.PI / 2, s * 0.08); arrowHead(c, -s * 0.22, 0, Math.PI, s * 0.08); arrowHead(c, s * 0.22, 0, 0, s * 0.08);
      break;
    case 'trash':
      c.beginPath(); c.arc(0, 0, s * 0.24, 0, 7); c.fillStyle = '#5b5468'; c.fill();
      break;
  }
}

/** Parties animées d'une machine (repère monde, non tourné). */
export function drawMachineAnim(c: Ctx, type: MachineType, cx: number, cy: number, s: number, anim: number): void {
  if (type === 'extractor') {
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = s * 0.05; c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = anim * 4 + i * 2.094;
      c.moveTo(cx + Math.cos(a) * s * 0.05, cy + Math.sin(a) * s * 0.05);
      c.lineTo(cx + Math.cos(a) * s * 0.19, cy + Math.sin(a) * s * 0.19);
    }
    c.stroke();
  } else if (type === 'trash') {
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = s * 0.045; c.lineCap = 'round';
    const a = -anim * 6;
    c.beginPath(); c.arc(cx, cy, s * 0.13, a, a + 4.2); c.stroke();
  }
}

/** Points de contrôle (entrée, centre, sortie) du tracé d'une case de convoyeur. */
export function trackPoints(cx: number, cy: number, s: number, inW: Dir, outW: Dir): number[] {
  const h = s / 2;
  const iw = inW === outW ? ((outW + 2) % 4) : inW;
  return [cx + DX[iw] * h, cy + DY[iw] * h, cx, cy, cx + DX[outW] * h, cy + DY[outW] * h];
}

export function bezier(p: number[], t: number): [number, number] {
  const u = 1 - t;
  return [u * u * p[0] + 2 * u * t * p[2] + t * t * p[4], u * u * p[1] + 2 * u * t * p[3] + t * t * p[5]];
}

/** Case de convoyeur ; `phase` ∈ [0, 0,5) décale les chevrons pour l'animation. */
export function drawTrack(c: Ctx, cx: number, cy: number, s: number, inW: Dir, outW: Dir, phase: number): void {
  const p = trackPoints(cx, cy, s, inW, outW);
  c.lineCap = 'butt';
  c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(p[2], p[3], p[4], p[5]);
  c.strokeStyle = '#d3c6b1'; c.lineWidth = s * 0.72; c.stroke();
  c.strokeStyle = '#ebe2d3'; c.lineWidth = s * 0.54; c.stroke();
  c.strokeStyle = '#cbbca5'; c.lineWidth = s * 0.065; c.lineCap = 'round'; c.lineJoin = 'round';
  for (let j = 0; j < 2; j++) {
    const t = phase + j * 0.5;
    const [x, y] = bezier(p, t);
    const tx = 2 * (1 - t) * (p[2] - p[0]) + 2 * t * (p[4] - p[2]);
    const ty = 2 * (1 - t) * (p[3] - p[1]) + 2 * t * (p[5] - p[3]);
    const L = Math.hypot(tx, ty) || 1, ux = tx / L, uy = ty / L, nx = -uy, ny = ux, a = s * 0.07, w = s * 0.13;
    c.beginPath(); c.moveTo(x - ux * a + nx * w, y - uy * a + ny * w); c.lineTo(x + ux * a, y + uy * a); c.lineTo(x - ux * a - nx * w, y - uy * a - ny * w); c.stroke();
  }
}

/** Géométrie des médaillons : 6 pétales, un cœur, puis 12 médaillons au second anneau. */
export function medallion(i: number, R: number): { x: number; y: number; r: number } {
  if (i < 6) { const a = -Math.PI / 2 + (i * Math.PI) / 3; return { x: Math.cos(a) * R * 0.5, y: Math.sin(a) * R * 0.5, r: R * 0.2 }; }
  if (i === 6) return { x: 0, y: 0, r: R * 0.22 };
  const a = -Math.PI / 2 + ((i - 7 + 0.5) * Math.PI) / 6;
  return { x: Math.cos(a) * R * 0.84, y: Math.sin(a) * R * 0.84, r: R * 0.115 };
}

export interface RosaceModel { count: number; current: number; fraction(i: number): number; piece(i: number): Piece }

export function drawRosace(c: Ctx, cx: number, cy: number, R: number, model: RosaceModel, time: number): void {
  c.save(); c.translate(cx, cy);
  c.beginPath(); c.arc(0, 0, R, 0, 7); c.fillStyle = '#2f2a3b'; c.fill();
  c.lineWidth = R * 0.07; c.strokeStyle = '#d8ccb6'; c.stroke();
  c.lineWidth = Math.max(1, R * 0.018); c.strokeStyle = INK; c.beginPath(); c.arc(0, 0, R * 1.035, 0, 7); c.stroke();
  c.strokeStyle = '#4d4660'; c.lineWidth = R * 0.03;
  c.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 6;
    c.moveTo(Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22); c.lineTo(Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97);
  }
  c.stroke();
  c.beginPath(); c.arc(0, 0, R * 0.7, 0, 7); c.stroke();
  for (let i = 0; i < model.count; i++) {
    const g = medallion(i, R), f = model.fraction(i), k = model.piece(i), s = g.r * 1.5;
    c.save(); c.beginPath(); c.arc(g.x, g.y, g.r, 0, 7); c.fillStyle = f >= 1 ? '#fbf2df' : '#3c3650'; c.fill(); c.clip();
    c.globalAlpha = 0.3; drawPiece(c, k, g.x, g.y, s); c.globalAlpha = 1;
    if (f > 0) {
      c.beginPath(); c.moveTo(g.x, g.y); c.arc(g.x, g.y, g.r * 1.3, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); c.closePath(); c.clip();
      c.fillStyle = '#fbf2df'; c.fillRect(g.x - g.r, g.y - g.r, 2 * g.r, 2 * g.r); drawPiece(c, k, g.x, g.y, s);
    }
    c.restore();
    const cur = i === model.current;
    c.beginPath(); c.arc(g.x, g.y, g.r, 0, 7); c.lineWidth = Math.max(1, g.r * 0.13); c.strokeStyle = cur ? '#f2c46d' : '#1f1b28'; c.stroke();
    if (cur) {
      c.globalAlpha = 0.35 + 0.3 * Math.sin(time * 3); c.lineWidth = Math.max(1, g.r * 0.1);
      c.beginPath(); c.arc(g.x, g.y, g.r * 1.22, 0, 7); c.stroke(); c.globalAlpha = 1;
    }
  }
  c.restore();
}
