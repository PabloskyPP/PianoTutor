// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fakeCanvasEl, pixels, diffCount } from '../helpers/canvasHarness';
import { ScrollScoreRenderer, type EventStatus } from '../../frontend/src/score/ScrollScoreRenderer';
import type { ScoreEvent, ScoreHead } from '../../frontend/src/score/scoreEvents';
import { buildScoreEvents, outOfView } from '../../frontend/src/score/scoreEvents';
import { buildLegacySong, toPerformance, parsePitch, type PerformanceEvent } from '@pianotutor/shared';

const H = (step: number, midi: number, staff: 0 | 1 = 0, acc: ScoreHead['acc'] = ''): ScoreHead => ({ step, midi, staff, acc, clef: staff === 1 ? 'F' : 'G', fig: { base: 'q', dots: 0 } });
const draw = (events: ScoreEvent[], opt: { grand?: boolean; pos?: number; view?: number; statuses?: EventStatus[]; covered?: number[]; w?: number } = {}) => {
  const h = opt.grand ? 340 : 210; const { el, canvas } = fakeCanvasEl(opt.w ?? 700, h); const r = new ScrollScoreRenderer(el, opt.grand ? 'grand' : 'single');
  r.setEvents(events); r.setFollow(true); r.setView(opt.view ?? opt.pos ?? 0); r.setPos(opt.pos ?? 0); if (opt.statuses) r.setStatuses(opt.statuses); if (opt.covered) r.setCovered(new Set(opt.covered)); r.drawNow(); r.dispose();
  return canvas;
};
/** Cuenta píxeles de un color (tolerancia) en un rectángulo. */
const count = (c: ReturnType<typeof draw>, rgb: [number, number, number], rect: [number, number, number, number] = [0, 0, c.width, c.height], tol = 40, minA = 200) => {
  const d = pixels(c) as unknown as Uint8ClampedArray; let n = 0; const [x0, y0, x1, y1] = rect;
  for (let y = y0; y < Math.min(y1, c.height); y++) for (let x = x0; x < Math.min(x1, c.width); x++) { const i = (y * c.width + x) * 4; if (d[i + 3]! > minA && Math.abs(d[i]! - rgb[0]) < tol && Math.abs(d[i + 1]! - rgb[1]) < tol && Math.abs(d[i + 2]! - rgb[2]) < tol) n++; }
  return n;
};
const GREEN: [number, number, number] = [0x2f, 0xa5, 0x8a], ORANGE: [number, number, number] = [0xd9, 0x8a, 0x12], RED: [number, number, number] = [0xd9, 0x53, 0x4f], GOLD: [number, number, number] = [0xc9, 0xa2, 0x27], INK: [number, number, number] = [0x2a, 0x2f, 0x3d];
const E1: ScoreEvent[] = [{ heads: [H(28, 60)] }, { heads: [H(30, 64)] }, { heads: [H(32, 67)] }];

describe('partitura: colores por resultado y por estado', () => {
  it('sin estados (comportamiento original): lo anterior verde, lo actual naranja, lo siguiente tinta', () => {
    const c = draw(E1, { pos: 1, view: 1 }); expect(count(c, GREEN)).toBeGreaterThan(30); expect(count(c, ORANGE)).toBeGreaterThan(30);
    expect(count(draw(E1, { pos: 0, view: 0 }), GREEN)).toBe(0);
  });
  it('con estados: acierto verde, error de tiempo dorado, omisión roja, y la actual pendiente naranja', () => {
    const base = draw(E1, { pos: 2, view: 1, statuses: ['pending', 'pending', 'pending'] });
    for (const [st, col] of [['hit', GREEN], ['timing', GOLD], ['omit', RED]] as const) {
      const c = draw(E1, { pos: 2, view: 1, statuses: [st, 'pending', 'pending'] }); expect(count(c, col), st).toBeGreaterThan(count(base, col) + 20);
    }
    expect(count(base, ORANGE)).toBeGreaterThan(30);
  });
  it('notas ya tocadas de un acorde actual: verdes mientras las pendientes siguen naranjas', () => {
    const chord: ScoreEvent[] = [{ heads: [H(28, 60), H(30, 64), H(32, 67)] }];
    const none = draw(chord, { covered: [] }), some = draw(chord, { covered: [60, 64] });
    expect(count(none, GREEN)).toBe(0); expect(count(some, GREEN)).toBeGreaterThan(40); expect(count(some, ORANGE)).toBeGreaterThan(20); expect(count(some, ORANGE)).toBeLessThan(count(none, ORANGE));
  });
  it('determinista: el mismo estado produce exactamente la misma imagen', () => { expect(diffCount(draw(E1, { pos: 1 }), draw(E1, { pos: 1 }))).toBe(0); });
});

describe('partitura de dos pentagramas', () => {
  const TWO: ScoreEvent[] = [{ heads: [H(21, 48, 1), H(35, 72), H(37, 76)] }, { heads: [H(28, 60, 1), H(34, 71)] }];
  it('dibuja el pentagrama inferior solo en el diseño de dos manos', () => {
    const grand = draw(TWO, { grand: true, pos: 0 }), single = draw(TWO.map((e) => ({ heads: e.heads.filter((h) => h.staff === 0) })), { pos: 0 });
    const below = [0, 205, 700, 280] as [number, number, number, number];
    expect(count(grand, INK, below)).toBeGreaterThan(500); expect(count(single, INK, below)).toBe(0);     // líneas del pentagrama de Fa + clave
    expect(grand.height).toBe(340); expect(single.height).toBe(210);
  });
  it('clave de Fa y línea de unión presentes; la nota de la mano izquierda cae en el pentagrama de Fa, la derecha en el de Sol', () => {
    const c = draw(TWO, { grand: true, pos: 0, view: 0 });
    expect(count(c, INK, [8, 195, 80, 265], 60)).toBeGreaterThan(150);                                     // clave de Fa
    expect(count(c, INK, [3, 94, 8, 270], 60, 100)).toBeGreaterThan(150);                                  // línea vertical (antialiasada) que une los pentagramas
    expect(count(c, ORANGE, [130, 235, 170, 265])).toBeGreaterThan(20);                                    // Do3 (mano izquierda) en el pentagrama inferior
    expect(count(c, ORANGE, [130, 85, 170, 125])).toBeGreaterThan(20);                                     // Do5 (mano derecha) en el superior
  });
  it('las notas simultáneas de ambas manos comparten columna (misma x)', () => {
    const c = draw(TWO, { grand: true, pos: 0, view: 0 }); const colOf = (rect: [number, number, number, number]) => { const d = pixels(c) as unknown as Uint8ClampedArray; const xs: number[] = []; for (let y = rect[1]; y < rect[3]; y++) for (let x = rect[0]; x < rect[2]; x++) { const i = (y * c.width + x) * 4; if (Math.abs(d[i]! - ORANGE[0]) < 40 && Math.abs(d[i + 1]! - ORANGE[1]) < 40 && d[i + 3]! > 200) xs.push(x); } return xs.reduce((a, b) => a + b, 0) / xs.length; };
    expect(Math.abs(colOf([130, 85, 170, 125]) - colOf([130, 235, 170, 265]))).toBeLessThan(4);
  });
  it('notas fuera de los pentagramas llevan líneas adicionales (no se recortan hasta salir del lienzo)', () => {
    const c = draw([{ heads: [H(14, 36, 1), H(43, 84)] }], { grand: true }); expect(count(c, ORANGE)).toBeGreaterThan(60);
  });
  it('un evento sin notas en un pentagrama no rompe; lista vacía tampoco', () => { expect(() => draw([{ heads: [H(35, 72)] }], { grand: true })).not.toThrow(); expect(() => draw([], { grand: true })).not.toThrow(); });
});

describe('scoreEvents', () => {
  it('cabezas con paso diatónico, midi, mano y alteración; en una mano todo va al pentagrama superior', () => {
    const p = (m: string, staff: number) => ({ pitch: parsePitch(m), staff, tickStart: 0, tickEnd: 960 });
    const perf: PerformanceEvent[] = [{ id: 'a', tickStart: 0, tickEnd: 960, midis: [48, 75], notes: [p('C3', 1), p('D#5', 0)] }];
    expect(buildScoreEvents(perf, true)[0]!.heads).toEqual([{ step: 21, midi: 48, staff: 1, acc: '', clef: 'F', fig: { base: 'q', dots: 0 } }, { step: 36, midi: 75, staff: 0, acc: '#', clef: 'G', fig: { base: 'q', dots: 0 } }]);
    expect(buildScoreEvents(perf, false)[0]!.heads.every((h) => h.staff === 0)).toBe(true);
  });
  it('outOfView detecta notas fuera del lienzo (según la clave)', () => {
    const s = buildLegacySong('X', 'C4 D4', { id: 'preloaded-x-0001', genre: 'g', difficulty: 1 }); expect(outOfView(buildScoreEvents(toPerformance(s), false, s))).toBe(false);
    expect(outOfView([{ heads: [H(20, 45)] }])).toBe(true); expect(outOfView([{ heads: [H(51, 99)] }])).toBe(true);
  });
});
