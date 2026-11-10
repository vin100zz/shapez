import { DURATION, OFFER_NONE, OFFER_OK } from './defs';
import { DX, DY, opposite, turn } from './geometry';
import type { OfferFn } from './belts';
import { cutPiece, fullPane, isEmpty, rotateCW, superpose } from './piece';
import type { Machine, Output } from './world';

export interface MachineHost {
  offer: OfferFn;
  /** Multiplicateur de vitesse des machines (améliorations). */
  machineSpeed: number;
}

function start(m: Machine, outputs: Output[]): void {
  m.busy = true;
  m.t = 0;
  m.pending = outputs;
}

/** Remet les sorties en attente. Une sortie marquée `drop` sans rien de raccordé est recyclée. */
function flush(m: Machine, host: MachineHost): void {
  m.outBuf = m.outBuf.filter((o) => {
    const r = host.offer(m.x + DX[o.dir], m.y + DY[o.dir], opposite(o.dir), o.piece);
    return !(r === OFFER_OK || (r === OFFER_NONE && o.drop));
  });
}

export function tickMachine(m: Machine, dt: number, host: MachineHost): void {
  if (m.type === 'trash') {
    if (m.anim > 0) m.anim = Math.max(0, m.anim - dt * 3);
    return;
  }
  if (m.busy) {
    m.t += dt * host.machineSpeed;
    m.anim += dt;
    if (m.t + 1e-9 < DURATION[m.type]) return;
    m.busy = false;
    m.t = 0;
    m.outBuf = m.pending ?? [];
    m.pending = null;
  }
  if (m.outBuf.length) {
    flush(m, host);
    if (m.outBuf.length) return;
  }
  const r = m.rot;
  const input = m.inBuf;
  switch (m.type) {
    case 'extractor':
      if (m.dep) start(m, [{ piece: fullPane(m.dep), dir: r, drop: false }]);
      break;
    case 'rotator':
      if (input[2]) {
        start(m, [{ piece: rotateCW(input[2]), dir: r, drop: false }]);
        input[2] = null;
      }
      break;
    case 'cutter':
      if (input[2]) {
        const { right, left } = cutPiece(input[2], r);
        input[2] = null;
        const outs: Output[] = [];
        if (!isEmpty(right)) outs.push({ piece: right, dir: turn(r, 1), drop: true });
        if (!isEmpty(left)) outs.push({ piece: left, dir: turn(r, 3), drop: true });
        start(m, outs);
      }
      break;
    case 'assembler':
      if (input[1] && input[3]) {
        start(m, [{ piece: superpose(input[3], input[1]), dir: r, drop: false }]);
        input[1] = null;
        input[3] = null;
      }
      break;
    case 'splitter':
      if (input[2]) {
        const order = [0, 1, 3];
        for (let j = 0; j < 3; j++) {
          const local = order[(m.rr + j) % 3];
          const dir = turn(r, local);
          if (host.offer(m.x + DX[dir], m.y + DY[dir], opposite(dir), input[2]) === OFFER_OK) {
            input[2] = null;
            m.rr = (m.rr + j + 1) % 3;
            break;
          }
        }
      }
      break;
  }
}
