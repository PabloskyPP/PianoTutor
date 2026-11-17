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
  /** true: acepta cualquier octava (comportamiento del micrófono original). */
  pitchClassOnly?: boolean;
  /** true: una altura equivocada NO cuenta como fallo (comportamiento heredado del micrófono, Fase 1). */
  countMisses?: boolean;
}

export class LearningSession {
  private _pos = 0;
  private _hits = 0;
  private _misses = 0;
  private covered = new Set<number>();

  constructor(readonly events: readonly PerformanceEvent[]) {}

  get pos() { return this._pos; }
  get hits() { return this._hits; }
  get misses() { return this._misses; }
  get total() { return this.events.length; }
  get finished() { return this._pos >= this.events.length; }
  /** Evento esperado ahora, o undefined si terminó. */
  get current(): PerformanceEvent | undefined { return this.events[this._pos]; }
  /** Alturas esperadas que aún no se han tocado. */
  get pending(): number[] { return this.current ? this.current.midis.filter((m) => !this.covered.has(m)) : []; }
  /** Progreso en % = eventos completados / eventos totales (denominador fijo). */
  get progressPercent() { return this.events.length ? Math.round((this._pos / this.events.length) * 100) : 0; }
  get accuracyPercent() { const t = this._hits + this._misses; return t ? Math.round((this._hits / t) * 100) : 0; }

  reset() { this._pos = 0; this._hits = 0; this._misses = 0; this.covered.clear(); }

  noteOn(midi: number, opts: LearningOptions = {}): NoteResult {
    const ev = this.current;
    if (!ev) return { outcome: 'finished', completedEvent: false, finishedSong: true };
    const countMisses = opts.countMisses ?? true;
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
    const completed = ev.midis.every((m) => this.covered.has(m));
    if (completed) { this._pos++; this.covered.clear(); }
    return { outcome: 'hit', completedEvent: completed, finishedSong: completed && this.finished };
  }
}
