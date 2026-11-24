import { describe, it, expect } from 'vitest';
import { RhythmSession, LearningSession, buildTimeline, buildBeats, fractionalIndex, buildLegacySong, toPerformance, DEFAULT_RHYTHM, type TimedEvent, type PerformanceEvent } from '@pianotutor/shared';

/** [t, midis, duración] → eventos de línea temporal. */
const T = (...items: [number, number[], number?][]): TimedEvent[] => items.map(([t, midis, d = 0.5], index) => ({ index, t, tEnd: t + d, midis: [...midis].sort((a, b) => a - b), notes: midis.map((midi) => ({ midi, t, tEnd: t + d })) }));
const S = (...items: [number, number[], number?][]) => new RhythmSession(T(...items));
const BASIC = () => S([1, [60]], [2, [62]], [3, [64]]);

describe('Ritmo: clasificación de cada pulsación', () => {
  it('acierto exacto y dentro de T_ok (±100 ms)', () => {
    const s = BASIC(); expect(s.noteOn(60, 1.0)).toMatchObject({ kind: 'hit', eventIndex: 0, deltaSec: 0 });
    expect(s.noteOn(62, 2.09)).toMatchObject({ kind: 'hit' }); expect(s.noteOn(64, 2.92)).toMatchObject({ kind: 'hit' }); expect(s.hits).toBe(3);
  });
  it('demasiado pronto / tarde: error de tiempo, cerca o lejos, y consume la nota', () => {
    const s = BASIC();
    expect(s.noteOn(60, 0.85)).toMatchObject({ kind: 'timing', direction: 'early', severity: 'near' });
    expect(s.noteOn(62, 2.3)).toMatchObject({ kind: 'timing', direction: 'late', severity: 'far' });
    expect(s.noteOn(64, 2.61)).toMatchObject({ kind: 'timing', direction: 'early', severity: 'far' });
    expect(s.stats).toMatchObject({ timingEarly: 2, timingLate: 1, hits: 0, omissions: 0, noteErrors: 0 }); expect(s.tick(10)).toEqual([]);   // consumidas: no hay omisión además
  });
  it('fuera de toda ventana = nota equivocada (una vez); un error de tiempo NO genera además omisión', () => {
    const s = BASIC(); expect(s.noteOn(60, 1.45)).toMatchObject({ kind: 'wrong' }); expect(s.noteOn(60, 0.5)).toMatchObject({ kind: 'wrong' }); expect(s.stats.noteErrors).toBe(2);
  });
  it('altura incorrecta en el momento: nota equivocada + omisión de la esperada (cada pulsación y cada ausencia, una vez)', () => {
    const s = BASIC(); expect(s.noteOn(61, 1.0).kind).toBe('wrong');
    expect(s.tick(1.39)).toEqual([]); expect(s.tick(1.41)).toEqual([{ kind: 'omission', eventIndex: 0, midi: 60 }]);
    expect(s.stats).toMatchObject({ noteErrors: 1, omissions: 1 }); expect(s.fails).toBe(2); expect(s.statusOf(0)).toBe('omit');
  });
  it('omisión: se emite exactamente al cerrarse la ventana y solo una vez (tick idempotente)', () => {
    const s = BASIC(); expect(s.tick(1.4)).toEqual([]); const o = s.tick(1.4001); expect(o).toHaveLength(1);
    expect(s.tick(1.5)).toEqual([]); expect(s.tick(1.5)).toEqual([]); expect(s.stats.omissions).toBe(1); expect(s.completedEvents).toBe(1);
  });
  it('rendirse: finish() cierra todo lo pendiente', () => { const s = BASIC(); s.noteOn(60, 1); expect(s.finish().map((j) => j.kind)).toEqual(['omission', 'omission']); expect(s.finished).toBe(true); expect(s.progressPercent).toBe(100); });
  it('las ventanas de eventos vecinos no se solapan, aunque estén muy juntos', () => {
    const s = S([1, [60]], [1.2, [62]], [1.25, [64]], [3, [65]]);
    for (let i = 0; i < 3; i++) expect(s.windowOf(i).to).toBeLessThanOrEqual(s.windowOf(i + 1).from + 1e-12);
    expect(s.windowOf(0).to).toBeCloseTo(1.1, 10);   // mitad de la distancia (0,2 s)
  });
  it('notas rápidas: una pulsación va al evento más cercano de su altura', () => {
    const s = S([1, [60]], [1.12, [62]]); expect(s.noteOn(62, 1.1)).toMatchObject({ kind: 'hit', eventIndex: 1 });
  });
});

describe('Ritmo: repetidas, acordes, manos', () => {
  it('notas consecutivas repetidas (E E E): una pulsación por evento; un rebote de <30 ms se ignora sin penalizar', () => {
    const s = S([1, [64]], [2, [64]], [3, [64]]);
    expect(s.noteOn(64, 1.0).kind).toBe('hit'); expect(s.noteOn(64, 1.012).kind).toBe('ignored'); expect(s.noteOn(64, 2.02).kind).toBe('hit'); expect(s.noteOn(64, 3.0).kind).toBe('hit');
    expect(s.stats).toMatchObject({ hits: 3, ignored: 1, noteErrors: 0 }); expect(s.fails).toBe(0);
  });
  it('una repetición real (no rebote) de una nota ya tocada cuenta como nota extra', () => {
    const s = S([1, [64]], [3, [65]]); s.noteOn(64, 1.0); expect(s.noteOn(64, 1.2).kind).toBe('wrong');
  });
  it('acorde completo: cada nota cuenta un acierto y el evento se completa', () => {
    const s = S([1, [60, 64, 67]]); s.noteOn(67, 1.01); s.noteOn(60, 1.0); expect(s.completedEvents).toBe(0); s.noteOn(64, 1.03);
    expect(s.stats.hits).toBe(3); expect(s.completedEvents).toBe(1); expect(s.statusOf(0)).toBe('hit'); expect(s.tick(5)).toEqual([]);
  });
  it('acorde parcial: la nota que falta es UNA omisión; el evento queda «parcial»', () => {
    const s = S([1, [60, 64, 67]]); s.noteOn(60, 1.0); s.noteOn(64, 1.0);
    expect(s.tick(5)).toEqual([{ kind: 'omission', eventIndex: 0, midi: 67 }]); expect([s.hits, s.fails, s.statusOf(0)]).toEqual([2, 1, 'partial']);
  });
  it('cada nota de un acorde se evalúa por separado en el tiempo', () => {
    const s = S([1, [60, 64]]); expect(s.noteOn(60, 1.0).kind).toBe('hit'); expect(s.noteOn(64, 1.3).kind).toBe('timing');
  });
  it('dos manos a la vez: pulsaciones simultáneas de alturas distintas son aciertos independientes', () => {
    const s = S([1, [48, 72]]); expect(s.noteOn(48, 1.0).kind).toBe('hit'); expect(s.noteOn(72, 1.0).kind).toBe('hit'); expect(s.completedEvents).toBe(1);
  });
  it('micrófono: cualquier octava (por clase de nota)', () => {
    const s = S([1, [60]]); expect(s.noteOn(72, 1.0, { pitchClassOnly: true })).toMatchObject({ kind: 'hit', midi: 60 });
    expect(S([1, [60]]).noteOn(73, 1.0, { pitchClassOnly: true }).kind).toBe('wrong');
  });
  it('micrófono con acordes (monofónico): basta una nota, las demás quedan «sin verificar» y NO se cuentan como omisión', () => {
    const s = S([1, [60, 64, 67]]); expect(s.noteOn(64, 1.0, { lenientChord: true }).kind).toBe('hit');
    expect(s.tick(5)).toEqual([]); expect(s.stats).toMatchObject({ hits: 1, unverified: 2, omissions: 0 }); expect(s.completedEvents).toBe(1); expect(s.fails).toBe(0);
  });
  it('entrega tardía: una nota dentro de ventana que llega tras cerrarse corrige la omisión en vez de contar un error extra', () => {
    const s = BASIC(); s.tick(1.5); expect(s.stats.omissions).toBe(1);
    expect(s.noteOn(60, 1.05)).toMatchObject({ kind: 'hit', corrected: true }); expect(s.stats).toMatchObject({ hits: 1, omissions: 0, noteErrors: 0 }); expect(s.completedEvents).toBe(1);
  });
});

describe('Ritmo: duración (solo con Note Off fiable)', () => {
  const L = (d: number) => S([1, [60], d]);
  it('nota mantenida lo suficiente: ok; soltada pronto: corta', () => {
    let s = L(1); s.noteOn(60, 1); expect(s.noteOff(60, 1.9)).toMatchObject({ result: 'ok' });
    s = L(1); s.noteOn(60, 1); expect(s.noteOff(60, 1.3)).toMatchObject({ result: 'short', ratio: expect.closeTo(0.3, 5) }); expect(s.stats.durationShort).toBe(1);
  });
  it('notas largas (> 1 s) tienen más tolerancia (50 %)', () => {
    let s = L(2); s.noteOn(60, 1); expect(s.noteOff(60, 2.1)).toMatchObject({ result: 'ok' });
    s = L(2); s.noteOn(60, 1); expect(s.noteOff(60, 1.9)).toMatchObject({ result: 'short' });
  });
  it('con el pedal pulsado o en notas muy cortas NO se evalúa', () => {
    let s = L(1); s.noteOn(60, 1); expect(s.noteOff(60, 1.05, { sustainDown: true })).toMatchObject({ result: 'skipped' });
    s = L(0.1); s.noteOn(60, 1); expect(s.noteOff(60, 1.01)).toMatchObject({ result: 'skipped' }); expect(s.stats.durationSkipped).toBe(1);
  });
  it('un Note Off sin pulsación juzgada se ignora; la duración no cuenta como fallo', () => {
    const s = L(1); expect(s.noteOff(60, 1.2)).toBeNull(); s.noteOn(60, 1); s.noteOff(60, 1.1); expect(s.fails).toBe(0);
  });
});

describe('Ritmo: progreso, precisión, determinismo', () => {
  it('progreso = eventos resueltos / total (denominador fijo); precisión = aciertos/(aciertos+fallos)', () => {
    const s = BASIC(); s.noteOn(60, 1); expect(s.progressPercent).toBe(33); s.tick(2.5); expect(s.progressPercent).toBe(67); s.finish(); expect(s.progressPercent).toBe(100);
    expect([s.hits, s.fails, s.accuracyPercent]).toEqual([1, 2, 33]);
  });
  it('upcoming indica qué hay que tocar ahora', () => {
    const s = BASIC(); expect(s.upcoming).toEqual({ index: 0, midis: [60] }); s.noteOn(60, 1); expect(s.upcoming).toEqual({ index: 1, midis: [62] });
  });
  it('canción vacía no rompe', () => { const s = new RhythmSession([]); expect([s.progressPercent, s.finished, s.tick(1), s.finish()]).toEqual([0, true, [], []]); });
  it('PROPIEDAD: el resultado no depende de la frecuencia con la que se llame a tick() (500 casos aleatorios)', () => {
    let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let c = 0; c < 500; c++) {
      const n = 3 + Math.floor(rnd() * 6); let t = 1; const evs: [number, number[]][] = [];
      for (let i = 0; i < n; i++) { evs.push([t, rnd() < 0.3 ? [60 + Math.floor(rnd() * 12), 72 + Math.floor(rnd() * 5)] : [60 + Math.floor(rnd() * 12)]]); t += 0.15 + rnd() * 1.2; }
      const presses: { t: number; m: number }[] = [];
      for (const [et, ms] of evs) for (const m of ms) if (rnd() < 0.8) presses.push({ t: et + (rnd() - 0.5) * 0.7, m: rnd() < 0.1 ? m + 1 : m });
      presses.sort((a, b) => a.t - b.t);
      // `ahead` > 0: el reloj va por delante de las pulsaciones (entrega tardía, p. ej. micrófono); < 0: por detrás.
      const run = (step: number, ahead: number) => {
        const s = S(...evs); let now = 0; const log: string[] = [];
        for (const p of presses) { while (now + step < p.t + ahead) { now += step; s.tick(now); } log.push(s.noteOn(p.m, p.t).kind); }
        s.finish(); return JSON.stringify([s.stats, log, s.completedEvents]);
      };
      const ref = run(0.01, -0.45);
      expect(run(0.3, -0.45), `caso ${c}`).toBe(ref); expect(run(0.01, 0.3), `caso ${c} (reloj adelantado)`).toBe(ref); expect(run(0.25, 0.3), `caso ${c} (adelantado, paso grande)`).toBe(ref);
    }
  });
  it('PROPIEDAD: ninguna pulsación se cuenta dos veces (aciertos+timing+ignoradas+equivocadas = pulsaciones)', () => {
    let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let c = 0; c < 200; c++) {
      const s = S([1, [60]], [1.5, [62]], [2.5, [64, 67]], [3, [60]]); const n = 1 + Math.floor(rnd() * 12); let t = 0.8;
      for (let i = 0; i < n; i++) { t += rnd() * 0.5; s.noteOn(58 + Math.floor(rnd() * 12), t); }
      const st = s.stats; expect(st.hits + st.timingEarly + st.timingLate + st.noteErrors + st.ignored).toBe(n);
    }
  });
});

describe('línea temporal', () => {
  const song = buildLegacySong('X', 'C4 D4 E4 F4 G4', { id: 'preloaded-x-0001', genre: 'g', difficulty: 1 });   // 90 BPM: negra = 2/3 s
  it('tiempos desde ticks y tempo; la velocidad escala los segundos reales', () => {
    const t = buildTimeline(song, toPerformance(song)); expect(t.map((e) => +e.t.toFixed(4))).toEqual([0, 0.6667, 1.3333, 2, 2.6667]); expect(t[0]!.tEnd - t[0]!.t).toBeCloseTo(2 / 3, 10);
    expect(buildTimeline(song, toPerformance(song), 0.5)[1]!.t).toBeCloseTo(1.3333, 4);
  });
  it('pulsos con cuenta previa de un compás en tiempos negativos y acento en el primero de cada compás', () => {
    const { beats, countInSec } = buildBeats(song, 1, true); expect(countInSec).toBeCloseTo(4 * 2 / 3, 10);
    expect(beats.slice(0, 4).map((b) => +b.t.toFixed(3))).toEqual([-2.667, -2, -1.333, -0.667]); expect(beats.filter((b) => b.t >= 0 && b.accent).map((b) => +b.t.toFixed(3))).toEqual([0, 2.667]);
    expect(buildBeats(song, 1, false).beats[0]!.t).toBe(0);
  });
  it('índice fraccionario: interpola entre eventos y se queda en los extremos', () => {
    const t = buildTimeline(song, toPerformance(song)); expect(fractionalIndex(t, -5)).toBe(0); expect(fractionalIndex(t, 1.3333 / 2 + 0.6667 / 2 - 0.3333)).toBeCloseTo(1, 1);
    expect(fractionalIndex(t, (t[1]!.t + t[2]!.t) / 2)).toBeCloseTo(1.5, 10); expect(fractionalIndex(t, 99)).toBe(4);
  });
});

describe('Aprendizaje (ampliado en la Fase 3)', () => {
  const ev = (...m: number[]): PerformanceEvent => ({ id: 'x', tickStart: 0, tickEnd: 960, notes: [], midis: m });
  it('antirrebote: la misma tecla dentro de 30 ms no cuenta dos veces', () => {
    const s = new LearningSession([ev(64), ev(64), ev(64)]); expect(s.noteOn(64, { tMs: 1000 }).outcome).toBe('hit'); expect(s.noteOn(64, { tMs: 1012 }).outcome).toBe('ignored'); expect(s.noteOn(64, { tMs: 1400 }).outcome).toBe('hit');
    expect([s.hits, s.misses, s.pos]).toEqual([2, 0, 2]);
  });
  it('acorde con micrófono (monofónico): basta una nota, el resto queda sin verificar', () => {
    const s = new LearningSession([ev(60, 64, 67), ev(62)]); expect(s.noteOn(64, { lenientChord: true }).completedEvent).toBe(true); expect([s.hits, s.unverified, s.pos]).toEqual([1, 2, 1]);
  });
  it('dispersión: un acorde tocado con más separación que la ventana se anota como «arpegiado», sin penalizar', () => {
    const s = new LearningSession([ev(60, 64), ev(60, 64)], { debounceMs: 30, simultaneityMs: 150 });
    s.noteOn(60, { tMs: 1000 }); s.noteOn(64, { tMs: 1050 }); s.noteOn(60, { tMs: 3000 }); s.noteOn(64, { tMs: 3600 });
    expect([s.arpeggiated, s.misses, s.pos]).toEqual([1, 0, 2]);
  });
  it('dos manos: las notas de ambas manos forman un único evento que se completa en cualquier orden', () => {
    const s = new LearningSession([ev(48, 72)]); s.noteOn(72); expect(s.pending).toEqual([48]); expect(s.noteOn(48).finishedSong).toBe(true);
  });
});
