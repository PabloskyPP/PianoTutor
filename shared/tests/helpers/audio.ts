/** Síntesis de señales de prueba. Son SINTÉTICAS: validan el algoritmo, no su comportamiento con un piano real. */
export const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
let seed = 99; export const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
export const reseed = (s: number) => { seed = s; };

export interface Timbre { amps: number[]; B: number; tau: number }   // amplitudes de armónicos, inarmonicidad, constante de decaimiento (s)
export const SINE: Timbre = { amps: [1], B: 0, tau: 1e9 };
export const PIANO: Timbre = { amps: [1, 0.6, 0.4, 0.3, 0.2, 0.12, 0.08], B: 0.0004, tau: 0.5 };
export const WEAK_FUND: Timbre = { amps: [0.2, 1, 0.6, 0.4, 0.25, 0.15], B: 0.0004, tau: 0.5 };   // fundamental débil (graves de piano)

/** Una nota que empieza en t0 (s); se suma a `buf`. */
export function addNote(buf: Float32Array, sr: number, midi: number, t0: number, dur: number, tm: Timbre = PIANO, amp = 0.3) {
  const f0 = hz(midi), start = Math.round(t0 * sr), len = Math.round(dur * sr);
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / sr, env = Math.min(1, t / 0.003) * Math.exp(-t / tm.tau);
    let v = 0;
    tm.amps.forEach((a, k) => { const n = k + 1, f = n * f0 * Math.sqrt(1 + tm.B * n * n); if (f < sr / 2) v += a * Math.sin(2 * Math.PI * f * t); });
    buf[start + i] = (buf[start + i] ?? 0) + amp * env * v;
  }
}
export const noise = (buf: Float32Array, level: number) => { for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] ?? 0) + level * (rnd() * 2 - 1); };
export const frameOf = (midi: number, sr = 44100, n = 2048, tm: Timbre = SINE, t0 = 0.05) => { const b = new Float32Array(Math.round(sr * 0.5)); addNote(b, sr, midi, 0, 0.5, tm); return b.subarray(Math.round(t0 * sr), Math.round(t0 * sr) + n); };
