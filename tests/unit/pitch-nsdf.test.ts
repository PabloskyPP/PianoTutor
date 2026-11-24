import { describe, it, expect } from 'vitest';
import { detectPitch } from '../../frontend/src/input/audio/pitch';
import { fft } from '../../frontend/src/input/audio/fft';
import { frameOf, SINE, PIANO, WEAK_FUND, reseed, rnd, noise, addNote } from '../helpers/audio';

const sweep = (tm: typeof PIANO, lo: number, hi: number, sr: number, n = 2048) => {
  const bad: number[] = []; let maxCents = 0;
  for (let m = lo; m <= hi; m++) { const r = detectPitch(frameOf(m, sr, n, tm), sr); if (!r || Math.round(r.midi) !== m) bad.push(m); else maxCents = Math.max(maxCents, Math.abs((r.midi - m) * 100)); }
  return { bad, maxCents };
};

describe('FFT', () => {
  it('la inversa recupera la señal y un seno cae en su bin', () => {
    const n = 64, re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 5 * i) / n);
    const orig = Float64Array.from(re); fft(re, im); const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]!)); expect(mag.indexOf(Math.max(...mag.slice(0, 32)))).toBe(5);
    fft(re, im, true); for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(orig[i]!, 9);
  });
});

describe('detector de altura NSDF (señales SINTÉTICAS)', () => {
  it('senoides Mi2–Do7 (44,1 y 48 kHz): todas correctas, error < 1 cent', () => {
    for (const sr of [44100, 48000]) { const r = sweep(SINE, 40, 96, sr); expect(r.bad, `sr ${sr}`).toEqual([]); expect(r.maxCents).toBeLessThan(1); }
  });
  it('timbre tipo piano con inarmonicidad: todas correctas, error < 10 cents', () => {
    for (const sr of [44100, 48000]) { const r = sweep(PIANO, 40, 96, sr); expect(r.bad).toEqual([]); expect(r.maxCents).toBeLessThan(10); }
  });
  it('fundamental débil en graves (sin errores de octava en Mi2–Do6)', () => { const r = sweep(WEAK_FUND, 40, 84, 44100); expect(r.bad).toEqual([]); });
  it('ventana de 4096 también', () => { expect(sweep(PIANO, 40, 96, 44100, 4096).bad).toEqual([]); });
  it('rango anterior (original: Sol♯3–Do6) ampliado: Mi2 y Do7 se detectan, antes imposible', () => {
    expect(detectPitch(frameOf(40, 44100, 2048, PIANO), 44100)!.midi).toBeCloseTo(40, 0); expect(detectPitch(frameOf(96, 44100, 2048, PIANO), 44100)!.midi).toBeCloseTo(96, 0);
  });
  it('silencio, ruido blanco y componente continuo → sin detección (0 falsos positivos en 200 ruidos)', () => {
    expect(detectPitch(new Float32Array(2048), 44100)).toBeNull(); reseed(5); let fp = 0;
    for (let i = 0; i < 200; i++) { const b = new Float32Array(2048); noise(b, 0.05 + rnd() * 0.2); if (detectPitch(b, 44100)) fp++; } expect(fp).toBe(0);
    expect(detectPitch(new Float32Array(2048).fill(0.4), 44100)).toBeNull();
  });
  it('un acorde NO se descompone: no lanza y no se presenta como fiable (devuelve nada o una sola nota)', () => {
    const b = new Float32Array(22050); [60, 64, 67].forEach((m) => addNote(b, 44100, m, 0, 0.5, PIANO));
    const r = detectPitch(b.subarray(2000, 4048), 44100); expect(r === null || typeof r.midi === 'number').toBe(true);
  });
  it('no es caro: una detección de 2048 muestras tarda < 20 ms (el analizador la ejecuta solo tras un ataque)', () => {
    const f = frameOf(60, 44100, 2048, PIANO); const t0 = performance.now(); for (let i = 0; i < 50; i++) detectPitch(f, 44100); expect((performance.now() - t0) / 50).toBeLessThan(20);
  });
});
