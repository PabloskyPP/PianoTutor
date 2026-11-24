/**
 * Modo Aprendizaje (docs/EVALUATION.md §Aprendizaje). Lógica pura, sin UI ni reloj.
 *
 * Cada evento esperado es un conjunto de alturas. Un Note On:
 *  - altura esperada y aún no cubierta  -> acierto (se marca cubierta);
 *  - altura esperada ya cubierta        -> ignorada (rebote / repique), sin penalización;
 *  - cualquier otra altura              -> fallo.
 * El evento se completa cuando todas sus alturas están cubiertas; entonces avanza.
 * No hay límite de tiempo ni penalización por omisión.
 */
import type { PerformanceEvent } from '../projection/toPerformance';

export type NoteOutcome = 'hit' | 'miss' | 'ignored' | 'finished';
export interface NoteResult { outcome: NoteOutcome; completedEvent: boolean; finishedSong: boolean }
export interface LearningOptions {
  /** true: acepta cualquier octava (útil con micrófono). */
  pitchClassOnly?: boolean;
  /** false: una altura equivocada NO cuenta como fallo. Por defecto true. */
  countMisses?: boolean;
  /** Micrófono (monofónico): en un acorde basta con detectar UNA de sus notas; las demás quedan «sin verificar» (fiabilidad baja). */
  lenientChord?: boolean;
  /** Instante de la pulsación (ms), para el antirrebote y la dispersión de acordes. */
  tMs?: number;
}
export interface LearningConfig { debounceMs: number; simultaneityMs: number }
export const DEFAULT_LEARNING: LearningConfig = { debounceMs: 30, simultaneityMs: 150 };

export class LearningSession {
  private _pos = 0;
  private _hits = 0;
  private _misses = 0;
  private covered = new Set<number>();
  private lastHit = new Map<number, number>();
  private hitTimes: number[] = [];
  private _unverified = 0;
  private _arpeggiated = 0;

  constructor(readonly events: readonly PerformanceEvent[], readonly cfg: LearningConfig = DEFAULT_LEARNING) {}

  get pos() { return this._pos; }
  get hits() { return this._hits; }
  get misses() { return this._misses; }
  get total() { return this.events.length; }
  get finished() { return this._pos >= this.events.length; }
  /** Evento esperado ahora, o undefined si terminó. */
  get current(): PerformanceEvent | undefined { return this.events[this._pos]; }
  /** Alturas del evento actual que ya se tocaron (para pintarlas en verde mientras faltan las demás). */
  get coveredNow(): number[] { return [...this.covered]; }
  /** Alturas esperadas que aún no se han tocado. */
  get pending(): number[] { return this.current ? this.current.midis.filter((m) => !this.covered.has(m)) : []; }
  /** Progreso en % = eventos completados / eventos totales (denominador fijo). */
  get progressPercent() { return this.events.length ? Math.round((this._pos / this.events.length) * 100) : 0; }
  /** Notas de acorde que no se pudieron comprobar (micrófono). */
  get unverified() { return this._unverified; }
  /** Acordes cuyas notas se tocaron con más dispersión que la ventana de simultaneidad (informativo, no penaliza). */
  get arpeggiated() { return this._arpeggiated; }
  get accuracyPercent() { const t = this._hits + this._misses; return t ? Math.round((this._hits / t) * 100) : 0; }

  reset() { this._pos = 0; this._hits = 0; this._misses = 0; this._unverified = 0; this._arpeggiated = 0; this.covered.clear(); this.lastHit.clear(); this.hitTimes = []; }

  noteOn(midi: number, opts: LearningOptions = {}): NoteResult {
    const ev = this.current;
    if (!ev) return { outcome: 'finished', completedEvent: false, finishedSong: true };
    const countMisses = opts.countMisses ?? true;
    const last = opts.tMs !== undefined ? this.lastHit.get(midi) : undefined;
    if (last !== undefined && opts.tMs! - last >= 0 && opts.tMs! - last < this.cfg.debounceMs) return { outcome: 'ignored', completedEvent: false, finishedSong: false };
    const target = opts.pitchClassOnly
      ? ev.midis.find((m) => !this.covered.has(m) && m % 12 === ((midi % 12) + 12) % 12)
      : (ev.midis.includes(midi) && !this.covered.has(midi) ? midi : undefined);
    if (target === undefined) {
      const alreadyCovered = opts.pitchClassOnly
        ? ev.midis.some((m) => this.covered.has(m) && m % 12 === ((midi % 12) + 12) % 12)
        : this.covered.has(midi);
      if (alreadyCovered) return { outcome: 'ignored', completedEvent: false, finishedSong: false };
      if (countMisses) this._misses++;
      return { outcome: 'miss', completedEvent: false, finishedSong: false };
    }
    this._hits++;
    this.covered.add(target);
    if (opts.tMs !== undefined) { this.lastHit.set(midi, opts.tMs); this.hitTimes.push(opts.tMs); }
    if (opts.lenientChord && ev.midis.length > 1) { this._unverified += ev.midis.filter((m) => !this.covered.has(m)).length; ev.midis.forEach((m) => this.covered.add(m)); }
    const completed = ev.midis.every((m) => this.covered.has(m));
    if (completed) {
      if (this.hitTimes.length > 1 && Math.max(...this.hitTimes) - Math.min(...this.hitTimes) > this.cfg.simultaneityMs) this._arpeggiated++;
      this._pos++; this.covered.clear(); this.hitTimes = [];
    }
    return { outcome: 'hit', completedEvent: completed, finishedSong: completed && this.finished };
  }
}
