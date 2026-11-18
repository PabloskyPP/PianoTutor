// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseMusicXml, parseMidiFile, draftToSong, type Song } from '@pianotutor/shared';
import { toVexSpec, layoutSystems } from '../../frontend/src/score/toVexSpec';
import { VexScore } from '../../frontend/src/score/VexScore';
import { buildMidi, seq, note, rest, attrs, measure, score, part } from '../helpers/builders';

const META = { id: 'imported-test-0001', title: 'T', genre: 'G', difficulty: 1, now: '2026-11-18T00:00:00.000Z', fileName: 'x', storedAs: 'x' };
const xml = (m: string, att = '<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>') => draftToSong(parseMusicXml(score(part('P1', m))), { ...META, hands: 1 });
const laneNotes = (s: Song, mi = 0, voice = 1, staff = 0) => toVexSpec(s).measures[mi]!.lanes.find((l) => l.staff === staff && l.voice === voice)!.notes;
const A = (extra = '') => attrs(`<divisions>1</divisions>${extra}<time><beats>4</beats><beat-type>4</beat-type></time>`);

describe('toVexSpec: contenido y alteraciones', () => {
  it('claves, teclas y duraciones; rellena con invisibles el hueco final', () => {
    const s = xml(measure(1, A() + note('C', 4, 1) + note('E', 4, 2)));
    const n = laneNotes(s); expect(n.map((x) => [x.kind, x.keys[0], x.duration])).toEqual([['note', 'c/4', 'q'], ['note', 'e/4', 'h'], ['ghost', 'b/4', 'q']]);
  });
  it('alteraciones: se escribe una vez por compás, el becuadro cancela y el compás siguiente reinicia', () => {
    const s = xml(measure(1, A() + note('F', 4, 1, '', 1) + note('F', 4, 1, '', 1) + note('F', 4, 1, '', 0) + note('G', 4, 1)) + measure(2, note('F', 4, 4, '', 1)));
    expect(laneNotes(s, 0).map((n) => n.accidentals[0])).toEqual(['#', null, 'n', null]); expect(laneNotes(s, 1)[0]!.accidentals[0]).toBe('#');
  });
  it('la armadura evita alteraciones propias; la nota natural contra la armadura lleva becuadro', () => {
    const s = xml(measure(1, A('<key><fifths>1</fifths></key>') + note('F', 4, 1, '', 1) + note('F', 4, 1, '', 0) + note('C', 5, 2)));
    expect(laneNotes(s).slice(0, 3).map((n) => n.accidentals[0])).toEqual([null, 'n', null]); expect(toVexSpec(s).measures[0]!.fifths).toBe(1);
  });
  it('bemoles', () => { expect(laneNotes(xml(measure(1, A() + note('B', 4, 4, '', -1))))[0]!.accidentals[0]).toBe('b'); });
  it('acorde: teclas ordenadas de grave a agudo con su alteración por tecla', () => {
    const ch = '<note><chord/><pitch><step>G</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration></note>';
    const s = xml(measure(1, A() + note('E', 4, 4) + ch)); const n = laneNotes(s)[0]!; expect(n.keys).toEqual(['e/4', 'g/4']); expect(n.accidentals).toEqual([null, '#']);
  });
  it('silencios con tecla de posición según la clave', () => { expect(laneNotes(xml(measure(1, A() + rest(2) + note('C', 4, 2))))[0]).toMatchObject({ kind: 'rest', duration: 'h', keys: ['b/4'] }); });
  it('duración no notable (5 semicorcheas) → dos figuras ligadas solo en pantalla', () => {
    const s = xml(measure(1, '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' + note('C', 4, 5) + note('D', 4, 11)));
    const n = laneNotes(s).filter((x) => x.kind === 'note' && x.keys[0] === 'c/4'); expect(n.map((x) => x.duration)).toEqual(['q', '16']); expect(n[0]!.tieNext[0]).toBe(true); expect(n[1]!.tieFromPrev[0]).toBe(true);
  });
  it('tresillo marcado en las tres notas', () => {
    const tm = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
    const s = xml(measure(1, '<attributes><divisions>6</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' + note('C', 4, 2, tm) + note('D', 4, 2, tm) + note('E', 4, 2, tm) + note('F', 4, 18)));
    expect(laneNotes(s).slice(0, 3).map((n) => [n.duration, n.tuplet?.actual])).toEqual([['8', 3], ['8', 3], ['8', 3]]);
  });
  it('MIDI a dos manos: dos pentagramas, F en el inferior, y cada compás con sus voces', () => {
    const s = draftToSong(parseMidiFile(buildMidi([seq([[72, 480]]), seq([[48, 480]])]), 2), { ...META, hands: 2 });
    const spec = toVexSpec(s); expect(spec.staves.map((x) => x.clef)).toEqual(['treble', 'bass']); expect(spec.measures[0]!.lanes.map((l) => l.staff)).toEqual([0, 1]);
  });
  it('métrica: se muestra en el primer compás y donde cambia', () => {
    const s = xml(measure(1, A() + note('C', 4, 4)) + measure(2, attrs('<time><beats>3</beats><beat-type>4</beat-type></time>') + note('D', 4, 3)) + measure(3, note('E', 4, 3)));
    expect(toVexSpec(s).measures.map((m) => m.timeSig)).toEqual(['4/4', '3/4', undefined]);
  });
});

describe('layoutSystems', () => {
  const big = () => draftToSong(parseMidiFile(buildMidi([seq(Array.from({ length: 160 }, (_, i) => [60 + (i % 7), 480] as [number, number]))]), 1), { ...META, hands: 1 });
  it('cada compás en exactamente un sistema, ninguno vacío, y la anchura se respeta', () => {
    const spec = toVexSpec(big()); const sys = layoutSystems(spec, 700);
    expect(sys.flatMap((s) => s.measures)).toEqual(spec.measures.map((m) => m.index)); expect(sys.every((s) => s.measures.length > 0)).toBe(true);
    expect(sys.slice(0, -1).every((s) => s.widths.reduce((a, b) => a + b, 0) <= 700 * 1.5)).toBe(true); expect(sys.length).toBeGreaterThan(1);
  });
  it('una anchura minúscula sigue produciendo al menos un compás por sistema', () => { expect(layoutSystems(toVexSpec(big()), 10).every((s) => s.measures.length === 1)).toBe(true); });
});

describe('VexScore (VexFlow en jsdom: estructura, no apariencia)', () => {
  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
    (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  });
  const render = async (song: Song) => {
    const div = document.createElement('div'); document.body.append(div); const root = createRoot(div);
    await act(async () => { root.render(createElement(VexScore, { song })); });
    return { div, root };
  };
  it('dibuja un SVG con tantas cabezas de nota como notas, sin errores', async () => {
    const s = xml(measure(1, A() + note('C', 4, 1) + note('D', 4, 1, '<tie type="start"/>') + note('D', 4, 1, '<tie type="stop"/>') + rest(1)));
    const { div, root } = await render(s);
    expect(div.querySelector('.notice.bad')?.textContent ?? '').toBe(''); expect(div.querySelectorAll('svg')).toHaveLength(1);
    expect(div.querySelectorAll('.vf-stavenote').length).toBe(4); expect(div.querySelectorAll('.vf-stavetie').length).toBeGreaterThan(0); expect(div.querySelector('svg')!.getAttribute('aria-label')).toMatch(/compases 1 a 1 de 1/);
    await act(async () => root.unmount());
  });
  it('dos manos con acordes y MIDI largo: pagina sin lanzar y los botones respetan los límites', async () => {
    const midi = buildMidi([seq(Array.from({ length: 200 }, (_, i) => [72 + (i % 5), 480] as [number, number])), seq(Array.from({ length: 200 }, (_, i) => [48 - (i % 5), 480] as [number, number]))]);
    const { div, root } = await render(draftToSong(parseMidiFile(midi, 2), { ...META, hands: 2 }));
    expect(div.querySelector('.notice.bad')).toBeNull(); const [prev, next] = [...div.querySelectorAll('.pager button')] as HTMLButtonElement[];
    expect(prev!.disabled).toBe(true); expect(next!.disabled).toBe(false);
    await act(async () => { next!.click(); }); expect(prev!.disabled).toBe(false); expect(div.querySelector('.pager span')!.textContent).not.toMatch(/^Compases 1–/);
    await act(async () => root.unmount());
  });
});
