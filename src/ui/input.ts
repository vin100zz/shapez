import type { App } from './app';

type Drag =
  | { mode: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { mode: 'build'; last: { x: number; y: number } }
  | { mode: 'erase' };

/** Souris, tactile et clavier. */
export class Input {
  readonly keys = new Set<string>();
  private drag: Drag | null = null;
  private pinch: { d: number; z: number; mx: number; my: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private spaceDown = false;

  constructor(private readonly app: App, private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', () => { app.hover = null; app.hud.tip(0, 0, null); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      app.camera.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.spaceDown = false;
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.spaceDown = false; });
  }

  get panning(): boolean {
    return this.drag?.mode === 'pan';
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.finishDrag();
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.app.camera.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    const tile = this.app.camera.tileAt(e.clientX, e.clientY);
    const app = this.app;
    if (e.button === 1 || (e.button === 0 && (app.tool === 'hand' || this.spaceDown))) {
      this.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: app.camera.x, cy: app.camera.y };
      this.canvas.style.cursor = 'grabbing';
    } else if (e.button === 2 || app.tool === 'erase') {
      this.drag = { mode: 'erase' };
      app.history.begin();
      app.eraseAt(tile.x, tile.y);
    } else if (e.button === 0) {
      this.drag = { mode: 'build', last: tile };
      app.history.begin();
      app.buildAt(tile.x, tile.y);
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const app = this.app;
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      app.camera.x -= (mx - this.pinch.mx) / app.camera.z;
      app.camera.y -= (my - this.pinch.my) / app.camera.z;
      this.pinch.mx = mx; this.pinch.my = my;
      const target = (this.pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.d;
      app.camera.zoomAt(mx, my, target / app.camera.z);
      return;
    }
    const tile = app.camera.tileAt(e.clientX, e.clientY);
    app.hover = tile;
    const d = this.drag;
    if (d?.mode === 'pan') {
      app.camera.x = d.cx - (e.clientX - d.sx) / app.camera.z;
      app.camera.y = d.cy - (e.clientY - d.sy) / app.camera.z;
    } else if (d?.mode === 'erase') {
      app.eraseAt(tile.x, tile.y);
    } else if (d?.mode === 'build' && (tile.x !== d.last.x || tile.y !== d.last.y)) {
      d.last = app.tool === 'belt' ? app.beltTo(d.last, tile) : (app.buildAt(tile.x, tile.y), tile);
    }
    app.updateTip(e.clientX, e.clientY, !!d);
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.finishDrag();
  };

  private finishDrag(): void {
    if (this.drag && this.drag.mode !== 'pan') this.app.history.end();
    this.drag = null;
    this.canvas.style.cursor = this.app.tool === 'hand' ? 'grab' : 'crosshair';
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    const app = this.app;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
    if (app.modalOpen()) {
      if (e.key === 'Escape') app.closeModals();
      return;
    }
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) app.redo(); else app.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); app.redo(); return; }
    if (mod) return;
    if (app.selectToolByKey(k)) return;
    switch (k) {
      case 'r': app.rotate(e.shiftKey ? -1 : 1); break;
      case 'escape': app.selectTool('hand'); break;
      case 'h': app.toggleZen(); break;
      case 'p': app.togglePause(); break;
      case 'c': app.centerOnHub(); break;
      case 'f3': e.preventDefault(); app.showStats = !app.showStats; break;
      case ' ': this.spaceDown = true; e.preventDefault(); break;
      case '+': case '=': app.camera.zoomAt(app.camera.viewW / 2, app.camera.viewH / 2, 1.15); break;
      case '-': app.camera.zoomAt(app.camera.viewW / 2, app.camera.viewH / 2, 1 / 1.15); break;
      default: this.keys.add(k);
    }
  };
}
