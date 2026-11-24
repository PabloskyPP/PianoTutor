/** Conversión ticks <-> segundos con mapa de tempo (el tempo vive solo aquí, no en los eventos). */
export interface TempoPoint { tick: number; bpm: number }

export function ticksToSeconds(tick: number, tempoMap: TempoPoint[], ppq: number): number {
  let seconds = 0;
  for (let i = 0; i < tempoMap.length; i++) {
    const cur = tempoMap[i]!;
    const next = tempoMap[i + 1];
    const end = next ? Math.min(next.tick, tick) : tick;
    if (end > cur.tick) seconds += ((end - cur.tick) / ppq) * (60 / cur.bpm);
    if (!next || next.tick >= tick) break;
  }
  return seconds;
}

export function secondsToTicks(sec: number, tempoMap: TempoPoint[], ppq: number): number {
  let remaining = sec;
  for (let i = 0; i < tempoMap.length; i++) {
    const cur = tempoMap[i]!;
    const next = tempoMap[i + 1];
    const secPerTick = 60 / cur.bpm / ppq;
    if (!next) return cur.tick + remaining / secPerTick;
    const span = (next.tick - cur.tick) * secPerTick;
    if (remaining <= span) return cur.tick + remaining / secPerTick;
    remaining -= span;
  }
  return 0;
}
