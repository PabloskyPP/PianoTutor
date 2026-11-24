import { describe, it, expect } from 'vitest';
import { LearningSession, type PerformanceEvent } from '@pianotutor/shared';

const ev = (...midis: number[]): PerformanceEvent => ({ id: 'x', tickStart: 0, tickEnd: 960, notes: [], midis: [...midis].sort((a, b) => a - b) });
const S = (...evs: number[][]) => new LearningSession(evs.map((m) => ev(...m)));

describe('modo Aprendizaje (docs/EVALUATION.md)', () => {
  it('nota correcta: acierto, avanza y progreso coherente', () => {
    const s = S([60], [62]); const r = s.noteOn(60);
    expect(r).toMatchObject({ outcome: 'hit', completedEvent: true, finishedSong: false });
    expect([s.hits, s.misses, s.pos, s.progressPercent]).toEqual([1, 0, 1, 50]);
  });
  it('nota incorrecta: fallo, no avanza', () => {
    const s = S([60]); expect(s.noteOn(61).outcome).toBe('miss'); expect([s.hits, s.misses, s.pos]).toEqual([0, 1, 0]);
  });
  it('notas consecutivas repetidas exigen un Note On cada una (E4 E4 E4)', () => {
    const s = S([64], [64], [64]);
    s.noteOn(64); expect(s.pos).toBe(1); s.noteOn(64); expect(s.pos).toBe(2); s.noteOn(64);
    expect(s.finished).toBe(true); expect(s.hits).toBe(3); expect(s.misses).toBe(0);
  });
  it('acorde completo: una unidad de acierto por nota; avanza solo al completarlo, en cualquier orden', () => {
    const s = S([60, 64, 67], [62]);
    expect(s.noteOn(67)).toMatchObject({ outcome: 'hit', completedEvent: false }); expect(s.pos).toBe(0);
    s.noteOn(60); expect(s.pos).toBe(0); expect(s.pending).toEqual([64]);
    expect(s.noteOn(64)).toMatchObject({ completedEvent: true }); expect([s.hits, s.pos]).toEqual([3, 1]);
  });
  it('acorde parcial: queda pendiente, sin fallos ni omisión', () => {
    const s = S([60, 64]); s.noteOn(60); expect([s.pos, s.misses, s.progressPercent]).toEqual([0, 0, 0]);
  });
  it('repetir una nota ya cubierta del acorde se ignora (sin penalización)', () => {
    const s = S([60, 64]); s.noteOn(60); expect(s.noteOn(60).outcome).toBe('ignored'); expect([s.hits, s.misses]).toEqual([1, 0]);
  });
  it('nota ajena durante un acorde = un fallo', () => { const s = S([60, 64]); s.noteOn(60); s.noteOn(70); expect([s.hits, s.misses]).toEqual([1, 1]); });
  it('terminada: finishedSong una sola vez y entradas posteriores no cambian contadores', () => {
    const s = S([60]); expect(s.noteOn(60).finishedSong).toBe(true);
    expect(s.noteOn(60).outcome).toBe('finished'); expect([s.hits, s.misses, s.progressPercent, s.accuracyPercent]).toEqual([1, 0, 100, 100]);
  });
  it('precisión = aciertos/(aciertos+fallos)', () => { const s = S([60], [62]); s.noteOn(61); s.noteOn(60); s.noteOn(62); expect(s.accuracyPercent).toBe(67); });
  it('micrófono heredado: cualquier octava, sin contar fallos', () => {
    const s = S([64]); expect(s.noteOn(52, { pitchClassOnly: true, countMisses: false }).outcome).toBe('hit');
    const t = S([64]); expect(t.noteOn(50, { pitchClassOnly: true, countMisses: false }).outcome).toBe('miss'); expect(t.misses).toBe(0);
  });
  it('reset devuelve todo al inicio', () => { const s = S([60], [62]); s.noteOn(60); s.noteOn(1); s.reset(); expect([s.pos, s.hits, s.misses, s.pending]).toEqual([0, 0, 0, [60]]); });
  it('canción vacía no rompe', () => { const s = S(); expect(s.finished).toBe(true); expect(s.progressPercent).toBe(0); expect(s.noteOn(60).outcome).toBe('finished'); });
});
