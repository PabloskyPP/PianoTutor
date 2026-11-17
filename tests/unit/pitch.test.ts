import { describe, it, expect } from 'vitest';
import { pitchLegacy } from '../../frontend/src/input/pitchLegacy';

const sine = (hz: number, sr = 44100, n = 2048, amp = 0.3) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

describe('detector heredado (comportamiento original, límites documentados)', () => {
  it('detecta notas dentro de su rango (Do4..Do6) en senoides sintéticas', () => {
    for (const m of [60, 64, 67, 69, 72, 76, 81, 84]) expect(pitchLegacy(sine(hz(m)), 44100), `MIDI ${m}`).toBe(m);
  });
  it('también a 48 kHz', () => expect(pitchLegacy(sine(hz(69), 48000), 48000)).toBe(69));
  it('silencio y ruido muy bajo -> sin detección', () => {
    expect(pitchLegacy(new Float32Array(2048), 44100)).toBe(-1); expect(pitchLegacy(sine(440, 44100, 2048, 0.005), 44100)).toBe(-1);
  });
  it('LIMITACIÓN P4: por debajo de ~200 Hz (Sol3) no se detecta bien', () => {
    expect(pitchLegacy(sine(hz(55)), 44100)).not.toBe(55);
  });
});
