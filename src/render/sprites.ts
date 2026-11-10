import type { MachineType } from '../core/defs';
import type { Dir } from '../core/geometry';
import type { Color, Piece } from '../core/piece';
import { drawMachineBody, drawPiece, drawTrack, TS } from './draw';

/** Nombre d'images de l'animation des chevrons de convoyeur (sur une demi-case). */
export const BELT_FRAMES = 8;
const MAX_SPRITES = 3000;

/**
 * Cache d'images pré-dessinées. Chaque image est rendue pour une échelle quantifiée
 * (pixels par unité monde), puis posée d'un seul drawImage : c'est ce qui permet d'afficher
 * des dizaines de milliers d'objets.
 */
export class Sprites {
  private readonly cache = new Map<string, HTMLCanvasElement>();

  /** Échelle quantifiée par quarts d'octave, pour limiter le nombre d'images différentes. */
  static quantize(scale: number): number {
    return Math.pow(2, Math.round(Math.log2(Math.max(0.05, scale)) * 4) / 4);
  }

  private make(key: string, worldSize: number, scale: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    let img = this.cache.get(key);
    if (img) return img;
    if (this.cache.size > MAX_SPRITES) this.cache.clear();
    img = document.createElement('canvas');
    const px = Math.max(1, Math.ceil(worldSize * scale));
    img.width = px;
    img.height = px;
    const c = img.getContext('2d')!;
    c.scale(px / worldSize, px / worldSize);
    c.translate(worldSize / 2, worldSize / 2);
    draw(c);
    this.cache.set(key, img);
    return img;
  }

  /** Pièce de côté `size` (unités monde) ; l'image fait size × 1,2 pour la marge du plomb. */
  piece(p: Piece, size: number, scale: number): HTMLCanvasElement {
    return this.make(`p${p}|${size}|${scale}`, size * 1.2, scale, (c) => drawPiece(c, p, 0, 0, size));
  }

  machine(type: MachineType, rot: Dir, dep: Color | null, scale: number): HTMLCanvasElement {
    return this.make(`m${type}${rot}${dep ?? ''}|${scale}`, TS, scale, (c) => {
      c.rotate((rot * Math.PI) / 2);
      drawMachineBody(c, type, TS, dep);
    });
  }

  belt(inW: Dir, outW: Dir, frame: number, scale: number): HTMLCanvasElement {
    return this.make(`b${inW}${outW}${frame}|${scale}`, TS, scale, (c) => drawTrack(c, 0, 0, TS, inW, outW, (frame / BELT_FRAMES) * 0.5));
  }
}
