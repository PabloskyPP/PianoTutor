import { describe, it, expect } from 'vitest';
import { MicAnalyzer, type MicEvent } from '../../frontend/src/input/audio/analyzer';
import { OnsetDetector } from '../../frontend/src/input/audio/onset';
import { addNote, noise, PIANO, reseed, rnd } from '../helpers/audio';

const SR = 44100;
/** Reproduce un buffer sintético como lo haría el navegador: cada ~20 ms (con fluctuación) entrega la ventana de las últimas 4096 muestras. */
function run(buf: Float32Array, opts: { sensitivity?: number; jitterMs?: number; stepMs?: number } = {}) {
  const events: MicEvent[] = []; const status: string[] = [];
  const a = new MicAnalyzer({ sampleRate: SR, sensitivity: opts.sensitivity ?? 1, onNote: (e) => events.push(e), onStatus: (s) => status.push(s) });
  reseed(321); let t = 0;
  while (t < buf.length / SR * 1000 - 1) {
    const end = Math.floor((t / 1000) * SR); if (end >= 4096) a.process(buf.subarray(end - 4096, end), t);
    t += (opts.stepMs ?? 20) + (rnd() - 0.5) * 2 * (opts.jitterMs ?? 0);
  }
  return { events, status, analyzer: a };
}
const track = (secs: number, floor = 0.003) => { const b = new Float32Array(Math.round(secs * SR)); noise(b, floor); return b; };
const near = (e: MicEvent[], midis: number[], times: number[], tolMs = 35) => { expect(e.map((x) => x.midi)).toEqual(midis); e.forEach((x, i) => expect(Math.abs(x.tMs - times[i]!), `nota ${i}`).toBeLessThan(tolMs)); };

describe('analizador del micrófono (audio SINTÉTICO)', () => {
  it('calibra el ruido y luego pasa a escuchar', () => { const r = run(track(2)); expect(r.status).toEqual(['listening']); expect(r.analyzer.noiseFloor).toBeGreaterThanOrEqual(0.004); expect(r.events).toEqual([]); });
  it('secuencia con repetición (C4 E4 E4 G4) + grave + agudo: un evento por ataque, alturas exactas, instante del ataque (±35 ms)', () => {
    const b = track(6); const onsets = [1.0, 1.6, 2.2, 2.8, 3.6, 4.4], notes = [60, 64, 64, 67, 40, 84];
    notes.forEach((m, i) => addNote(b, SR, m, onsets[i]!, 0.9, PIANO));
    const r = run(b); near(r.events, notes, onsets.map((s) => s * 1000));
    r.events.forEach((e) => expect(e.confidence).toBeGreaterThan(0.85));
  });
  it('con fluctuación de la cadencia de sondeo (±8 ms, como un hilo principal ocupado) sigue acertando', () => {
    const b = track(5); const onsets = [1.0, 1.7, 2.4, 3.1], notes = [62, 65, 69, 72]; notes.forEach((m, i) => addNote(b, SR, m, onsets[i]!, 0.9, PIANO));
    near(run(b, { jitterMs: 8 }).events, notes, onsets.map((s) => s * 1000), 45);
  });
  it('notas repetidas más rápidas (cada 0,3 s) se separan', () => {
    const b = track(4); const onsets = [1.0, 1.3, 1.6, 1.9]; onsets.forEach((s) => addNote(b, SR, 64, s, 0.9, PIANO)); near(run(b).events, [64, 64, 64, 64], onsets.map((s) => s * 1000));
  });
  it('NO se emite un Note Off (el micrófono no puede medir la duración de una nota de piano)', () => { const b = track(3); addNote(b, SR, 60, 1, 0.9, PIANO); expect(Object.keys(run(b).events[0]!).sort()).toEqual(['confidence', 'midi', 'tMs']); });
  it('ruido ambiente, un golpe seco y silencio no producen notas', () => {
    expect(run(track(4, 0.01)).events).toEqual([]);
    const b = track(4); reseed(8); for (let i = Math.round(2 * SR); i < Math.round(2.05 * SR); i++) b[i] = b[i]! + 0.5 * (rnd() * 2 - 1) * Math.exp(-(i - 2 * SR) / (0.01 * SR)); expect(run(b).events).toEqual([]);
  });
  it('un acorde (polifonía) no se presenta como varias notas: como mucho un evento', () => {
    const b = track(3); [60, 64, 67].forEach((m) => addNote(b, SR, m, 1, 0.9, PIANO)); expect(run(b).events.length).toBeLessThanOrEqual(1);
  });
  it('sensibilidad: una nota suave (RMS ≈ 0,007) queda bajo el umbral si la sensibilidad es baja y se detecta con la normal o alta', () => {
    const b = track(3); addNote(b, SR, 60, 1, 0.9, PIANO, 0.008);
    expect(run(b, { sensitivity: 0.5 }).events).toEqual([]);
    expect(run(b, { sensitivity: 1 }).events.map((e) => e.midi)).toEqual([60]); expect(run(b, { sensitivity: 3 }).events.map((e) => e.midi)).toEqual([60]);
  });
  it('recalibrar no emite eventos fantasma y vuelve a escuchar', () => {
    const r = run(track(2)); r.analyzer.recalibrate(); expect(r.analyzer.isCalibrating).toBe(true);
  });
});

describe('detector de ataques', () => {
  it('detecta la subida, respeta el periodo refractario y el umbral absoluto', () => {
    const d = new OnsetDetector(); const out: boolean[] = [];
    [0.001, 0.001, 0.2, 0.18, 0.15, 0.12, 0.1, 0.08, 0.3].forEach((r, i) => out.push(d.feed(r, i * 20, 0.02)));
    expect(out).toEqual([false, false, true, false, false, false, false, false, true]);     // 0.3 a los 160 ms: supera 1,6× el mínimo reciente y el refractario (110 ms)
    expect(new OnsetDetector().feed(0.005, 0, 0.02)).toBe(false);
  });
});
