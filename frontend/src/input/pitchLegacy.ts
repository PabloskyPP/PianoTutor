/**
 * Detector de altura del programa original (autocorrelación), portado SIN cambios de algoritmo en la Fase 1.
 * Limitaciones conocidas (docs/AUDIO_INPUT.md): rango ~200–1100 Hz (≈ Sol♯3–Do6), lag entero sin
 * interpolación (±20 cents a 1 kHz), monofónico, sin detección de ataque. Se sustituye en la Fase 3.
 * Devuelve el número MIDI o -1 si no hay señal fiable.
 */
export function pitchLegacy(b: Float32Array, sr: number): number {
  let r = 0; for (const x of b) r += x * x;
  if (Math.sqrt(r / b.length) < 0.012) return -1;
  const lo = Math.floor(sr / 1100), hi = Math.floor(sr / 200), c: number[] = [];
  for (let l = lo; l <= hi; l++) {
    let s = 0, e = 0;
    for (let i = 0; i < b.length - hi; i++) { s += b[i]! * b[i + l]!; e += b[i]! * b[i]!; }
    c[l] = s / (e || 1);
  }
  let mx = 0; for (let l = lo; l <= hi; l++) if (c[l]! > mx) mx = c[l]!;
  if (mx < 0.5) return -1;
  for (let l = lo + 1; l < hi; l++) if (c[l]! >= mx * 0.9 && c[l]! > c[l - 1]! && c[l]! >= c[l + 1]!) return Math.round(69 + 12 * Math.log2(sr / l / 440));
  return -1;
}
