import type { StashedItem } from './belts';
import { isToolType, type MachineType, type ToolType } from './defs';
import { Game } from './game';
import { type Dir, inBounds } from './geometry';
import { isValidPiece, type Piece } from './piece';
import type { Belt, Output } from './world';

export const SAVE_FORMAT = 'rosace';
export const SAVE_VERSION = 1;

type SavedOutput = [Piece, Dir, 0 | 1];
interface SavedMachineState { i: (Piece | null)[]; o: SavedOutput[]; b: 0 | 1; t: number; p: SavedOutput[] | null; rr: number }
type SavedBuilding =
  | { k: 'belt'; x: number; y: number; r: Dir; items?: [number, Piece, number][] }
  | { k: MachineType; x: number; y: number; r: Dir; s: SavedMachineState };

export interface Camera { x: number; y: number; z: number }

export interface SaveData {
  format: typeof SAVE_FORMAT;
  v: typeof SAVE_VERSION;
  seed: number;
  ticks: number;
  progress: { order: number; count: number; delivered: number; unlocked: ToolType[]; belt: number; machine: number; sandbox: boolean };
  buildings: SavedBuilding[];
  camera?: Camera;
}

export class SaveError extends Error {}

const outputsToSave = (list: Output[]): SavedOutput[] => list.map((o) => [o.piece, o.dir, o.drop ? 1 : 0]);

export function serialize(game: Game, camera?: Camera): SaveData {
  if (game.belts.dirty) game.belts.rebuild();
  const stash = game.belts.stash();
  const buildings: SavedBuilding[] = [];
  for (const b of game.world.belts) {
    const items = stash.get(b);
    buildings.push({ k: 'belt', x: b.x, y: b.y, r: b.rot, ...(items ? { items: items.map((i) => [i.t, i.piece, i.side] as [number, Piece, number]) } : {}) });
  }
  for (const m of game.world.machines) {
    buildings.push({
      k: m.type, x: m.x, y: m.y, r: m.rot,
      s: { i: [...m.inBuf], o: outputsToSave(m.outBuf), b: m.busy ? 1 : 0, t: m.t, p: m.pending ? outputsToSave(m.pending) : null, rr: m.rr },
    });
  }
  const p = game.progress;
  return {
    format: SAVE_FORMAT, v: SAVE_VERSION, seed: game.seed, ticks: game.ticks,
    progress: { order: p.orderIndex, count: p.orderCount, delivered: p.delivered, unlocked: [...p.unlocked], belt: p.beltLevel, machine: p.machineLevel, sandbox: p.sandbox },
    buildings,
    ...(camera ? { camera } : {}),
  };
}

/* ---------- Lecture et validation ---------- */

const fail = (msg: string): never => { throw new SaveError(`Sauvegarde illisible : ${msg}.`); };
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDir = (v: unknown): v is Dir => v === 0 || v === 1 || v === 2 || v === 3;

function readOutputs(v: unknown, where: string): Output[] {
  if (!Array.isArray(v)) return fail(`sorties invalides (${where})`);
  return v.map((o) => {
    if (!Array.isArray(o) || !isValidPiece(o[0]) || !isDir(o[1])) return fail(`sortie invalide (${where})`);
    return { piece: o[0], dir: o[1], drop: o[2] === 1 };
  });
}

/** Migrations successives des anciennes versions (aucune pour l'instant). */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.v === SAVE_VERSION) return raw;
  return fail(`version ${String(raw.v)} inconnue`);
}

export function deserialize(input: unknown): { game: Game; camera?: Camera } {
  if (!input || typeof input !== 'object') return fail('ce n\'est pas un objet');
  const raw = migrate(input as Record<string, unknown>);
  if (raw.format !== SAVE_FORMAT) return fail('ce n\'est pas une partie de Rosace');
  if (!isInt(raw.seed)) return fail('graine manquante');
  const game = new Game(raw.seed);
  game.ticks = isInt(raw.ticks) ? raw.ticks : 0;

  const pr = raw.progress as SaveData['progress'] | undefined;
  if (!pr || !isInt(pr.order) || !isInt(pr.count) || !Array.isArray(pr.unlocked)) return fail('progression invalide');
  const p = game.progress;
  p.orderIndex = Math.max(0, pr.order);
  p.orderCount = Math.max(0, pr.count);
  p.delivered = isInt(pr.delivered) ? pr.delivered : 0;
  p.unlocked = new Set(pr.unlocked.filter(isToolType));
  p.beltLevel = isInt(pr.belt) ? pr.belt : 0;
  p.machineLevel = isInt(pr.machine) ? pr.machine : 0;
  p.sandbox = pr.sandbox === true;

  if (!Array.isArray(raw.buildings)) return fail('liste de bâtiments manquante');
  const items = new Map<Belt, StashedItem[]>();
  for (const sb of raw.buildings as SavedBuilding[]) {
    if (!sb || !isToolType(sb.k) || !isInt(sb.x) || !isInt(sb.y) || !isDir(sb.r) || !inBounds(sb.x, sb.y)) return fail('bâtiment invalide');
    if (game.world.get(sb.x, sb.y)) return fail(`case (${sb.x}, ${sb.y}) occupée deux fois`);
    if (sb.k === 'belt') {
      const belt = game.world.createBelt(sb.x, sb.y, sb.r);
      if (sb.items) {
        items.set(belt, sb.items.map(([t, piece, side]) => {
          if (!isNum(t) || t < 0 || t > 1 || !isValidPiece(piece)) return fail('pièce de convoyeur invalide');
          return { t, piece, side: isDir(side) ? side : -1 };
        }));
      }
    } else {
      const m = game.world.createMachine(sb.k, sb.x, sb.y, sb.r);
      const s = sb.s;
      if (!s || !Array.isArray(s.i) || s.i.length !== 4) return fail('état de machine invalide');
      m.inBuf = s.i.map((v) => (v === null ? null : isValidPiece(v) ? v : fail('tampon de machine invalide')));
      m.outBuf = readOutputs(s.o, 'machine');
      m.busy = s.b === 1;
      m.t = isNum(s.t) ? s.t : 0;
      m.pending = s.p ? readOutputs(s.p, 'machine') : null;
      if (m.busy && !m.pending) m.busy = false;
      m.rr = isInt(s.rr) ? ((s.rr % 3) + 3) % 3 : 0;
    }
  }
  game.belts.load(items);
  game.belts.rebuild();

  const cam = raw.camera as Camera | undefined;
  const camera = cam && isNum(cam.x) && isNum(cam.y) && isNum(cam.z) ? cam : undefined;
  return { game, ...(camera ? { camera } : {}) };
}

export const encodeSave = (data: SaveData): string => JSON.stringify(data);

export function decodeSave(text: string): { game: Game; camera?: Camera } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('le texte n\'est pas du JSON');
  }
  return deserialize(parsed);
}
