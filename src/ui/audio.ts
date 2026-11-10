/** Carillon : chaque livraison joue une note d'une gamme pentatonique, jamais dissonante. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Chime {
  enabled = false;
  private ctx: AudioContext | null = null;
  private last = 0;

  /** À appeler depuis un clic (politique de lecture audio des navigateurs). */
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) {
      try {
        this.ctx ??= new AudioContext();
        void this.ctx.resume();
        this.note(7, this.ctx.currentTime + 0.02, 0.06, 1);
      } catch {
        this.enabled = false;
      }
    }
    return this.enabled;
  }

  delivery(fraction: number): void {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.last < 0.08) return;
    this.last = now;
    this.note(PENTA[Math.min(PENTA.length - 1, Math.floor(fraction * (PENTA.length - 1)))], now, 0.07, 1.4);
  }

  complete(): void {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    [0, 4, 7, 12, 16].forEach((s, i) => this.note(s, t + i * 0.12, 0.08, 2.2));
  }

  private note(semi: number, when: number, vol: number, dur: number): void {
    const ctx = this.ctx!;
    const f = 523.25 * Math.pow(2, semi / 12);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o2.type = 'triangle'; o2.frequency.value = f * 2; g2.gain.value = 0.15;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); o2.connect(g2).connect(g); g.connect(ctx.destination);
    o.start(when); o2.start(when); o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  }
}
