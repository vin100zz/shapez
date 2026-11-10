import { TS } from './draw';

export const MIN_ZOOM = 0.12;
export const MAX_ZOOM = 2.5;

/** Caméra : (x, y) = centre de l'écran en unités monde, z = zoom. */
export class Camera {
  x = 0;
  y = 0;
  z = 1;
  viewW = 1;
  viewH = 1;

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.viewW / 2) / this.z + this.x, (sy - this.viewH / 2) / this.z + this.y];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.z + this.viewW / 2, (wy - this.y) * this.z + this.viewH / 2];
  }

  tileAt(sx: number, sy: number): { x: number; y: number } {
    const [wx, wy] = this.screenToWorld(sx, sy);
    return { x: Math.floor(wx / TS), y: Math.floor(wy / TS) };
  }

  /** Zoome en gardant fixe le point d'écran (sx, sy). */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.z * factor));
    this.x = wx - (sx - this.viewW / 2) / this.z;
    this.y = wy - (sy - this.viewH / 2) / this.z;
  }
}
