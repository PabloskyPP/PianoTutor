/**
 * Modo Ritmo (docs/EVALUATION.md). Lógica pura y determinista: no usa reloj ni interfaz.
 * Los tiempos son segundos reales de la línea temporal (ya con velocidad y calibración de latencia aplicadas por quien llama).
 *
 * Ventana de cada evento k (instante t_k): [t_k − Lk, t_k + Rk] con Lk = min(2·T_out, ½·(t_k − t_{k−1})) y Rk = min(2·T_out, ½·(t_{k+1} − t_k)).
 * Por construcción las ventanas de eventos vecinos NO se solapan. Dentro de ella:
 *   |Δ| ≤ T_ok (recortado a la ventana)  → acierto
 *   T_ok < |Δ| ≤ T_out                    → error de tiempo (cerca)
 *   |Δ| > T_out hasta el borde            → error de tiempo (lejos)
 * La nota consume su altura en ese evento. Una altura esperada que sigue abierta al cerrarse la ventana es UNA omisión.
 * Una pulsación que no encaja en ninguna ventana abierta es UNA nota equivocada. Cada pulsación y cada ausencia se cuenta una sola vez.
 */
import type { TimedEvent } from './timeline';

export interface RhythmConfig {
  okSec: number; outSec: number;
  debounceSec: number;              // un rebote de la misma tecla dentro de este margen se ignora
  shortRatio: number; shortRatioLong: number; longNoteSec: number; minDurationEvalSec: number;
}
export const DEFAULT_RHYTHM: RhythmConfig = { okSec: 0.1, outSec: 0.2, debounceSec: 0.03, shortRatio: 0.6, shortRatioLong: 0.5, longNoteSec: 1, minDurationEvalSec: 0.15 };

export type Judgement =
  | { kind: 'hit'; eventIndex: number; midi: number; deltaSec: number; corrected?: boolean }
  | { kind: 'timing'; eventIndex: number; midi: number; deltaSec: number; direction: 'early' | 'late'; severity: 'near' | 'far'; corrected?: boolean }
  | { kind: 'wrong'; midi: number; tSec: number }
  | { kind: 'omission'; eventIndex: number; midi: number }
  | { kind: 'ignored'; midi: number }
  | { kind: 'duration'; eventIndex: number; midi: number; result: 'ok' | 'short' | 'skipped'; ratio?: number };

type PitchState = 'open' | 'hit' | 'timing' | 'omitted' | 'unverified';
interface Rt {
  ev: TimedEvent; states: Map<number, PitchState>; tOn: Map<number, number>;
  farBefore: number; farAfter: number; closed: boolean; open: number; counted: boolean;
}
export interface RhythmStats { hits: number; timingEarly: number; timingLate: number; noteErrors: number; omissions: number; durationOk: number; durationShort: number; durationSkipped: number; unverified: number; ignored: number }
export type EventStatus = 'pending' | 'hit' | 'timing' | 'omit' | 'partial' | 'unverified';
export interface NoteOnOptions { pitchClassOnly?: boolean; lenientChord?: boolean; /** false: una nota que no encaja en ningún evento se devuelve como 'wrong' pero NO suma fallo (micrófono con «contar notas equivocadas» desactivado). */ countWrong?: boolean }

export class RhythmSession {
  private rt: Rt[];
  private nextClose = 0;
  private completed = 0;
  private held = new Map<number, { eventIndex: number; tOn: number; expected: number }>();
  readonly stats: RhythmStats = { hits: 0, timingEarly: 0, timingLate: 0, noteErrors: 0, omissions: 0, durationOk: 0, durationShort: 0, durationSkipped: 0, unverified: 0, ignored: 0 };

  constructor(readonly events: readonly TimedEvent[], readonly cfg: RhythmConfig = DEFAULT_RHYTHM) {
    this.rt = events.map((ev, i) => {
      const prev = events[i - 1], next = events[i + 1];
      const cap = 2 * cfg.outSec;
      return {
        ev, states: new Map(ev.midis.map((m) => [m, 'open' as PitchState])), tOn: new Map(),
        farBefore: prev ? Math.min(cap, (ev.t - prev.t) / 2) : cap, farAfter: next ? Math.min(cap, (next.t - ev.t) / 2) : cap,
        closed: false, open: ev.midis.length, counted: false,
      };
    });
  }

  get total() { return this.events.length; }
  get hits() { return this.stats.hits; }
  /** Fallos = errores de tiempo + notas equivocadas + omisiones (cada uno una sola vez). */
  get fails() { return this.stats.timingEarly + this.stats.timingLate + this.stats.noteErrors + this.stats.omissions; }
  get completedEvents() { return this.completed; }
  get progressPercent() { return this.total ? Math.round((this.completed / this.total) * 100) : 0; }
  get finished() { return this.nextClose >= this.rt.length; }
  get accuracyPercent() { const t = this.hits + this.fails; return t ? Math.round((this.hits / t) * 100) : 0; }
  /** Primer evento aún no cerrado y sus alturas abiertas (lo que hay que tocar «ahora»). */
  get upcoming(): { index: number; midis: number[] } | undefined {
    const r = this.rt.slice(this.nextClose).find((x) => x.open > 0);
    return r ? { index: r.ev.index, midis: [...r.states].filter(([, s]) => s === 'open').map(([m]) => m) } : undefined;
  }
  windowOf(i: number) { const r = this.rt[i]!; return { from: r.ev.t - r.farBefore, to: r.ev.t + r.farAfter }; }

  statusOf(i: number): EventStatus {
    const s = [...this.rt[i]!.states.values()];
    if (s.includes('open')) return 'pending';
    const has = (x: PitchState) => s.includes(x);
    if (has('omitted')) return has('hit') || has('timing') ? 'partial' : 'omit';
    if (has('timing')) return 'timing';
    if (has('unverified') && !has('hit')) return 'unverified';
    return 'hit';
  }

  private resolve(r: Rt) { if (r.open === 0 && !r.counted) { r.counted = true; this.completed++; } }

  noteOn(midi: number, tSec: number, opts: NoteOnOptions = {}): Judgement {
    const pc = (m: number) => ((m % 12) + 12) % 12;
    let best: { r: Rt; pitch: number; dist: number } | undefined;
    for (const r of this.rt) {
      if (tSec < r.ev.t - r.farBefore) break;
      if (tSec > r.ev.t + r.farAfter) continue;
      const pitch = opts.pitchClassOnly
        ? r.ev.midis.find((m) => pc(m) === pc(midi) && (r.states.get(m) === 'open' || r.states.get(m) === 'omitted'))
        : (r.states.get(midi) === 'open' || r.states.get(midi) === 'omitted' ? midi : undefined);
      if (pitch === undefined) continue;
      const dist = Math.abs(tSec - r.ev.t);
      if (!best || dist < best.dist) best = { r, pitch, dist };
    }
    if (!best) {
      for (const r of this.rt) {   // ¿rebote de una nota ya juzgada?
        if (tSec < r.ev.t - r.farBefore) break;
        for (const [p, on] of r.tOn) if ((opts.pitchClassOnly ? pc(p) === pc(midi) : p === midi) && Math.abs(tSec - on) <= this.cfg.debounceSec) { this.stats.ignored++; return { kind: 'ignored', midi }; }
      }
      if (opts.countWrong !== false) this.stats.noteErrors++;
      return { kind: 'wrong', midi, tSec };
    }
    const { r, pitch } = best;
    const dt = tSec - r.ev.t;
    // Una altura ya dada por omitida puede llegar tarde por retraso de entrega (p. ej. micrófono): se corrige la omisión en vez de contarla además como nota equivocada.
    const wasOmitted = r.states.get(pitch) === 'omitted';
    if (wasOmitted) this.stats.omissions--; else r.open--;
    const okB = Math.min(this.cfg.okSec, r.farBefore), okA = Math.min(this.cfg.okSec, r.farAfter);
    r.tOn.set(pitch, tSec);
    if (opts.lenientChord && r.ev.midis.length > 1) {
      for (const [m, s] of r.states) if (m !== pitch && s === 'open') { r.states.set(m, 'unverified'); r.open--; this.stats.unverified++; }
    }
    this.resolve(r);
    const note = r.ev.notes.find((n) => n.midi === pitch);
    this.held.set(midi, { eventIndex: r.ev.index, tOn: tSec, expected: (note?.tEnd ?? r.ev.tEnd) - (note?.t ?? r.ev.t) });
    const corrected = wasOmitted ? { corrected: true as const } : {};
    if (dt >= -okB && dt <= okA) {
      r.states.set(pitch, 'hit'); this.stats.hits++;
      return { kind: 'hit', eventIndex: r.ev.index, midi: pitch, deltaSec: dt, ...corrected };
    }
    r.states.set(pitch, 'timing');
    const direction = dt < 0 ? 'early' : 'late';
    if (direction === 'early') this.stats.timingEarly++; else this.stats.timingLate++;
    return { kind: 'timing', eventIndex: r.ev.index, midi: pitch, deltaSec: dt, direction, severity: Math.abs(dt) <= this.cfg.outSec ? 'near' : 'far', ...corrected };
  }

  /** Fin de pulsación. Evalúa la duración solo si es fiable (no hay pedal pulsado y la nota esperada es suficientemente larga). */
  noteOff(midi: number, tSec: number, opts: { sustainDown?: boolean } = {}): Judgement | null {
    const h = this.held.get(midi); if (!h) return null;
    this.held.delete(midi);
    if (opts.sustainDown || h.expected < this.cfg.minDurationEvalSec) { this.stats.durationSkipped++; return { kind: 'duration', eventIndex: h.eventIndex, midi, result: 'skipped' }; }
    const ratio = (tSec - h.tOn) / h.expected;
    const limit = h.expected > this.cfg.longNoteSec ? this.cfg.shortRatioLong : this.cfg.shortRatio;
    if (ratio < limit) { this.stats.durationShort++; return { kind: 'duration', eventIndex: h.eventIndex, midi, result: 'short', ratio }; }
    this.stats.durationOk++; return { kind: 'duration', eventIndex: h.eventIndex, midi, result: 'ok', ratio };
  }

  /** Cierra las ventanas vencidas a `nowSec` (omisiones). Idempotente: cada omisión se emite una sola vez. */
  tick(nowSec: number): Judgement[] {
    const out: Judgement[] = [];
    while (this.nextClose < this.rt.length) {
      const r = this.rt[this.nextClose]!;
      if (nowSec <= r.ev.t + r.farAfter) break;
      this.close(r, out); this.nextClose++;
    }
    return out;
  }
  /** Cierra todo lo pendiente (fin de la canción o de la sesión). */
  finish(): Judgement[] {
    const out: Judgement[] = [];
    while (this.nextClose < this.rt.length) { this.close(this.rt[this.nextClose]!, out); this.nextClose++; }
    return out;
  }
  private close(r: Rt, out: Judgement[]) {
    r.closed = true;
    for (const [m, s] of r.states) if (s === 'open') { r.states.set(m, 'omitted'); r.open--; this.stats.omissions++; out.push({ kind: 'omission', eventIndex: r.ev.index, midi: m }); }
    this.resolve(r);
  }
}
