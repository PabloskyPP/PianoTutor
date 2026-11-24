/** Alturas: representación internacional (C4 = MIDI 60) y nombres en español para la interfaz. */
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type Alter = -2 | -1 | 0 | 1 | 2;
export interface Pitch { midi: number; step: Step; alter: Alter; octave: number }

export const STEP_SEMITONE: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Posición diatónica dentro de la octava (C=0 … B=6). */
export const STEP_INDEX: Record<Step, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const STEPS: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export const NOTE_NAMES_ES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

export function midiOf(step: Step, alter: number, octave: number): number {
  return 12 * (octave + 1) + STEP_SEMITONE[step] + alter;
}

/** Nombre español de una altura MIDI (con sostenidos). */
export function noteNameEs(midi: number): string {
  return NOTE_NAMES_ES[((midi % 12) + 12) % 12]!;
}

export function makePitch(step: Step, alter: Alter, octave: number): Pitch {
  return { midi: midiOf(step, alter, octave), step, alter, octave };
}

/** Parsea "C4", "D#5", "Bb3". Lanza Error con mensaje claro si es inválido. */
export function parsePitch(text: string): Pitch {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(text.trim());
  if (!m) throw new Error(`Altura no válida: "${text}"`);
  const alter = (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) as Alter;
  return makePitch(m[1] as Step, alter, Number(m[3]));
}

/** Posición diatónica absoluta (octava*7 + índice). Es lo que usa el pentagrama (Do4 = 28). */
export function diatonicStep(p: Pick<Pitch, 'step' | 'octave'>): number {
  return p.octave * 7 + STEP_INDEX[p.step];
}

/** Deletrea un MIDI con sostenidos (para entradas que no traen ortografía). */
export function pitchFromMidiSharp(midi: number): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const table: [Step, Alter][] = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
  const [step, alter] = table[pc]!;
  return makePitch(step, alter, Math.floor(midi / 12) - 1);
}
export { STEPS };
