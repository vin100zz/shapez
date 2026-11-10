import { HUB_MIN, HUB_SIZE, TICK_DT, TOOL_INFO, type ToolType } from '../core/defs';
import { Game } from '../core/game';
import type { Dir } from '../core/geometry';
import { History } from '../core/history';
import { COLORS, describePiece, type Color } from '../core/piece';
import { decodeSave, encodeSave, SaveError, serialize, type Camera as SavedCamera } from '../core/save';
import { buildDemo } from '../core/scenarios';
import { Camera } from '../render/camera';
import { TS } from '../render/draw';
import { Renderer, type Particle, type ToolId } from '../render/renderer';
import { Chime } from './audio';
import { Hud, lockReason, TOOLBAR } from './hud';
import { Input } from './input';

const STORAGE_KEY = 'rosace.partie.v1';
const SPEEDS = [1, 2, 4];
const AUTOSAVE_EVERY = 30; // secondes
const DIR_NAMES = ['haut', 'droite', 'bas', 'gauche'];

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Relie la simulation, le rendu, l'interface et les sauvegardes. */
export class App {
  game!: Game;
  readonly camera = new Camera();
  readonly history = new History();
  readonly hud: Hud;
  readonly chime = new Chime();
  tool: ToolId = 'hand';
  rot: Dir = 1;
  hover: { x: number; y: number } | null = null;
  showStats = false;
  private readonly renderer: Renderer;
  private readonly input: Input;
  private paused = false;
  private speedIndex = 0;
  private particles: Particle[] = [];
  private matchTimes: number[] = [];
  private acc = 0;
  private last = performance.now();
  private realTime = 0;
  private sinceSave = 0;
  private frameMs = 0;
  private simMs = 0;
  private confirmAction: (() => void) | null = null;

  constructor() {
    const canvas = $<HTMLCanvasElement>('game');
    this.renderer = new Renderer(canvas);
    this.hud = new Hud((id) => this.selectTool(id));
    this.input = new Input(this, canvas);
    this.bindButtons();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());

    const stored = this.readStorage();
    let resumed = false;
    if (stored) {
      try {
        const { game, camera } = decodeSave(stored);
        this.setGame(game, camera);
        resumed = true;
        this.hud.toast('Partie reprise là où vous l\'aviez laissée', 2600);
      } catch (err) {
        this.hud.toast(err instanceof SaveError ? err.message : 'Sauvegarde illisible : nouvelle partie.', 5000);
      }
    }
    if (!resumed) this.newGame();
    requestAnimationFrame(this.loop);
  }

  /* ---------- Parties ---------- */

  private setGame(game: Game, camera?: SavedCamera): void {
    this.game = game;
    game.events = {
      onDeliver: (piece, matched, x, y, side) => {
        if (!matched) return;
        this.matchTimes.push(game.ticks * TICK_DT);
        this.spark((x + 0.5 + [0, 0.5, 0, -0.5][side]) * TS, (y + 0.5 + [-0.5, 0, 0.5, 0][side]) * TS, piece, 5, 0.7);
        this.chime.delivery(game.progress.fraction(game.progress.orderIndex));
      },
      onOrderComplete: (order) => {
        this.hud.toast(`Médaillon « ${order.title} » serti${order.unlock ? ` : ${order.unlock.label}` : ''}`, 4200);
        this.chime.complete();
        const c = (HUB_MIN + HUB_SIZE / 2) * TS;
        this.spark(c, c, order.piece, 40, 1.4, 90);
        this.hud.forceRefresh();
      },
    };
    this.history.clear();
    this.renderer.resetWorld();
    this.particles = [];
    this.matchTimes = [];
    this.hud.forceRefresh();
    if (camera) Object.assign(this.camera, { x: camera.x, y: camera.y, z: camera.z });
    else this.centerOnHub(true);
    const wanted = this.tool;
    this.tool = 'hand';
    this.selectTool(wanted, true); // reste sur « Observer » si l'outil est verrouillé dans cette partie
    if (this.tool === 'hand') this.selectTool('hand', true);
  }

  newGame(): void {
    this.setGame(new Game(Math.floor(Math.random() * 1e9)));
    this.selectTool('extractor', true);
    this.hud.toast('Posez un Extracteur (2) sur le sable rubis, puis tracez des convoyeurs (1) jusqu\'à la rosace.', 6000);
    this.save();
  }

  loadDemo(): void {
    const g = new Game(1);
    buildDemo(g);
    this.setGame(g);
    this.hud.toast('Usine de démonstration : elle sertit seule les médaillons 3 et 4.', 4200);
  }

  /* ---------- Outils et construction ---------- */

  selectTool(id: ToolId, silent = false): void {
    if (id !== 'hand' && id !== 'erase' && !this.game.progress.isUnlocked(id)) {
      if (!silent) this.hud.toast(`${TOOL_INFO[id].name} : ${lockReason(id).toLowerCase()}`, 2600);
      return;
    }
    this.tool = id;
    const entry = TOOLBAR.find((t) => t.id === id)!;
    const orient = id === 'hand' || id === 'erase' ? '' : ` Orientation : ${DIR_NAMES[this.rot]} (R pour pivoter).`;
    this.hud.setInfo(`${entry.name} : ${entry.desc}${orient}`);
    this.hud.updateToolbar(this.game, id);
    $('game').style.cursor = id === 'hand' ? 'grab' : 'crosshair';
  }

  selectToolByKey(key: string): boolean {
    const t = TOOLBAR.find((e) => e.key.toLowerCase() === key);
    if (!t) return false;
    this.selectTool(t.id);
    return true;
  }

  rotate(delta: number): void {
    this.rot = ((this.rot + delta + 4) % 4) as Dir;
    this.selectTool(this.tool, true);
  }

  buildAt(x: number, y: number): void {
    if (this.tool === 'hand' || this.tool === 'erase') return;
    const tool: ToolType = this.tool;
    if (tool === 'belt') {
      const e = this.game.world.get(x, y);
      if (e && e.type !== 'belt') return; // un tracé ne remplace jamais une machine
    }
    this.history.record(this.game.place(tool, x, y, this.rot));
  }

  /** Prolonge un tracé de convoyeur jusqu'à la case visée ; chaque convoyeur pointe vers le suivant. */
  beltTo(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
    let { x, y } = from;
    for (let guard = 0; (x !== to.x || y !== to.y) && guard < 400; guard++) {
      const d: Dir = x !== to.x ? (to.x > x ? 1 : 3) : to.y > y ? 2 : 0;
      if (this.game.world.get(x, y)?.type === 'belt') this.history.record(this.game.place('belt', x, y, d));
      x += [0, 1, 0, -1][d];
      y += [-1, 0, 1, 0][d];
      this.rot = d;
      const e = this.game.world.get(x, y);
      if (!e || e.type === 'belt') this.history.record(this.game.place('belt', x, y, d));
    }
    this.selectTool(this.tool, true);
    return { x, y };
  }

  eraseAt(x: number, y: number): void {
    this.history.record(this.game.remove(x, y));
  }

  undo(): void {
    if (this.history.undo(this.game)) this.hud.toast('Action annulée', 1200);
  }

  redo(): void {
    if (this.history.redo(this.game)) this.hud.toast('Action rétablie', 1200);
  }

  /* ---------- Vue ---------- */

  centerOnHub(fit = false): void {
    const c = (HUB_MIN + HUB_SIZE / 2) * TS;
    this.camera.x = c;
    this.camera.y = c;
    if (fit) this.camera.z = Math.max(0.5, Math.min(1.3, Math.min(this.camera.viewW / (30 * TS), this.camera.viewH / (19 * TS))));
  }

  togglePause(): void {
    this.paused = !this.paused;
    const b = $('bPause');
    b.classList.toggle('on', this.paused);
    b.textContent = this.paused ? 'Reprendre' : 'Pause';
  }

  toggleZen(): void {
    const on = document.body.classList.toggle('zen');
    if (on) this.hud.toast('Mode contemplation : H pour revenir', 2200);
  }

  updateTip(sx: number, sy: number, dragging: boolean): void {
    const t = this.hover;
    const b = t && this.game.world.get(t.x, t.y);
    if (!b || dragging || this.tool !== 'hand') { this.hud.tip(0, 0, null); return; }
    let html: string;
    if (b.type === 'hub') html = `<b>Rosace</b><br>Reçoit toutes les pièces ; seules celles de la commande comptent. Livrées : ${this.game.progress.delivered}.`;
    else if (b.type === 'belt') html = `<b>Convoyeur</b>`;
    else {
      const state = b.type === 'trash' ? '' : b.outBuf.length ? ' · sortie bloquée' : b.busy ? ' · au travail' : ' · en attente';
      const dep = b.type === 'extractor' && b.dep ? ` (${COLORS[b.dep as Color].name})` : '';
      const out = b.pending?.[0] ?? b.outBuf[0];
      html = `<b>${TOOL_INFO[b.type].name}${dep}</b>${state}${out ? `<br>${describePiece(out.piece)}` : ''}`;
    }
    this.hud.tip(sx, sy, html);
  }

  /* ---------- Sauvegardes ---------- */

  private readStorage(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  private saveText(): string {
    return encodeSave(serialize(this.game, { x: this.camera.x, y: this.camera.y, z: this.camera.z }));
  }

  save(): boolean {
    this.sinceSave = 0;
    try {
      localStorage.setItem(STORAGE_KEY, this.saveText());
      return true;
    } catch {
      return false;
    }
  }

  private loadText(text: string): void {
    try {
      const { game, camera } = decodeSave(text.trim());
      this.setGame(game, camera);
      this.closeModals();
      this.save();
      this.hud.toast('Partie chargée', 2000);
    } catch (err) {
      this.hud.toast(err instanceof SaveError ? err.message : 'Impossible de charger cette partie.', 4500);
    }
  }

  /* ---------- Fenêtres ---------- */

  modalOpen(): boolean {
    return !!document.querySelector('.modal.show');
  }

  closeModals(): void {
    document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'));
    (document.activeElement as HTMLElement | null)?.blur();
  }

  private ask(text: string, action: () => void): void {
    $('confirmText').textContent = text;
    this.confirmAction = action;
    $('confirm').classList.add('show');
    $('confirmYes').focus();
  }

  private openMenu(): void {
    const p = this.game.progress;
    $('saveInfo').textContent = `Sauvegarde automatique dans ce navigateur toutes les ${AUTOSAVE_EVERY} s. Partie en cours : ${this.game.world.count} bâtiments, médaillon ${p.orderIndex + 1}, ${p.delivered} pièces livrées.`;
    $<HTMLInputElement>('mSandbox').checked = p.sandbox;
    $<HTMLTextAreaElement>('mCode').value = '';
    $('menu').classList.add('show');
  }

  private bindButtons(): void {
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', fn);
    on('bUndo', () => this.undo());
    on('bRedo', () => this.redo());
    on('bPause', () => this.togglePause());
    on('bSpeed', () => { this.speedIndex = (this.speedIndex + 1) % SPEEDS.length; $('bSpeed').textContent = `Vitesse ×${SPEEDS[this.speedIndex]}`; });
    on('bSound', () => { const s = this.chime.toggle(); $('bSound').textContent = `Son : ${s ? 'oui' : 'non'}`; $('bSound').classList.toggle('on', s); });
    on('bHelp', () => $('help').classList.add('show'));
    on('helpClose', () => this.closeModals());
    on('bMenu', () => this.openMenu());
    on('mClose', () => this.closeModals());
    on('mSave', () => this.hud.toast(this.save() ? 'Partie sauvegardée dans ce navigateur' : 'Sauvegarde impossible (stockage du navigateur indisponible)', 2600));
    on('mExport', () => {
      const blob = new Blob([this.saveText()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `rosace-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $<HTMLInputElement>('mImport').addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.loadText(await file.text());
      (e.target as HTMLInputElement).value = '';
    });
    on('mCopy', async () => {
      const text = this.saveText();
      const area = $<HTMLTextAreaElement>('mCode');
      try {
        await navigator.clipboard.writeText(text);
        this.hud.toast('Code de la partie copié', 2000);
      } catch {
        area.value = text;
        area.select();
        this.hud.toast('Copie automatique refusée : le code est sélectionné dans le menu', 3500);
      }
    });
    on('mLoadCode', () => {
      const text = $<HTMLTextAreaElement>('mCode').value;
      if (text.trim()) this.ask('Charger ce code ? La partie en cours sera remplacée.', () => this.loadText(text));
    });
    on('mNew', () => this.ask('Commencer une nouvelle partie ? La partie en cours sera remplacée (exportez-la d\'abord pour la garder).', () => { this.closeModals(); this.newGame(); }));
    on('mDemo', () => this.ask('Charger l\'usine de démonstration ? La partie en cours sera remplacée.', () => { this.closeModals(); this.loadDemo(); }));
    $<HTMLInputElement>('mSandbox').addEventListener('change', (e) => {
      this.game.progress.sandbox = (e.target as HTMLInputElement).checked;
      this.hud.updateToolbar(this.game, this.tool);
    });
    on('confirmNo', () => $('confirm').classList.remove('show'));
    on('confirmYes', () => { $('confirm').classList.remove('show'); const a = this.confirmAction; this.confirmAction = null; a?.(); });
    document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); }));
  }

  /* ---------- Boucle ---------- */

  private resize(): void {
    this.camera.viewW = window.innerWidth;
    this.camera.viewH = window.innerHeight;
    this.renderer.resize(window.innerWidth, window.innerHeight, Math.min(2, window.devicePixelRatio || 1));
  }

  private spark(x: number, y: number, piece: string, n: number, life: number, speed = 40): void {
    const colors = [...piece].filter((c) => c !== '-').map((c) => COLORS[c as Color].hex);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.5 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, color: colors[i % colors.length] ?? '#fff' });
    }
  }

  private readonly loop = (now: number): void => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.realTime += dt;
    const t0 = performance.now();
    if (!this.paused) {
      this.acc += dt * SPEEDS[this.speedIndex];
      let n = 0;
      while (this.acc >= TICK_DT && n < 16) { this.game.step(); this.acc -= TICK_DT; n++; }
      if (n >= 16) this.acc = 0;
    }
    if (this.game.belts.dirty) this.game.belts.rebuild();
    this.simMs = this.simMs * 0.9 + (performance.now() - t0) * 0.1;

    const pan = (600 * dt) / this.camera.z, k = this.input.keys;
    if (k.has('arrowleft') || k.has('a')) this.camera.x -= pan;
    if (k.has('arrowright') || k.has('d')) this.camera.x += pan;
    if (k.has('arrowup') || k.has('w')) this.camera.y -= pan;
    if (k.has('arrowdown') || k.has('s')) this.camera.y += pan;

    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);

    const simTime = this.game.ticks * TICK_DT;
    this.renderer.render({
      game: this.game, camera: this.camera, simTime, realTime: this.realTime, tool: this.tool, rot: this.rot,
      hover: this.hover, showGhost: !this.input.panning, particles: this.particles,
    });
    this.matchTimes = this.matchTimes.filter((t) => simTime - t < 8);
    this.hud.updateOrder(this.game, this.matchTimes.length / 8);
    this.hud.drawRosacePanel(this.game, this.realTime);
    this.hud.updateToolbar(this.game, this.tool);
    $<HTMLButtonElement>('bUndo').disabled = !this.history.canUndo;
    $<HTMLButtonElement>('bRedo').disabled = !this.history.canRedo;
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    this.hud.stats(this.showStats
      ? `${Math.round(1000 / Math.max(1, dt * 1000))} i/s · image ${this.frameMs.toFixed(1)} ms · simulation ${this.simMs.toFixed(2)} ms\n${this.game.world.count} bâtiments · ${this.game.belts.paths.length} chemins · ${this.game.belts.itemCount()} pièces · zoom ${this.camera.z.toFixed(2)}`
      : null);

    this.sinceSave += dt;
    if (this.sinceSave >= AUTOSAVE_EVERY) this.save();
    requestAnimationFrame(this.loop);
  };
}
