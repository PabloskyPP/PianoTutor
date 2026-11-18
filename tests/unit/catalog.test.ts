import { describe, it, expect } from 'vitest';
import { filterSongs, normalizeText, distinctGenres, DEFAULT_FILTERS, sortByTitle, splitNotatable, notatable, spellMidi, keyAlterations, majorKeyName, type SongSummary } from '@pianotutor/shared';

const S = (title: string, genre: string, hands: 1 | 2, difficulty: number, origin: SongSummary['origin'] = 'preloaded'): SongSummary =>
  ({ id: title, title, genre, hands, difficulty, origin, modifiedAt: '', revision: 1, provisional: false });
const LIB = [S('Zapatos nuevos', 'Infantil', 1, 1), S('árbol de Navidad', 'Navidad', 1, 2), S('Ñoño', 'Infantil', 1, 3), S('Nocturno', 'Clásica', 2, 8, 'composed'), S('Oda a la alegría', 'Clásica', 1, 2), S('Para Elisa', 'clasica', 1, 5, 'imported')];
const f = (o: Partial<typeof DEFAULT_FILTERS>) => filterSongs(LIB, { ...DEFAULT_FILTERS, ...o }).map((s) => s.title);

describe('catálogo: orden, búsqueda, filtros', () => {
  it('orden alfabético español, sin distinguir mayúsculas ni acentos; ñ después de n', () => {
    expect(f({})).toEqual(['árbol de Navidad', 'Nocturno', 'Ñoño', 'Oda a la alegría', 'Para Elisa', 'Zapatos nuevos']);
    expect(sortByTitle([{ title: 'b' }, { title: 'A' }, { title: 'á' }]).map((x) => x.title)).toEqual(['A', 'á', 'b']);
  });
  it('normaliza acentos y mayúsculas', () => { expect(normalizeText('  ÁRBOL Niño ')).toBe('arbol nino'); });
  it('búsqueda por fragmento, sin acentos ni mayúsculas', () => {
    expect(f({ query: 'arbol' })).toEqual(['árbol de Navidad']); expect(f({ query: 'ELISA' })).toEqual(['Para Elisa']); expect(f({ query: 'noño' })).toEqual(['Ñoño']);
    expect(f({ query: 'a la' })).toEqual(['Oda a la alegría']); expect(f({ query: 'xyz' })).toEqual([]); expect(f({ query: '   ' })).toHaveLength(6);
  });
  it('filtros: género (insensible a acentos), dificultad, manos, propias', () => {
    expect(f({ genre: 'Clásica' })).toEqual(['Nocturno', 'Oda a la alegría', 'Para Elisa']);
    expect(f({ minDifficulty: 2, maxDifficulty: 3 })).toEqual(['árbol de Navidad', 'Ñoño', 'Oda a la alegría']);
    expect(f({ minDifficulty: 5, maxDifficulty: 5 })).toEqual(['Para Elisa']); expect(f({ minDifficulty: 9, maxDifficulty: 2 })).toHaveLength(5); // rango invertido: se interpreta como 2–9
    expect(f({ hands: 2 })).toEqual(['Nocturno']); expect(f({ own: 'own' })).toEqual(['Nocturno']); expect(f({ own: 'notOwn' })).toHaveLength(5);
  });
  it('filtros combinados con la búsqueda', () => {
    expect(f({ query: 'o', genre: 'Clásica', hands: 1 })).toEqual(['Oda a la alegría']); expect(f({ query: 'o', own: 'own', hands: 1 })).toEqual([]);
  });
  it('géneros distintos sin duplicar «Clásica»/«clasica»', () => { expect(distinctGenres(LIB)).toEqual(['Clásica', 'Infantil', 'Navidad']); });
});

describe('duraciones y ortografía', () => {
  it('splitNotatable', () => {
    expect(splitNotatable(960).parts.map((p) => p.vex + p.dots)).toEqual(['q0']); expect(splitNotatable(1440).parts.map((p) => p.vex + p.dots)).toEqual(['q1']);
    expect(splitNotatable(1200).parts.map((p) => p.ticks)).toEqual([960, 240]); expect(splitNotatable(5760).parts.map((p) => p.ticks)).toEqual([3840, 1920]);
    expect(splitNotatable(50).approx).toBe(true); expect(notatable(320)).toBeUndefined(); expect(notatable(120)).toMatchObject({ vex: '32' });
  });
  it('spellMidi / keyAlterations / nombre de tonalidad', () => {
    expect(spellMidi(61, 0)).toMatchObject({ step: 'C', alter: 1 }); expect(spellMidi(61, -3)).toMatchObject({ step: 'D', alter: -1 }); expect(spellMidi(60, 0).octave).toBe(4);
    expect(keyAlterations(2)).toMatchObject({ F: 1, C: 1, G: 0 }); expect(keyAlterations(-2)).toMatchObject({ B: -1, E: -1, A: 0 }); expect(majorKeyName(-2)).toBe('Bb'); expect(majorKeyName(3)).toBe('A');
  });
});
