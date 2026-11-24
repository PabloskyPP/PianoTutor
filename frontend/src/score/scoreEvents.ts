import type { PerformanceEvent } from '@pianotutor/shared';
import { diatonicStep } from '@pianotutor/shared';

export type Acc = '' | '#' | 'b' | '##' | 'bb';
export interface ScoreHead { step: number; midi: number; staff: 0 | 1; acc: Acc }
export interface ScoreEvent { heads: ScoreHead[] }
const ACC: Record<number, Acc> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

/** Eventos de interpretación → cabezas de nota para el pentagrama. En diseño de una mano todo va al pentagrama superior. */
export function buildScoreEvents(perf: readonly PerformanceEvent[], grand: boolean): ScoreEvent[] {
  return perf.map((e) => ({
    heads: e.notes.map((n) => ({ step: diatonicStep(n.pitch), midi: n.pitch.midi, staff: (grand && n.staff === 1 ? 1 : 0) as 0 | 1, acc: ACC[n.pitch.alter] ?? '' })),
  }));
}

/** Rango de pasos diatónicos que el pentagrama de Playing dibuja con comodidad (Mi3–Re7). Fuera de él las notas se recortan. */
export const VISIBLE_STEPS = { min: 23, max: 50 };
export const outOfView = (events: readonly ScoreEvent[]) => events.some((e) => e.heads.some((h) => h.step < VISIBLE_STEPS.min || h.step > VISIBLE_STEPS.max));
