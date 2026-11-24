/**
 * Detector de altura monofónico: NSDF de McLeod calculado con FFT, elección del primer máximo relevante e interpolación parabólica.
 * Sustituye al detector original (autocorrelación con retardo entero, rango ≈ Sol♯3–Do6).
 * LIMITACIÓN: es MONOFÓNICO. Con varias notas a la vez devuelve, como mucho, una sola (la dominante) y no es fiable.
 * Se valida con señales sintéticas (tests/unit/pitch-nsdf.test.ts); la precisión con un piano acústico real NO está medida.
 */
import { fft } from './fft';

export interface PitchResult { hz: number; midi: number; clarity: number }
export interface PitchOptions { minHz?: number; maxHz?: number; threshold?: number; clarityMin?: number }
export const MIC_RANGE = { minHz: 75, maxHz: 2300 };   // ≈ Re♯2 … Do♯7 (objetivo: Mi2–Do7)

let scratch: { n: number; re: Float64Array; im: Float64Array } | undefined;

export function detectPitch(frame: Float32Array, sampleRate: number, opt: PitchOptions = {}): PitchResult | null {
  const { minHz = MIC_RANGE.minHz, maxHz = MIC_RANGE.maxHz, threshold = 0.9, clarityMin = 0.85 } = opt;
  const N = frame.length;
  let size = 1; while (size < 2 * N) size <<= 1;
  if (!scratch || scratch.n !== size) scratch = { n: size, re: new Float64Array(size), im: new Float64Array(size) };
  const { re, im } = scratch;
  re.fill(0); im.fill(0);
  let mean = 0; for (let i = 0; i < N; i++) mean += frame[i]!; mean /= N;           // quita el componente continuo
  for (let i = 0; i < N; i++) re[i] = frame[i]! - mean;
  fft(re, im);
  for (let i = 0; i < size; i++) { re[i] = re[i]! * re[i]! + im[i]! * im[i]!; im[i] = 0; }
  fft(re, im, true);                                                                  // re[τ] = autocorrelación

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz)), maxLag = Math.min(N - 2, Math.ceil(sampleRate / minHz));
  const x2 = new Float64Array(N + 1); for (let i = 0; i < N; i++) { const v = frame[i]! - mean; x2[i + 1] = x2[i]! + v * v; }
  const nsdf = new Float64Array(maxLag + 2);
  for (let tau = 0; tau <= maxLag + 1 && tau < N; tau++) {
    const m = x2[N - tau]! + (x2[N]! - x2[tau]!);                                      // Σ x_j² + x_{j+τ}²
    nsdf[tau] = m > 1e-12 ? (2 * re[tau]!) / m : 0;
  }
  // Máximos clave: el mayor de cada tramo positivo entre cruces por cero.
  const peaks: number[] = []; let tau = 1;
  while (tau < maxLag && nsdf[tau]! > 0) tau++;                                        // salta el lóbulo inicial
  while (tau < maxLag) {
    while (tau < maxLag && nsdf[tau]! <= 0) tau++;
    let best = -1, bv = -Infinity;
    while (tau < maxLag && nsdf[tau]! > 0) { if (nsdf[tau]! > bv) { bv = nsdf[tau]!; best = tau; } tau++; }
    if (best >= minLag && best > 0) peaks.push(best);
  }
  if (!peaks.length) return null;
  const top = Math.max(...peaks.map((p) => nsdf[p]!));
  const chosen = peaks.find((p) => nsdf[p]! >= threshold * top);
  if (chosen === undefined) return null;
  const a = nsdf[chosen - 1]!, b = nsdf[chosen]!, c = nsdf[chosen + 1]!;
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
  const lag = chosen + Math.max(-1, Math.min(1, shift));
  const clarity = b - 0.25 * (a - c) * shift;
  if (clarity < clarityMin) return null;
  const hz = sampleRate / lag;
  return { hz, midi: 69 + 12 * Math.log2(hz / 440), clarity };
}
