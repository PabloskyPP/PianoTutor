import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { importFile, draftToSong, songStats, toPerformance, validateSong, type ImportOptions } from '@pianotutor/shared';

const dir = path.resolve(__dirname, '../fixtures');
const load = (n: string) => new Uint8Array(fs.readFileSync(path.join(dir, n)));
const song = (n: string, hands: 1 | 2, opt: ImportOptions = {}) => draftToSong(importFile(n, load(n), { hands, ...opt }), { id: 'imported-fixture-0001', title: 'F', genre: 'G', hands, difficulty: 1, now: '2026-11-18T00:00:00.000Z', fileName: n, storedAs: 'x' });

describe('ficheros de ejemplo (tests/fixtures)', () => {
  it('MusicXML monofónico: 4 compases, silencio, tempo 96', () => {
    const s = song('escala-do-mayor.musicxml', 1); expect(validateSong(s).ok).toBe(true);
    expect(songStats(s)).toMatchObject({ measures: 4, notes: 11, staves: 1, bpm: 96, lowMidi: 60, highMidi: 72 }); expect(s.parts[0]!.staves[0]!.events.some((e) => e.type === 'rest')).toBe(true);
  });
  it('MusicXML a dos manos con acordes, ligadura y alteraciones', () => {
    const s = song('estudio-dos-manos.musicxml', 2); const st = songStats(s);
    expect(st).toMatchObject({ measures: 3, staves: 2, hasChords: true, bpm: 80 });
    const perf = toPerformance(s); expect(perf[0]!.midis).toEqual([48, 72, 76, 79]);      // Do3 (izq.) + acorde Do5-Mi5-Sol5 (der.) a la vez
    const a4 = perf.flatMap((e) => e.notes).find((n) => n.pitch.midi === 69)!; expect(a4.tickEnd - a4.tickStart).toBe(2 * 1920);   // La4: blanca + blanca ligadas entre compases
    expect(perf.some((e) => e.midis.includes(66))).toBe(true);                             // Fa♯4 presente
  });
  it('.mxl = mismo contenido que su equivalente en texto', () => {
    const s = song('escala-do-mayor.mxl', 1); expect(songStats(s)).toMatchObject({ measures: 2, notes: 5 });
  });
  it('MIDI monofónico con silencio y tempo', () => {
    const s = song('melodia-monofonica.mid', 1); expect(songStats(s)).toMatchObject({ notes: 8, bpm: 100, measures: 4 }); expect(toPerformance(s).map((e) => e.midis[0])).toEqual([60, 62, 64, 65, 67, 65, 64, 60]);
  });
  it('MIDI a dos pistas → dos manos; con una mano se combinan', () => {
    const two = song('dos-manos.mid', 2); expect(songStats(two).staves).toBe(2); expect(two.parts[0]!.staves[0]!.events.find((e) => e.type === 'note')!.pitches[0]!.pitch.midi).toBe(72);
    expect(songStats(song('dos-manos.mid', 1)).staves).toBe(1);
  });
  it('MIDI con acorde, duraciones variadas y silencio', () => {
    const s = song('acordes-duraciones.mid', 1); const st = songStats(s); expect(st.hasChords).toBe(true); expect(toPerformance(s)[0]!.midis).toEqual([60, 64, 67]);
  });
  it('los inválidos se rechazan con ImportError (sin crash)', () => {
    for (const n of ['invalido-truncado.musicxml', 'no-es-midi.mid']) expect(() => importFile(n, load(n), {})).toThrow(expect.objectContaining({ name: 'ImportError' }));
  });
});
