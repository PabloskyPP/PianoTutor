/** Duraciones notables (figura + puntillo) y ortografía de alturas. Compartido por importación, vista y (futuro) editor. */
import { PPQ } from '../model/schema';
import { makePitch, type Alter, type Pitch, type Step } from '../model/pitch';

export type VexDuration = 'w' | 'h' | 'q' | '8' | '16' | '32' | '64';
export interface Notatable { ticks: number; vex: VexDuration; dots: 0 | 1 }

/** De mayor a menor. Se excluyen los dobles puntillos. */
export const NOTATABLE: readonly Notatable[] = [
  { ticks: 4 * PPQ, vex: 'w', dots: 0 }, { ticks: 3 * PPQ, vex: 'h', dots: 1 }, { ticks: 2 * PPQ, vex: 'h', dots: 0 },
  { ticks: 1.5 * PPQ, vex: 'q', dots: 1 }, { ticks: PPQ, vex: 'q', dots: 0 }, { ticks: PPQ * 0.75, vex: '8', dots: 1 },
  { ticks: PPQ / 2, vex: '8', dots: 0 }, { ticks: PPQ * 0.375, vex: '16', dots: 1 }, { ticks: PPQ / 4, vex: '16', dots: 0 },
  { ticks: PPQ * 0.1875, vex: '32', dots: 1 }, { ticks: PPQ / 8, vex: '32', dots: 0 },
  { ticks: PPQ * 0.09375, vex: '64', dots: 1 }, { ticks: PPQ / 16, vex: '64', dots: 0 },
];

export const notatable = (ticks: number): Notatable | undefined => NOTATABLE.find((n) => n.ticks === ticks);

/**
 * Parte una duración en valores notables (voraz). `unit` (por defecto 60 = 64.ª) evita restos fuera de rejilla.
 * `approx` es true si quedó un resto que no es múltiplo de `unit` (solo ocurre con duraciones no cuantizadas).
 */
export function splitNotatable(ticks: number, unit = PPQ / 16): { parts: Notatable[]; approx: boolean } {
  const parts: Notatable[] = []; let rest = ticks;
  const usable = NOTATABLE.filter((n) => n.ticks % unit === 0);
  while (rest >= unit) {
    const n = usable.find((x) => x.ticks <= rest);
    if (!n) break;
    parts.push(n); rest -= n.ticks;
  }
  return { parts, approx: rest > 0 };
}

const SHARP_SPELL: [Step, Alter][] = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
const FLAT_SPELL: [Step, Alter][] = [['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0]];

/**
 * Ortografía desde un número MIDI: sostenidos si la armadura tiene sostenidos (o ninguna), bemoles si tiene bemoles.
 * LIMITACIÓN: no distingue Fa♯/Sol♭ por contexto armónico; en armaduras de 6–7 alteraciones puede ser imprecisa.
 */
export function spellMidi(midi: number, fifths: number): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const [step, alter] = (fifths < 0 ? FLAT_SPELL : SHARP_SPELL)[pc]!;
  let octave = Math.floor(midi / 12) - 1;
  return makePitch(step, alter, octave);
}

/** Alteración que la armadura aplica a cada nota (p. ej. fifths=2 → F y C sostenidos). */
export function keyAlterations(fifths: number): Record<Step, Alter> {
  const sharps: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const out: Record<Step, Alter> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (fifths > 0) sharps.slice(0, fifths).forEach((s) => { out[s] = 1; });
  if (fifths < 0) [...sharps].reverse().slice(0, -fifths).forEach((s) => { out[s] = -1; });
  return out;
}

const MAJOR_BY_FIFTHS: Record<number, string> = { [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#' };
/** Nombre de la tonalidad mayor con esa armadura (VexFlow usa solo la armadura, el modo no cambia las alteraciones). */
export const majorKeyName = (fifths: number): string => MAJOR_BY_FIFTHS[fifths] ?? 'C';
