// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Renderer } from 'vexflow/bravura';
import { importFile, draftToSong, validateSong, clefAt, notatable, toPerformance, type Song } from '@pianotutor/shared';
import { toVexSpec, layoutSystems } from '../../frontend/src/score/toVexSpec';
import { drawSystem } from '../../frontend/src/score/VexScore';
import { buildScoreEvents, figureOf, beatGroupTicks, type ScoreEvent } from '../../frontend/src/score/scoreEvents';
import { ScrollScoreRenderer } from '../../frontend/src/score/ScrollScoreRenderer';
import { fakeCanvasEl, pixels } from '../helpers/canvasHarness';

const load = () => draftToSong(importFile('r.musicxml', new Uint8Array(fs.readFileSync('tests/fixtures/ritmos-y-claves.musicxml')), { hands: 2 }),
  { id: 'imported-fix-00001', title: 'T', genre: 'G', hands: 2, difficulty: 3, now: '2026-11-20T00:00:00.000Z', fileName: 'f', storedAs: 'x' });
const song: Song = load();
const top = song.parts[0]!.staves[0]!;

describe('importación: se guardan figuras, métricas y cambios de clave', () => {
  it('cada figura queda en el modelo (duración exacta, puntillos, tresillos) y no hay avisos', () => {
    const kinds = top.events.map((e) => (e.type === 'rest' ? 'r' : (notatable(e.tuplet ? Math.round(e.durationTicks * 1.5) : e.durationTicks)?.vex ?? '?') + (notatable(e.durationTicks)?.dots ? '.' : '') + (e.tuplet ? 't' : '')));
    for (const k of ['8', 'q.', '16', '32', 'q', '8t', 'r']) expect(kinds, k).toContain(k);
    expect(song.source!.importReport.filter((r) => r.level === 'warning')).toEqual([]);
    expect(song.timeSignatures.map((t) => `${t.num}/${t.den}`)).toEqual(['6/8', '9/8', '3/8']);
  });
  it('los 4 cambios de clave se guardan (2 a mitad de compás) y clefAt los resuelve', () => {
    expect(top.clef).toBe('F'); expect(top.clefChanges).toEqual([{ tick: 1440, clef: 'G' }, { tick: 5760, clef: 'F' }, { tick: 11520, clef: 'C' }, { tick: 14400, clef: 'G' }]);
    expect([0, 1439, 1440, 5760, 11520, 14400].map((t) => clefAt(top, t))).toEqual(['F', 'F', 'G', 'F', 'C', 'G']);
  });
  it('el esquema rechaza cambios de clave desordenados', () => {
    const bad = structuredClone(song); bad.parts[0]!.staves[0]!.clefChanges = [{ tick: 500, clef: 'G' }, { tick: 400, clef: 'F' }]; expect(validateSong(bad).ok).toBe(false);
  });
});

describe('vista previa (VexFlow): claves por nota y cambios dibujados', () => {
  const spec = toVexSpec(song);
  it('cambio a mitad de compás = elemento de clave en su posición; al inicio de compás = atStart; las notas usan la clave vigente', () => {
    const items = (mi: number) => spec.measures[mi]!.lanes.filter((l) => l.staff === 0).flatMap((l) => l.notes.filter((n) => n.kind === 'clef'));
    expect(items(0).map((c) => [c.clef, c.atStart])).toEqual([['treble', false]]); expect(items(2).map((c) => [c.clef, c.atStart])).toEqual([['bass', true]]); expect(items(3).map((c) => c.clef)).toEqual(['alto']);
    const lane0 = spec.measures[0]!.lanes[0]!.notes.filter((n) => n.kind === 'note'); expect(lane0.map((n) => n.clef)).toEqual(['bass', 'bass', 'bass', 'treble', 'treble', 'treble']);
  });
  it('todos los sistemas se dibujan sin errores', () => {
    let errs = 0; for (const s of layoutSystems(spec, 800)) { try { const el = document.createElement('div'); const r = new Renderer(el, Renderer.Backends.SVG); r.resize(800, 260); drawSystem(el, spec, s.measures, s.widths, 12, r.getContext()); } catch { errs++; } }
    expect(errs).toBe(0);
  });
});

describe('Playing: eventos de la partitura', () => {
  const ev = buildScoreEvents(toPerformance(song), true, song);
  it('barra de compás en el primer evento de cada compás, cifra vigente y grupos de pulso (3 corcheas en 6/8)', () => {
    expect(ev.filter((e) => e.bar)).toHaveLength(5); expect(ev[0]!.ts).toBe('6/8'); expect(ev.at(-1)!.ts).toBe('3/8');
    expect(new Set(ev.slice(0, 3).map((e) => e.bg)).size).toBe(1); expect(ev[3]!.bg).not.toBe(ev[2]!.bg);
  });
  it('figuras: tresillo → corchea, valores exactos, ligaduras fusionadas → la mayor que cabe; grupos de pulso', () => {
    expect(figureOf(320, { actual: 3, normal: 2 })).toEqual({ base: '8', dots: 0 }); expect(figureOf(1440)).toEqual({ base: 'q', dots: 1 }); expect(figureOf(240)).toEqual({ base: '16', dots: 0 }); expect(figureOf(2880)).toEqual({ base: 'h', dots: 1 }); expect(figureOf(1200).base).toBe('q');
    expect([[6, 8], [9, 8], [3, 8], [4, 4], [3, 4], [2, 2], [5, 8]].map(([n, d]) => beatGroupTicks(n!, d!))).toEqual([1440, 1440, 1440, 960, 960, 1920, 960]);
  });
});

describe('Playing: dibujo de figuras, compases y claves', () => {
  const head = (base: any, dots: 0 | 1 = 0, step = 32, clef: 'G' | 'F' | 'C' = 'G') => ({ step, midi: 71, staff: 0 as const, acc: '' as const, clef, fig: { base, dots } });
  const draw = (events: ScoreEvent[], o: { bars?: boolean; view?: number } = {}) => { const { el, canvas } = fakeCanvasEl(600, 210); const r = new ScrollScoreRenderer(el); r.setEvents(events); r.setNotation({ bars: o.bars ?? true }); r.setFollow(true); r.setView(o.view ?? 0); r.setPos(99); r.drawNow(); r.dispose(); return { canvas, r }; };
  const ink = (c: any, x0: number, y0: number, x1: number, y1: number) => { const d = pixels(c) as unknown as Uint8ClampedArray; let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * c.width + x) * 4; if (d[i + 3]! > 128 && d[i]! < 120) n++; } return n; };
  const one = (h: any) => draw([{ heads: [h], gapTicks: 960 }]).canvas;   // nota en x = 150, Sol4 (paso 32): y = 136
  it('cabeza hueca (blanca/redonda) con menos tinta que rellena; la redonda no lleva plica; los corchetes y puntillos añaden tinta', () => {
    const q = ink(one(head('q')), 140, 128, 160, 144), h = ink(one(head('h')), 140, 128, 160, 144); expect(h).toBeLessThan(q * 0.75);
    const stem = (c: any) => ink(c, 156, 100, 160, 128); expect(stem(one(head('q')))).toBeGreaterThan(stem(one(head('w'))) + 20);   // (la región incluye líneas del pentagrama: se compara con y sin plica)
    expect(ink(one(head('16')), 150, 90, 175, 125)).toBeGreaterThan(ink(one(head('8')), 150, 90, 175, 125)); expect(ink(one(head('8')), 150, 90, 175, 125)).toBeGreaterThan(ink(one(head('q')), 150, 90, 175, 125));
    expect(ink(one(head('q', 1)), 160, 126, 172, 140)).toBeGreaterThan(ink(one(head('q', 0)), 160, 126, 172, 140));
  });
  it('dos corcheas del mismo pulso se unen con barra (más tinta entre plicas que con corchetes sueltos)', () => {
    const mk = (bg2: number): ScoreEvent[] => [{ heads: [head('8')], gapTicks: 480, bg: 1 }, { heads: [head('8')], gapTicks: 480, bg: bg2 }];
    const beamed = ink(draw(mk(1)).canvas, 160, 90, 205, 100), loose = ink(draw(mk(2)).canvas, 160, 90, 205, 100); expect(beamed).toBeGreaterThan(loose + 30);
  });
  it('el espacio crece con la duración (16.ª < negra < blanca) y la negra mantiene los 50 px del original', () => {
    const X = (gap: number) => draw([{ heads: [head('q')], gapTicks: gap }, { heads: [head('q')], gapTicks: gap }]).r.positions()[1]!;
    expect([X(240), X(960), X(1920)].map((v) => Math.round(v))).toEqual([30, 50, 71]);
  });
  it('barras de compás y cifra solo si se piden; atraviesan los dos pentagramas en el modo de dos manos', () => {
    const evs: ScoreEvent[] = [{ heads: [head('q')], gapTicks: 960, ts: '6/8', bg: 1 }, { heads: [head('q')], gapTicks: 960, ts: '6/8', bar: true, bg: 2000 }];
    const on = draw(evs, { bars: true, view: 1 }).canvas, off = draw(evs, { bars: false, view: 1 }).canvas;
    expect(ink(on, 120, 96, 126, 148)).toBeGreaterThan(ink(off, 120, 96, 126, 148) + 30); expect(ink(on, 66, 90, 90, 150)).toBeGreaterThan(ink(off, 66, 90, 90, 150) + 40);
  });
  it('la altura de la nota depende de la clave: Sol4 en clave de Fa (arriba) cae más abajo del pentagrama que en clave de Sol', () => {
    const y = (clef: 'G' | 'F') => { const c = one(head('q', 0, 32, clef)); for (let r = 0; r < 210; r++) if (ink(c, 144, r, 150, r + 1) > 2 && r > 60) return r; return -1; };
    expect(y('F')).toBeLessThan(y('G'));
  });
});
