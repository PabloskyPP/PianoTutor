/**
 * Detector de ataques por subida de energía. Un ataque exige: energía por encima del umbral de ruido, un salto claro respecto a
 * la energía reciente (así las notas repetidas se separan aunque la anterior siga sonando) y un periodo refractario.
 */
export interface OnsetOptions { ratio?: number; refractoryMs?: number; lookbackMs?: number }

export class OnsetDetector {
  private hist: { t: number; rms: number }[] = [];
  private lastOnset = -Infinity;
  constructor(private o: OnsetOptions = {}) {}

  /** Devuelve true si en este instante empieza una nota. `minRms` es el umbral absoluto (ruido ambiente × sensibilidad). */
  feed(rms: number, tMs: number, minRms: number): boolean {
    const { ratio = 1.6, refractoryMs = 110, lookbackMs = 90 } = this.o;
    this.hist.push({ t: tMs, rms });
    while (this.hist.length > 1 && this.hist[0]!.t < tMs - lookbackMs - 40) this.hist.shift();
    const prev = this.hist.slice(0, -1).filter((h) => h.t >= tMs - lookbackMs);
    const ref = prev.length ? Math.min(...prev.map((h) => h.rms)) : 0;
    const last = prev.at(-1)?.rms ?? 0;
    const onset = rms >= minRms && rms > last && (ref === 0 || rms >= ratio * ref) && tMs - this.lastOnset >= refractoryMs;
    if (onset) this.lastOnset = tMs;
    return onset;
  }
  reset() { this.hist = []; this.lastOnset = -Infinity; }
}
