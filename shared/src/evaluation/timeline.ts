/** Línea temporal de interpretación: eventos con tiempos en SEGUNDOS REALES (ya divididos por la velocidad), listos para evaluar. */
import type { Song } from '../model/schema';
import type { PerformanceEvent } from '../projection/toPerformance';
import { ticksToSeconds } from '../time/tempo';

export interface TimedNote { midi: number; t: number; tEnd: number }
export interface TimedEvent { index: number; t: number; tEnd: number; midis: number[]; notes: TimedNote[] }

/** `speed` < 1 = más lento. Las tolerancias del evaluador son en milisegundos reales, por eso la velocidad se aplica aquí. */
export function buildTimeline(song: Pick<Song, 'tempoMap' | 'ppq'>, perf: readonly PerformanceEvent[], speed = 1): TimedEvent[] {
  const sec = (tick: number) => ticksToSeconds(tick, song.tempoMap, song.ppq) / speed;
  return perf.map((e, index) => ({
    index, t: sec(e.tickStart), tEnd: sec(e.tickEnd), midis: [...e.midis],
    notes: e.notes.map((n) => ({ midi: n.pitch.midi, t: sec(n.tickStart), tEnd: sec(n.tickEnd) })),
  }));
}

export interface Beat { t: number; accent: boolean }
/** Pulsos del metrónomo (negra o la unidad del compás), con la cuenta previa de un compás en tiempos negativos. */
export function buildBeats(song: Pick<Song, 'tempoMap' | 'ppq' | 'measures' | 'timeSignatures'>, speed = 1, countIn = true): { beats: Beat[]; countInSec: number } {
  const sec = (tick: number) => ticksToSeconds(tick, song.tempoMap, song.ppq) / speed;
  const beats: Beat[] = [];
  const tsAt = (tick: number) => song.timeSignatures.filter((t) => t.tick <= tick).at(-1)!;
  for (const m of song.measures) {
    const ts = tsAt(m.startTick), unit = (4 * song.ppq) / ts.den;
    for (let i = 0, tick = m.startTick; tick < m.startTick + m.lengthTicks - 1; i++, tick += unit) beats.push({ t: sec(tick), accent: i === 0 });
  }
  let countInSec = 0;
  if (countIn && song.measures.length) {
    const ts = song.timeSignatures[0]!, bpm = song.tempoMap[0]!.bpm, unitSec = (60 / bpm) * (4 / ts.den) / speed;
    countInSec = ts.num * unitSec;
    for (let i = 0; i < ts.num; i++) beats.unshift({ t: -(ts.num - i) * unitSec, accent: i === 0 });
    beats.sort((a, b) => a.t - b.t);
  }
  return { beats, countInSec };
}

/** Posición fraccionaria en la lista de eventos para un instante (interpola entre eventos; se usa para desplazar la partitura de forma continua). */
export function fractionalIndex(events: readonly TimedEvent[], t: number): number {
  if (!events.length || t <= events[0]!.t) return 0;
  const last = events.length - 1;
  if (t >= events[last]!.t) return last;
  let lo = 0, hi = last;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (events[m]!.t <= t) lo = m; else hi = m; }
  const a = events[lo]!, b = events[hi]!;
  return lo + (t - a.t) / Math.max(1e-9, b.t - a.t);
}
