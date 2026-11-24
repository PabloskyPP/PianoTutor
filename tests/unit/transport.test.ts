import { describe, it, expect, vi, afterEach } from 'vitest';
import { Transport } from '../../frontend/src/audio/transport';
import { BeatScheduler } from '../../frontend/src/audio/beats';
import type { Clock } from '../../frontend/src/audio/clock';
import type { Beat } from '@pianotutor/shared';

/** Reloj simulado: el de audio y el de rendimiento avanzan juntos pero pueden tener una desviación/deriva. */
class FakeClock implements Clock {
  audio = 100; perf = 5000; drift = 1;                      // drift: el reloj de rendimiento corre `drift` veces más rápido que el de audio
  advance(sec: number) { this.audio += sec; this.perf += sec * 1000 * this.drift; }
  audioNow() { return this.audio; } perfNow() { return this.perf; }
  perfToAudio(p: number) { return this.audio + (p - this.perf) / 1000 / this.drift; }   // correspondencia instantánea (como getOutputTimestamp)
}
afterEach(() => { vi.useRealTimers(); });

describe('Transport', () => {
  it('cuenta previa: empieza en tiempo negativo y avanza con el reloj de audio', () => {
    const c = new FakeClock(), t = new Transport(c); t.start(-2); expect(t.now()).toBeCloseTo(-2, 10); c.advance(2.5); expect(t.now()).toBeCloseTo(0.5, 10);
  });
  it('pausar y reanudar conserva la posición exacta', () => {
    const c = new FakeClock(), t = new Transport(c); t.start(0); c.advance(3); t.pause(); c.advance(10); expect(t.now()).toBeCloseTo(3, 10); t.resume(); c.advance(1); expect(t.now()).toBeCloseTo(4, 10);
    t.pause(); t.pause(); t.resume(); t.resume(); expect(t.state).toBe('running');
  });
  it('stop vuelve al inicio', () => { const c = new FakeClock(), t = new Transport(c); t.start(-1); c.advance(5); t.stop(); expect(t.state).toBe('stopped'); expect(t.now()).toBe(0); });
  it('una pulsación con marca de rendimiento se sitúa en el tiempo de canción correcto', () => {
    const c = new FakeClock(), t = new Transport(c); t.start(0); const press = c.perf + 500; c.advance(2); expect(t.atPerf(press)).toBeCloseTo(2 - 1.5, 6);
  });
  it('la latencia calibrada se descuenta (+ = la pulsación llegó tarde)', () => {
    const c = new FakeClock(), t = new Transport(c); t.start(0); t.setLatencyMs(80); expect(t.atPerf(c.perf)).toBeCloseTo(-0.08, 10); t.setLatencyMs(-50); expect(t.atPerf(c.perf)).toBeCloseTo(0.05, 10);
  });
  it('NO acumula deriva: 10 minutos con relojes que difieren un 0,1 % siguen dando error < 1 ms', () => {
    const c = new FakeClock(); c.drift = 1.001; const t = new Transport(c); t.start(0);
    for (let i = 0; i < 600; i++) c.advance(1);
    const press = c.perf; c.advance(0.2);   // pulsación hecha 0,2 s antes del instante actual
    expect(Math.abs(t.atPerf(press) - (t.now() - 0.2))).toBeLessThan(0.001);
  });
  it('audioTimeOf: instante de audio para programar un sonido', () => {
    const c = new FakeClock(), t = new Transport(c); t.start(-2); expect(t.audioTimeOf(0)).toBeCloseTo(c.audio + 2, 10);
  });
});

describe('BeatScheduler (metrónomo sobre el reloj de audio)', () => {
  const BEATS: Beat[] = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map((t, i) => ({ t, accent: i % 4 === 0 }));
  const setup = () => {
    vi.useFakeTimers(); const c = new FakeClock(), tr = new Transport(c); const clicks: { at: number; accent: boolean }[] = [];
    const sch = new BeatScheduler(tr, BEATS, { click: (at, accent) => clicks.push({ at, accent }) }, () => c.audioNow());
    return { c, tr, sch, clicks, tick: (sec: number) => { for (let ms = 0; ms < sec * 1000; ms += 25) { c.advance(0.025); vi.advanceTimersByTime(25); } } };
  };
  it('cada pulso se programa una sola vez, en su instante exacto, con acento donde toca', () => {
    const { c, tr, sch, clicks, tick } = setup(); const t0 = c.audio; tr.start(-1.5); sch.start(); tick(4);
    expect(clicks).toHaveLength(8); clicks.forEach((k, i) => expect(k.at).toBeCloseTo(t0 + (BEATS[i]!.t + 1.5), 6)); expect(clicks.map((k) => k.accent)).toEqual(BEATS.map((b) => b.accent)); sch.stop();
  });
  it('pausar y reanudar no repite ni se salta pulsos', () => {
    const { tr, sch, clicks, tick } = setup(); tr.start(-1.5); sch.start(); tick(1.3); tr.pause(); sch.stop(); const n = clicks.length; tick(3); expect(clicks).toHaveLength(n);
    tr.resume(); sch.start(); tick(4); expect(clicks).toHaveLength(8); expect(new Set(clicks.map((k) => k.at.toFixed(4))).size).toBe(8);
  });
  it('stop detiene el temporizador', () => { const { tr, sch } = setup(); tr.start(0); sch.start(); expect(vi.getTimerCount()).toBe(1); sch.stop(); expect(vi.getTimerCount()).toBe(0); });
  it('no programa nada si el transporte no está en marcha', () => { const { sch, clicks, tick } = setup(); sch.start(); tick(1); expect(clicks).toEqual([]); sch.stop(); });
});
