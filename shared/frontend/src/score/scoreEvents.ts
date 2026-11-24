import { clefAt, diatonicStep, notatable, splitNotatable, type ClefId, type PerformanceEvent, type Song, type VexDuration } from '@pianotutor/shared';

export type Acc = '' | '#' | 'b' | '##' | 'bb';
export interface Fig { base: VexDuration; dots: 0 | 1 }
export interface ScoreHead { step: number; midi: number; staff: 0 | 1; acc: Acc; clef: ClefId; fig: Fig }
export interface ScoreEvent {
  heads: ScoreHead[];
  /** Ticks hasta el siguiente evento (reparte el espacio horizontal). Sin él el espacio es fijo, como en el original. */
  gapTicks?: number;
  /** true en el primer evento de un compás (se dibuja la barra de compás antes). */
  bar?: boolean;
  /** Compás vigente («6/8»). */
  ts?: string;
  /** Grupo de pulso (compás + pulso): las notas con corchete de un mismo grupo se unen con barras. */
  bg?: number;
}
const ACC: Record<number, Acc> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

/** Figura que se dibuja para una duración sonora. Los tresillos y similares usan la figura base; si no es una figura exacta (p. ej. ligaduras fusionadas) se usa la mayor que cabe. */
export function figureOf(ticks: number, tuplet?: { actual: number; normal: number }): Fig {
  const base = tuplet ? Math.round((ticks * tuplet.actual) / tuplet.normal) : ticks;
  const n = notatable(base) ?? notatable(ticks);
  if (n) return { base: n.vex, dots: n.dots };
  const p = splitNotatable(ticks).parts[0];
  return p ? { base: p.vex, dots: p.dots } : { base: '64', dots: 0 };
}

/** Duración (ticks) del grupo de barras: 3 corcheas en compases compuestos (6/8, 9/8, 12/8) y en 3/8; el pulso en los demás. */
export function beatGroupTicks(num: number, den: number): number {
  if (den === 8 && num % 3 === 0) return 1440;
  return (4 * 960) / den >= 960 ? (4 * 960) / den : 960;
}

/**
 * Eventos de interpretación → lo que dibuja Playing. Con `song` se obtienen la clave vigente de cada pentagrama en cada nota, los compases
 * y la métrica; sin ella (pruebas, uso mínimo) todo va en clave de Sol/Fa por defecto y sin compases.
 */
export function buildScoreEvents(perf: readonly PerformanceEvent[], grand: boolean, song?: Pick<Song, 'parts' | 'measures' | 'timeSignatures'>): ScoreEvent[] {
  const staffByIndex = new Map(song?.parts.flatMap((p) => p.staves).map((s) => [s.index, s]) ?? []);
  const measures = song?.measures ?? [];
  const measureOf = (tick: number) => { let lo = 0, hi = measures.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (measures[m]!.startTick <= tick) lo = m; else hi = m - 1; } return measures.length ? lo : 0; };
  const tsAt = (tick: number) => song?.timeSignatures.filter((t) => t.tick <= tick).at(-1);
  let prevMeasure = -1;
  return perf.map((e, i) => {
    const next = perf[i + 1];
    const heads: ScoreHead[] = e.notes.map((n) => {
      const slot = (grand && n.staff === 1 ? 1 : 0) as 0 | 1;
      const st = staffByIndex.get(n.staff);
      const clef: ClefId = st ? clefAt(st, n.tickStart) : slot === 1 ? 'F' : 'G';
      return { step: diatonicStep(n.pitch), midi: n.pitch.midi, staff: slot, acc: ACC[n.pitch.alter] ?? '', clef, fig: figureOf(n.tickEnd - n.tickStart, n.tuplet) };
    });
    const out: ScoreEvent = { heads, gapTicks: next ? next.tickStart - e.tickStart : Math.max(...e.notes.map((n) => n.tickEnd - n.tickStart)) };
    if (song) {
      const m = measureOf(e.tickStart); if (i > 0 && m !== prevMeasure) out.bar = true; prevMeasure = m;
      const ts = tsAt(measures[m]?.startTick ?? 0);
      if (ts) { out.ts = `${ts.num}/${ts.den}`; out.bg = m * 1000 + Math.floor((e.tickStart - (measures[m]?.startTick ?? 0)) / beatGroupTicks(ts.num, ts.den)); }
    }
    return out;
  });
}

import { CANVAS_H, headY } from './geometry';
/** ¿Alguna nota cae fuera del lienzo? (dependiente de la clave: una nota grave en clave de Fa sí se ve). Fuera del lienzo se recorta; se avisa en Playing. */
export const outOfView = (events: readonly ScoreEvent[], grand = false) =>
  events.some((e) => e.heads.some((h) => { const y = headY(h.staff, h.clef, h.step); return y < 8 || y > (grand ? CANVAS_H.grand : CANVAS_H.single) - 8; }));
