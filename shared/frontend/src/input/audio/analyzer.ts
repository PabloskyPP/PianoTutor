/**
 * Analizador del micrófono: une calibración de ruido, detección de ataques y altura estable.
 * Entrada: cada ~20 ms, la ventana más reciente de muestras (la última es la más nueva) y su instante.
 * Salida: UN evento por ataque estable, con el instante del ATAQUE (no el de la detección) y la confianza (claridad).
 * No filtra notas incorrectas: todo ataque con altura estable se entrega al evaluador. Lo que no alcanza el umbral de claridad
 * es «no detección» y no se emite (no cuenta como error). No se emiten Note Off: un piano acústico decae solo, así que la
 * duración NO se puede medir con fiabilidad desde el micrófono.
 */
import { OnsetDetector } from './onset';
import { detectPitch, type PitchOptions } from './pitch';

export interface MicEvent { midi: number; tMs: number; confidence: number }
export type MicStatus = 'calibrating' | 'listening';
export interface AnalyzerOptions {
  sampleRate: number; sensitivity?: number; calibrationMs?: number;
  onNote: (e: MicEvent) => void; onStatus?: (s: MicStatus) => void; pitch?: PitchOptions;
}
const SETTLE_MS = 55, GIVE_UP_MS = 450, ANALYSIS_SAMPLES = 2048, STABLE_NEEDED = 3, ATTACK_LAG_MS = 8;
const rmsOf = (w: Float32Array, n: number) => { let s = 0; const from = Math.max(0, w.length - n); for (let i = from; i < w.length; i++) s += w[i]! * w[i]!; return Math.sqrt(s / Math.max(1, w.length - from)); };

export class MicAnalyzer {
  private onset = new OnsetDetector();
  private startMs: number | null = null;
  private calSum = 0; private calN = 0;
  private floor = 0.004;
  private status: MicStatus = 'calibrating';
  private pending: { tOn: number; seenAt: number; est: { midi: number; clarity: number }[] } | null = null;
  private sensitivity: number;
  constructor(private o: AnalyzerOptions) { this.sensitivity = o.sensitivity ?? 1; }

  get noiseFloor() { return this.floor; }
  get isCalibrating() { return this.status === 'calibrating'; }
  setSensitivity(s: number) { this.sensitivity = Math.max(0.25, s); }
  /** Vuelve a calibrar el ruido ambiente (p. ej. si se mueve el micrófono). */
  recalibrate() { this.startMs = null; this.calSum = 0; this.calN = 0; this.status = 'calibrating'; this.pending = null; this.onset.reset(); this.o.onStatus?.('calibrating'); }
  reset() { this.pending = null; this.onset.reset(); }

  process(window: Float32Array, nowMs: number): void {
    const rms = rmsOf(window, 512);
    this.startMs ??= nowMs;
    if (this.status === 'calibrating') {
      this.calSum += rms; this.calN++;
      if (nowMs - this.startMs >= (this.o.calibrationMs ?? 800)) { this.floor = Math.max(0.004, (this.calSum / Math.max(1, this.calN)) * 3); this.status = 'listening'; this.o.onStatus?.('listening'); }
      return;
    }
    const minRms = this.floor / this.sensitivity;
    if (this.onset.feed(rms, nowMs, minRms)) this.pending = { tOn: nowMs - ATTACK_LAG_MS, seenAt: nowMs, est: [] };
    const p = this.pending; if (!p) return;
    const elapsed = nowMs - p.seenAt;
    if (elapsed > GIVE_UP_MS || (rms < minRms * 0.5 && elapsed > 120)) { this.pending = null; return; }
    if (elapsed < SETTLE_MS || window.length < ANALYSIS_SAMPLES) return;
    const r = detectPitch(window.subarray(window.length - ANALYSIS_SAMPLES), this.o.sampleRate, this.o.pitch);
    if (!r) { p.est.length = 0; return; }
    p.est.push({ midi: Math.round(r.midi), clarity: r.clarity });
    const tail = p.est.slice(-STABLE_NEEDED);
    if (tail.length === STABLE_NEEDED && tail.every((e) => e.midi === tail[0]!.midi)) {
      this.pending = null;
      this.o.onNote({ midi: tail[0]!.midi, tMs: p.tOn, confidence: tail.reduce((a, e) => a + e.clarity, 0) / tail.length });
    }
  }
}
