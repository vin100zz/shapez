import { TOOL_INFO, TOOL_TYPES } from '../core/defs';
import type { Game } from '../core/game';
import { describePiece } from '../core/piece';
import { RING1, ROSACE_SIZE, unlockedBy } from '../core/progress';
import { arrowHead, drawMachineBody, drawPiece, drawRosace, drawTrack, INK, roundRect } from '../render/draw';
import { rosaceModel, type ToolId } from '../render/renderer';

export interface ToolEntry { id: ToolId; key: string; name: string; desc: string }

export const TOOLBAR: readonly ToolEntry[] = [
  { id: 'hand', key: 'Q', name: 'Observer', desc: 'Glissez pour déplacer la vue, molette pour zoomer. Survolez une machine pour voir son état.' },
  ...TOOL_TYPES.map((t, i): ToolEntry => ({ id: t, key: String(i + 1), name: TOOL_INFO[t].name, desc: TOOL_INFO[t].desc })),
  { id: 'erase', key: 'X', name: 'Gomme', desc: 'Cliquez-glissez pour retirer des bâtiments (le clic droit marche aussi, avec n\'importe quel outil).' },
];

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Message expliquant pourquoi un outil est verrouillé. */
export function lockReason(id: ToolId): string {
  if (id === 'hand' || id === 'erase') return '';
  const i = unlockedBy(id);
  return i === null ? '' : `Débloqué par le médaillon ${i + 1} « ${RING1[i].title} ».`;
}

export class Hud {
  private readonly buttons = new Map<ToolId, HTMLButtonElement>();
  private lastOrderKey = '';
  private toastTimer = 0;
  private readonly rosCtx = $<HTMLCanvasElement>('rosCv').getContext('2d')!;
  private readonly iconCtx = $<HTMLCanvasElement>('ordIcon').getContext('2d')!;

  constructor(onSelect: (id: ToolId) => void) {
    const box = $('tools');
    for (const t of TOOLBAR) {
      const el = document.createElement('button');
      el.className = 'tool';
      el.dataset.id = t.id;
      const k = document.createElement('span'); k.className = 'k'; k.textContent = t.key;
      const lock = document.createElement('span'); lock.className = 'lock';
      const ic = document.createElement('canvas'); ic.width = ic.height = 76;
      const l = document.createElement('span'); l.className = 'l'; l.textContent = t.name;
      el.append(k, lock, ic, l);
      el.addEventListener('click', () => onSelect(t.id));
      box.append(el);
      this.buttons.set(t.id, el);
      drawToolIcon(ic.getContext('2d')!, t.id);
    }
  }

  updateToolbar(game: Game, selected: ToolId): void {
    for (const [id, el] of this.buttons) {
      const locked = id !== 'hand' && id !== 'erase' && !game.progress.isUnlocked(id);
      el.classList.toggle('sel', id === selected);
      el.classList.toggle('locked', locked);
      (el.querySelector('.lock') as HTMLElement).textContent = locked ? `M${(unlockedBy(id as never) ?? 0) + 1}` : '';
      const entry = TOOLBAR.find((t) => t.id === id)!;
      el.title = locked ? `${entry.name} : ${lockReason(id)}` : `${entry.name} (${entry.key})`;
      el.setAttribute('aria-pressed', String(id === selected));
    }
  }

  updateOrder(game: Game, ratePerSecond: number): void {
    const p = game.progress, o = p.order;
    const key = `${p.orderIndex}:${p.orderCount}:${game.seed}`;
    if (key !== this.lastOrderKey) {
      this.lastOrderKey = key;
      const i = p.orderIndex;
      $('ordT').textContent = i < RING1.length ? `Médaillon ${i + 1} / ${RING1.length} · premier anneau` : i < ROSACE_SIZE ? `Médaillon ${i - RING1.length + 1} / ${ROSACE_SIZE - RING1.length} · second anneau` : 'Commande libre';
      $('ordN').textContent = o.title;
      $('ordD').textContent = describePiece(o.piece);
      $('ordBar').style.width = `${(100 * p.orderCount) / o.count}%`;
      $('ordP').textContent = `${p.orderCount} / ${o.count} livrées`;
      $('ordH').textContent = o.hint + (o.unlock ? ` Récompense : ${o.unlock.label}.` : '');
      const c = this.iconCtx;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 120, 120);
      roundRect(c, 4, 4, 112, 112, 18); c.fillStyle = '#2f2a3b'; c.fill();
      drawPiece(c, o.piece, 60, 60, 66);
      $('rosC').textContent = i < RING1.length ? `Premier anneau : ${i} / ${RING1.length} médaillons` : i < ROSACE_SIZE ? `Second anneau : ${i - RING1.length} / ${ROSACE_SIZE - RING1.length}` : 'Rosace achevée';
    }
    $('ordR').textContent = `${ratePerSecond.toFixed(1).replace('.', ',')} / s`;
  }

  drawRosacePanel(game: Game, time: number): void {
    const c = this.rosCtx, w = c.canvas.width;
    c.setTransform(w / 180, 0, 0, w / 180, 0, 0);
    c.clearRect(0, 0, 180, 180);
    drawRosace(c, 90, 90, 84, rosaceModel(game), time);
  }

  forceRefresh(): void {
    this.lastOrderKey = '';
  }

  setInfo(text: string): void {
    $('info').textContent = text;
  }

  toast(msg: string, ms = 3200): void {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
  }

  tip(sx: number, sy: number, html: string | null): void {
    const tip = $('tip');
    if (!html) { tip.style.display = 'none'; return; }
    tip.innerHTML = html;
    tip.style.display = 'block';
    tip.style.left = `${Math.min(sx + 16, window.innerWidth - 290)}px`;
    tip.style.top = `${sy + 14}px`;
  }

  stats(text: string | null): void {
    const s = $('stats');
    s.style.display = text ? 'block' : 'none';
    if (text) s.textContent = text;
  }
}

function drawToolIcon(c: CanvasRenderingContext2D, id: ToolId): void {
  c.scale(76 / 40, 76 / 40);
  c.translate(20, 20);
  if (id === 'belt') { drawTrack(c, 0, 0, 34, 2, 0, 0.1); drawPiece(c, 'rrbb', 0, 0, 13); return; }
  if (id === 'hand') {
    c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -12); c.lineTo(0, 12); c.moveTo(-12, 0); c.lineTo(12, 0); c.stroke();
    arrowHead(c, 0, -13, -Math.PI / 2, 4.5); arrowHead(c, 0, 13, Math.PI / 2, 4.5); arrowHead(c, -13, 0, Math.PI, 4.5); arrowHead(c, 13, 0, 0, 4.5);
    return;
  }
  if (id === 'erase') {
    roundRect(c, -12, -12, 24, 24, 6); c.fillStyle = '#fdecef'; c.fill(); c.strokeStyle = '#e0566b'; c.lineWidth = 2.4; c.stroke();
    c.beginPath(); c.moveTo(-6, -6); c.lineTo(6, 6); c.moveTo(6, -6); c.lineTo(-6, 6); c.stroke();
    return;
  }
  drawMachineBody(c, id, 34, 'r');
}
