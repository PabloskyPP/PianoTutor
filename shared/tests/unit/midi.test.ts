import { describe, it, expect } from 'vitest';
import { importFile, draftToSong, songStats, toPerformance, validateSong, PPQ, type ImportDraft } from '@pianotutor/shared';
import { buildMidi, seq, type MEv } from '../helpers/builders';

const Q = 480;  // ticks por negra del archivo de prueba (PPQ del modelo = 960)
const imp = (tracks: MEv[][], hands?: 1 | 2, midi = {}, ppq = Q) => importFile('t.mid', buildMidi(tracks, ppq), { hands, midi });
const toSong = (d: ImportDraft, hands: 1 | 2 = 1) => draftToSong(d, { id: 'imported-test-0001', title: 'T', genre: 'G', hands, difficulty: 3, now: '2026-11-18T00:00:00.000Z', fileName: 't.mid', storedAs: 'imports/t' });
const evs = (d: ImportDraft, staff = 0) => d.parts[0]!.staves[staff]!.events;
const brief = (d: ImportDraft, staff = 0) => evs(d, staff).filter((e) => e.voice === 1).map((e) => [e.type === 'rest' ? 'r' : e.pitches.map((p) => p.pitch.midi).join('+'), e.tick, e.durationTicks]);

describe('MIDI monofónico y duraciones', () => {
  it('cuatro negras: alturas, tiempos y duraciones exactos; 120 BPM por defecto avisado', () => {
    const d = imp([[{ dt: 0, kind: 'tempo', bpm: 120 }, ...seq([[60, Q], [62, Q], [64, Q], [65, Q]])]]);
    expect(brief(d)).toEqual([['60', 0, 960], ['62', 960, 960], ['64', 1920, 960], ['65', 2880, 960]]);
    expect(d.tempoMap).toEqual([{ tick: 0, bpm: 120 }]); expect(d.measures).toHaveLength(1); expect(d.originalPpq).toBe(Q);
    expect(validateSong(toSong(d)).ok).toBe(true);
  });
  it('silencios derivados de la posición temporal', () => {
    const d = imp([seq([[60, Q], [null, Q], [62, 2 * Q]])]);
    expect(brief(d)).toEqual([['60', 0, 960], ['r', 960, 960], ['62', 1920, 1920]]);
  });
  it('relleno de compás con silencio final', () => { expect(brief(imp([seq([[60, Q]])]))).toEqual([['60', 0, 960], ['r', 960, 2880]]); });
  it('Note On con velocidad 0 equivale a Note Off', () => {
    const d = imp([[{ dt: 0, kind: 'on', note: 60 }, { dt: Q, kind: 'on0', note: 60 }]]); expect(brief(d)[0]).toEqual(['60', 0, 960]);
  });
  it('PPQ del archivo distinto (96) se reescala a 960', () => {
    const d = imp([seq([[60, 96], [62, 96]])], undefined, {}, 96); expect(brief(d).slice(0, 2)).toEqual([['60', 0, 960], ['62', 960, 960]]);
  });
  it('nota larga que cruza la barra se parte en dos eventos ligados; la proyección recupera una sola nota', () => {
    const d = imp([seq([[null, 2 * Q], [60, 4 * Q]])]);
    const notes = evs(d).filter((e) => e.type === 'note'); expect(notes.map((e) => [e.tick, e.durationTicks, e.measure])).toEqual([[1920, 1920, 0], [3840, 1920, 1]]);
    expect(notes[0]!.pitches[0]!.tieNext).toBe(true); expect(notes[1]!.pitches[0]!.tiePrev).toBe(true);
    const s = toSong(d); const perf = toPerformance(s); expect(perf).toHaveLength(1); expect([perf[0]!.tickStart, perf[0]!.tickEnd]).toEqual([1920, 5760]);
  });
  it('FIFO con notas solapadas de igual altura', () => {
    const d = imp([[{ dt: 0, kind: 'on', note: 60 }, { dt: Q, kind: 'on', note: 60 }, { dt: Q, kind: 'off', note: 60 }, { dt: Q, kind: 'off', note: 60 }]], undefined, { grid: 'quarter' });
    expect(songStats(toSong(d)).notes).toBe(2);
  });
  it('notas sin cerrar se cortan con aviso; fines huérfanos se ignoran', () => {
    const d = imp([[{ dt: 0, kind: 'off', note: 50 }, { dt: 0, kind: 'on', note: 60 }, { dt: Q, kind: 'on', note: 62 }]]);
    expect(d.report.map((r) => r.code)).toEqual(expect.arrayContaining(['orphan-off', 'unclosed'])); expect(songStats(toSong(d)).notes).toBe(2);
  });
  it('el canal de percusión (10) se omite con informe; el pedal se menciona', () => {
    const d = imp([[{ dt: 0, kind: 'cc', cc: 64 }, ...seq([[36, Q]], 9), ...seq([[60, Q]], 0)]]); expect(songStats(toSong(d)).notes).toBe(1); expect(d.report.map((r) => r.code)).toEqual(expect.arrayContaining(['drums', 'sustain']));
  });
});

describe('MIDI: cuantización configurable', () => {
  const swung = (): MEv[] => [{ dt: 0, kind: 'on', note: 60 }, { dt: 245, kind: 'off', note: 60 }, { dt: 0, kind: 'on', note: 62 }, { dt: 233, kind: 'off', note: 62 }]; // ≈ corcheas con ruido (Q=480)
  it('ajusta a la rejilla y la rejilla cambia el resultado', () => {
    const fine = imp([swung()], undefined, { grid: 'sixteenth' }), coarse = imp([swung()], undefined, { grid: 'quarter' });
    expect(brief(fine).slice(0, 2)).toEqual([['60', 0, 480], ['62', 480, 480]]);
    expect(brief(coarse)[0]).toEqual(['60', 0, 960]); expect(songStats(toSong(coarse)).notes).toBe(2);
    expect(coarse.options.grid).toBe('quarter');
  });
  it('notas más cortas que la rejilla se alargan con aviso', () => {
    const d = imp([[{ dt: 0, kind: 'on', note: 60 }, { dt: 5, kind: 'off', note: 60 }]], undefined, { grid: 'eighth' }); expect(brief(d)[0]).toEqual(['60', 0, 480]); expect(d.report.map((r) => r.code)).toContain('short');
  });
  it('legato: un solape de una casilla se recorta; sin recorte aparece una segunda voz', () => {
    const legato: MEv[] = [{ dt: 0, kind: 'on', note: 60 }, { dt: Q, kind: 'on', note: 62 }, { dt: 120, kind: 'off', note: 60 }, { dt: Q - 120, kind: 'off', note: 62 }];
    const on = imp([legato], undefined, { grid: 'eighth', legatoTrim: true }), off = imp([legato], undefined, { grid: 'eighth', legatoTrim: false });
    expect(Math.max(...evs(on).map((e) => e.voice))).toBe(1); expect(Math.max(...evs(off).map((e) => e.voice))).toBe(2);
  });
  it('las alturas nunca cambian al cuantizar', () => {
    const d = imp([seq([[60, 243], [67, 251], [64, 489], [72, 233]])], undefined, { grid: 'eighth' });
    expect(toPerformance(toSong(d)).map((e) => e.midis[0])).toEqual([60, 67, 64, 72]);
  });
});

describe('MIDI: acordes y voces', () => {
  it('notas simultáneas con igual duración = acorde', () => {
    const d = imp([[{ dt: 0, kind: 'on', note: 60 }, { dt: 0, kind: 'on', note: 64 }, { dt: 0, kind: 'on', note: 67 }, { dt: Q, kind: 'off', note: 60 }, { dt: 0, kind: 'off', note: 64 }, { dt: 0, kind: 'off', note: 67 }]]);
    expect(evs(d)[0]).toMatchObject({ type: 'chord', durationTicks: 960 }); expect(toPerformance(toSong(d))[0]!.midis).toEqual([60, 64, 67]);
  });
  it('melodía sobre una nota larga: la nota larga va a otra voz y el modelo valida', () => {
    const d = imp([[{ dt: 0, kind: 'on', note: 48 }, { dt: 0, kind: 'on', note: 72 }, { dt: Q, kind: 'off', note: 72 }, { dt: 0, kind: 'on', note: 74 }, { dt: Q, kind: 'off', note: 74 }, { dt: 0, kind: 'off', note: 48 }]], 1);
    const s = toSong(d); expect(Math.max(...s.parts[0]!.staves[0]!.events.map((e) => e.voice))).toBe(2); expect(songStats(s).notes).toBe(3);
  });
});

describe('MIDI: tempo, compás y armadura', () => {
  it('cambio de tempo con su posición en ticks', () => {
    const d = imp([[{ dt: 0, kind: 'tempo', bpm: 120 }, ...seq([[60, 4 * Q]]), { dt: 0, kind: 'tempo', bpm: 60 }, ...seq([[62, Q]])]]);
    expect(d.tempoMap).toEqual([{ tick: 0, bpm: 120 }, { tick: 3840, bpm: 60 }]);
  });
  it('compases 3/4 y 6/8; cambio de compás en barra', () => {
    expect(imp([[{ dt: 0, kind: 'ts', num: 3, den: 4 }, ...seq([[60, 6 * Q]])]]).measures.map((m) => m.lengthTicks)).toEqual([2880, 2880]);
    expect(imp([[{ dt: 0, kind: 'ts', num: 6, den: 8 }, ...seq([[60, 3 * Q]])]]).measures[0]!.lengthTicks).toBe(2880);
    const d = imp([[{ dt: 0, kind: 'ts', num: 4, den: 4 }, ...seq([[60, 4 * Q]]), { dt: 0, kind: 'ts', num: 3, den: 4 }, ...seq([[62, 3 * Q]])]]);
    expect(d.timeSignatures).toEqual([{ tick: 0, num: 4, den: 4 }, { tick: 3840, num: 3, den: 4 }]);
  });
  it('ortografía según la armadura: Si♭ con 2 bemoles, La♯ en Do mayor', () => {
    const flat = toSong(imp([[{ dt: 0, kind: 'key', fifths: -2 }, ...seq([[70, Q]])]])).parts[0]!.staves[0]!.events[0]!.pitches[0]!.pitch;
    const sharp = toSong(imp([seq([[70, Q]])])).parts[0]!.staves[0]!.events[0]!.pitches[0]!.pitch;
    expect([flat.step, flat.alter, flat.midi]).toEqual(['B', -1, 70]); expect([sharp.step, sharp.alter, sharp.midi]).toEqual(['A', 1, 70]);
  });
});

describe('MIDI: separación de manos (propuesta, no certeza)', () => {
  const hi = seq([[72, 4 * Q]]), lo = seq([[48, 4 * Q]]);
  it('dos pistas → por pista: la más aguda es la mano derecha', () => {
    const d = imp([lo, hi], 2); expect(brief(d, 0)[0]![0]).toBe('72'); expect(brief(d, 1)[0]![0]).toBe('48'); expect(d.options.handMode).toBe('byTrack');
    expect(d.parts[0]!.staves.map((s) => [s.clef, s.hand])).toEqual([['G', 'right'], ['F', 'left']]); expect(d.report.some((r) => /Confírmala/.test(r.message))).toBe(true);
  });
  it('una pista → por altura con punto de división configurable', () => {
    const one = [[...seq([[72, Q], [55, Q]])]];
    const d60 = imp(one, 2), d50 = imp(one, 2, { splitMidi: 50 });
    expect(brief(d60, 0)[0]![0]).toBe('72'); expect(brief(d60, 1).some((e) => e[0] === '55')).toBe(true);
    expect(brief(d50, 0).some((e) => e[0] === '55')).toBe(true); expect(d60.options.handMode).toBe('bySplit');
  });
  it('modo por pista pedido sin 2 pistas → vuelve a altura con aviso', () => { expect(imp([seq([[60, Q]])], 2, { handMode: 'byTrack' }).report.map((r) => r.code)).toContain('bytrack'); });
  it('una mano combina todas las pistas en un pentagrama; sin manos indicadas se sugiere', () => {
    const d = imp([lo, hi], 1); expect(d.parts[0]!.staves).toHaveLength(1); expect(songStats(toSong(d)).notes).toBe(2);
    expect(imp([lo, hi]).suggestedHands).toBe(2); expect(imp([seq([[60, Q], [62, Q]])]).suggestedHands).toBe(1);
  });
  it('pentagrama vacío se avisa', () => { expect(imp([seq([[72, Q]])], 2).report.map((r) => r.code)).toContain('empty-staff'); });
  it('canción de dos manos valida y las manos suenan a la vez en la proyección', () => {
    const s = toSong(imp([lo, hi], 2), 2); const perf = toPerformance(s); expect(perf).toHaveLength(1); expect(perf[0]!.midis).toEqual([48, 72]);
  });
});

describe('MIDI: archivos inválidos', () => {
  const bad = (bytes: Uint8Array, re: RegExp, name = 't.mid') => expect(() => importFile(name, bytes)).toThrow(re);
  it('basura, cabecera sin contenido, vacío', () => {
    bad(Uint8Array.from([1, 2, 3, 4, 5]), /MIDI válido/); bad(Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0]), /incompleta o dañada/); bad(new Uint8Array(0), /vacío/);
  });
  it('sin notas, formato 2', () => { bad(buildMidi([[{ dt: 0, kind: 'tempo', bpm: 100 }]]), /no contiene notas/); bad(buildMidi([seq([[60, Q]])], 480, 2), /formato 2/); });
  it('truncado a mitad no se cuelga ni crashea sin mensaje', () => {
    const full = buildMidi([seq([[60, Q], [62, Q], [64, Q]])]);
    for (const cut of [10, 14, 20, full.length - 5]) { try { importFile('t.mid', full.subarray(0, cut)); } catch (e) { expect((e as Error).name).toBe('ImportError'); } }
  });
  it('archivo con demasiados compases se rechaza', () => { bad(buildMidi([[{ dt: 0, kind: 'on', note: 60 }, { dt: 4 * Q * 6000, kind: 'off', note: 60 }]]), /demasiado largo/); });
});
