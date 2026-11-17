import { describe, it, expect } from 'vitest';
import { buildLegacySong, validateSong, toPerformance, ticksToSeconds, secondsToTicks, parsePitch, makePitch, noteNameEs, diatonicStep, type Song, PPQ } from '@pianotutor/shared';

const base = () => buildLegacySong('Prueba', 'C4 D4 E4 F4 G4', { id: 'preloaded-prueba-1', genre: 'X', difficulty: 3 });
const bad = (mut: (s: any) => void) => { const s: any = structuredClone(base()); mut(s); return validateSong(s); };

describe('pitch', () => {
  it('MIDI y nombres', () => {
    expect(parsePitch('C4').midi).toBe(60); expect(parsePitch('A4').midi).toBe(69); expect(parsePitch('D#5').midi).toBe(75); expect(parsePitch('Bb3').midi).toBe(58);
    expect(noteNameEs(61)).toBe('Do♯'); expect(noteNameEs(71)).toBe('Si');
    expect(diatonicStep(parsePitch('C4'))).toBe(28); expect(diatonicStep(parsePitch('E4'))).toBe(30);
  });
  it('rechaza entradas inválidas con error controlado', () => { expect(() => parsePitch('H4')).toThrow(/no válida/); expect(() => parsePitch('')).toThrow(); });
});

describe('esquema e invariantes', () => {
  it('una canción migrada es válida', () => expect(validateSong(base()).ok).toBe(true));
  it('rechaza midi que no coincide con step/alter/octave', () => expect(bad((s) => { s.parts[0].staves[0].events[0].pitches[0].pitch.midi = 61; }).ok).toBe(false));
  it('rechaza dificultad fuera de 1..10 y manos distintas de 1/2', () => {
    expect(bad((s) => { s.difficulty = 11; }).ok).toBe(false); expect(bad((s) => { s.difficulty = 0; }).ok).toBe(false);
    expect(bad((s) => { s.difficulty = 2.5; }).ok).toBe(false); expect(bad((s) => { s.hands = 3; }).ok).toBe(false);
  });
  it('rechaza evento que cruza el final de su compás', () => expect(bad((s) => { s.parts[0].staves[0].events[3].durationTicks = 1920; }).ok).toBe(false));
  it('rechaza solapamiento en la misma voz', () => expect(bad((s) => { s.parts[0].staves[0].events[1].tick = 100; }).ok).toBe(false));
  it('rechaza ligadura sin continuación', () => expect(bad((s) => { s.parts[0].staves[0].events[0].pitches[0].tieNext = true; s.parts[0].staves[0].events[1].pitches[0].pitch = makePitch('F', 0, 4); }).ok).toBe(false));
  it('rechaza tipo/alturas incoherentes (nota sin altura)', () => expect(bad((s) => { s.parts[0].staves[0].events[0].pitches = []; }).ok).toBe(false));
  it('rechaza id con caracteres peligrosos y schemaVersion desconocida', () => {
    expect(bad((s) => { s.id = '../etc/passwd'; }).ok).toBe(false); expect(bad((s) => { s.schemaVersion = 2; }).ok).toBe(false);
  });
  it('rechaza basura y null sin lanzar', () => { expect(validateSong(null).ok).toBe(false); expect(validateSong('x').ok).toBe(false); expect(validateSong({}).ok).toBe(false); });
});

describe('proyección de interpretación', () => {
  it('fusiona ligaduras entre compases en una sola nota con duración real', () => {
    const s: Song = base();
    const ev = s.parts[0]!.staves[0]!.events;
    // E4 (idx 2) ligada con el E4 del compás siguiente: sustituimos idx 3 (F4) y idx 4 (G4) por una ligadura 3840 -> 4 ticks
    ev[3]!.pitches[0] = { pitch: parsePitch('E4'), tiePrev: true }; ev[2]!.pitches[0]!.tieNext = true;
    ev[4]!.pitches[0] = { pitch: parsePitch('G4') };
    const perf = toPerformance(s);
    expect(perf).toHaveLength(4);
    expect(perf[2]).toMatchObject({ tickStart: 2 * PPQ, tickEnd: 4 * PPQ, midis: [64] });
  });
  it('agrupa notas simultáneas de dos pentagramas en un evento', () => {
    const s: any = structuredClone(base());
    s.hands = 2;
    s.parts[0].staves.push({ index: 1, clef: 'F', hand: 'left', events: [{ id: 'l0', type: 'note', pitches: [{ pitch: parsePitch('C3') }], tick: 0, durationTicks: 3840, voice: 1, measure: 0 }] });
    const v = validateSong(s); expect(v.ok).toBe(true);
    const perf = toPerformance(s);
    expect(perf[0]!.midis).toEqual([48, 60]); expect(perf[0]!.notes.map((n) => n.staff).sort()).toEqual([0, 1]); expect(perf).toHaveLength(5);
  });
  it('ignora silencios', () => {
    const s: any = structuredClone(base()); s.parts[0].staves[0].events[1] = { id: 'r', type: 'rest', pitches: [], tick: PPQ, durationTicks: PPQ, voice: 1, measure: 0 };
    expect(validateSong(s).ok).toBe(true); expect(toPerformance(s)).toHaveLength(4);
  });
});

describe('mapa de tempo', () => {
  it('90 BPM: una negra = 2/3 s', () => expect(ticksToSeconds(PPQ, [{ tick: 0, bpm: 90 }], PPQ)).toBeCloseTo(2 / 3, 10));
  it('cambio de tempo y ida/vuelta', () => {
    const map = [{ tick: 0, bpm: 120 }, { tick: 4 * PPQ, bpm: 60 }];
    expect(ticksToSeconds(4 * PPQ, map, PPQ)).toBeCloseTo(2, 10); expect(ticksToSeconds(5 * PPQ, map, PPQ)).toBeCloseTo(3, 10);
    for (const t of [0, 1000, 4 * PPQ, 6 * PPQ + 123]) expect(secondsToTicks(ticksToSeconds(t, map, PPQ), map, PPQ)).toBeCloseTo(t, 6);
  });
});
