import type { ToolType } from './defs';
import type { Dir } from './geometry';

/** État d'une case pour l'annulation : le bâtiment qui s'y trouve (sans son contenu), ou rien. */
export interface Snap { type: ToolType; rot: Dir }
export interface Op { x: number; y: number; before: Snap | null; after: Snap | null }

export interface Applier { applySnap(x: number, y: number, snap: Snap | null): void }

/** Annuler / rétablir. Une action (un clic, un tracé à la souris) regroupe plusieurs opérations. */
export class History {
  private readonly undoStack: Op[][] = [];
  private readonly redoStack: Op[][] = [];
  private current: Op[] | null = null;

  constructor(private readonly limit = 300) {}

  begin(): void {
    this.end();
    this.current = [];
  }

  record(ops: Op[]): void {
    if (!ops.length) return;
    if (this.current) this.current.push(...ops);
    else this.push(ops);
  }

  end(): void {
    if (this.current?.length) this.push(this.current);
    this.current = null;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(target: Applier): boolean {
    this.end();
    const action = this.undoStack.pop();
    if (!action) return false;
    for (let i = action.length - 1; i >= 0; i--) target.applySnap(action[i].x, action[i].y, action[i].before);
    this.redoStack.push(action);
    return true;
  }

  redo(target: Applier): boolean {
    this.end();
    const action = this.redoStack.pop();
    if (!action) return false;
    for (const op of action) target.applySnap(op.x, op.y, op.after);
    this.undoStack.push(action);
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.current = null;
  }

  private push(ops: Op[]): void {
    this.undoStack.push(ops);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }
}
