// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { buildLegacySong, importFile, draftToSong, DEFAULT_PREFERENCES, mergePreferences, type Song, type Preferences } from '@pianotutor/shared';
import { setClockFactory, type Clock } from '../../frontend/src/audio/clock';
import { PlayingPage } from '../../frontend/src/pages/Playing';
import { enc, note, attrs, measure, score, part } from '../helpers/builders';

/** Un solo tiempo virtual (el de los temporizadores falsos) para el reloj de audio y para las marcas de las pulsaciones. */
class VClock implements Clock {
  private p0 = performance.now(); private a0 = 100;
  audioNow() { return this.a0 + (performance.now() - this.p0) / 1000; }
  perfNow() { return performance.now(); }
  perfToAudio(perfMs: number) { return this.a0 + (perfMs - this.p0) / 1000; }
}
class FakeCtx {
  currentTime = 0; sampleRate = 44100; state = 'running'; destination = {}; resume = async () => {};
  createOscillator() { return { connect() { return this; }, disconnect() {}, start() {}, stop() {}, frequency: { value: 0 }, type: '', onended: null as any }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, disconnect() {} }; }
}

const META = { id: 'imported-test-0001', title: 'Dos manos', genre: 'G', difficulty: 1, now: '2026-11-18T00:00:00.000Z', fileName: 'x', storedAs: 'x' };
const two = (): Song => {   // evento 0: acorde de 3 notas entre las dos manos (Do4 izq. + Mi4 y Do5 der.), evento 1: Re5 (der.)
  const CH = (s: string, o: number) => `<note><chord/><pitch><step>${s}</step><octave>${o}</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>`;
  const xml = score(part('P1', measure(1, attrs('<divisions>2</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time><clef number="1"><sign>G</sign></clef><clef number="2"><sign>F</sign><line>4</line></clef>')
    + note('C', 5, 4, '<voice>1</voice><staff>1</staff>') + CH('E', 4) + note('D', 5, 4, '<voice>1</voice><staff>1</staff>')
    + '<backup><duration>8</duration></backup>' + note('C', 4, 8, '<voice>2</voice><staff>2</staff>'))));
  return draftToSong(importFile('d.musicxml', enc(xml), { hands: 2 }), { ...META, hands: 2 });
};
const mono = () => buildLegacySong('Tres notas', 'C4 D4 E4', { id: 'preloaded-tres-0001', genre: 'g', difficulty: 1 });   // 90 BPM: negra = 0,667 s

let div: HTMLDivElement, root: Root, prefs: Preferences, puts: any[], songs: Song[], current: Song;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  (globalThis as any).AudioContext = FakeCtx; (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
  delete (navigator as any).requestMIDIAccess; setClockFactory(() => new VClock());
  prefs = { ...DEFAULT_PREFERENCES, mic: { ...DEFAULT_PREFERENCES.mic } }; puts = []; songs = [mono()]; current = songs[0]!;
  (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
    if (url === '/api/preferences' && init?.method === 'PUT') { const patch = JSON.parse(init.body as string); puts.push(patch); const m = mergePreferences(prefs, patch); if (m.ok) prefs = m.value; return json({ preferences: prefs }); }
    if (url === '/api/preferences') return json({ preferences: prefs });
    if (url === '/api/songs') return json({ songs: songs.map((s) => ({ id: s.id, title: s.title, genre: s.genre, hands: s.hands, difficulty: s.difficulty, origin: s.origin, modifiedAt: '', revision: 1, provisional: !!s.provisional })), errors: [] });
    if (url.startsWith('/api/songs/')) return json(current);
    return json({ error: 'x' }, 404);
  });
  div = document.createElement('div'); document.body.append(div); root = createRoot(div);
});
afterEach(async () => { await act(async () => root.unmount()); div.remove(); setClockFactory(null); vi.useRealTimers(); });

const mount = async (song: Song = current) => { current = song; songs = [song]; await act(async () => { root.render(createElement(PlayingPage, { songId: song.id })); await vi.advanceTimersByTimeAsync(0); }); };
const $ = (sel: string) => div.querySelector(sel) as HTMLElement;
const text = (sel: string) => $(sel)?.textContent ?? '';
/** Pulsa y suelta (una tecla que se queda «mantenida» no vuelve a disparar, como en el teclado real). */
const key = async (code: string) => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); }); await act(async () => { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }); };
/** Avanza EXACTAMENTE `sec` segundos de tiempo virtual, en fotogramas de 16 ms (el último, más corto si hace falta). */
const run = async (sec: number) => { let left = Math.round(sec * 1000); while (left > 0) { const d = Math.min(16, left); await act(async () => { await vi.advanceTimersByTimeAsync(d); }); left -= d; } };
const nexts = () => [...div.querySelectorAll('#kb .next')].map((e) => Number(e.getAttribute('data-m'))).sort((a, b) => a - b);
const click = async (el: HTMLElement) => { await act(async () => { el.click(); await vi.advanceTimersByTimeAsync(0); }); };
const setSelect = async (el: HTMLSelectElement, v: string) => { await act(async () => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); await vi.advanceTimersByTimeAsync(0); }); };

describe('Playing: modo Aprendizaje, una mano (comportamiento original)', () => {
  it('muestra la nota siguiente en naranja, cuenta aciertos/fallos/progreso y avanza', async () => {
    await mount(); expect(nexts()).toEqual([60]); expect(text('#now')).toBe('Do'); expect($('.score').className).toBe('score');
    await key('KeyS'); expect([text('#hits'), text('#miss'), text('#prog')]).toEqual(['0', '1', '0%']);       // Re en vez de Do → fallo
    await key('KeyA'); expect([text('#hits'), text('#prog')]).toEqual(['1', '33%']); expect(nexts()).toEqual([62]);
    await key('KeyS'); await key('KeyD'); expect(text('#msg')).toMatch(/¡Canción completada! Precisión: 75% \(1 fallos\)/); expect(nexts()).toEqual([]);
  });
  it('una tecla mantenida (repetición) no cuenta dos veces; Reiniciar vuelve al principio', async () => {
    await mount(); await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', repeat: true })); }); expect(text('#hits')).toBe('1');
    await click($('#restart')); expect([text('#hits'), text('#miss'), text('#prog')]).toEqual(['0', '0', '0%']); expect(nexts()).toEqual([60]);
  });
  it('el selector de modo existe y no hay controles de Ritmo en Aprendizaje', async () => { await mount(); expect($('#mode')).toBeTruthy(); expect($('#start')).toBeNull(); expect($('#speed')).toBeNull(); });
});

describe('Playing: dos manos y acordes (Aprendizaje)', () => {
  it('diseño de dos pentagramas, piano ampliado a Do3, y las 3 notas del evento se iluminan a la vez', async () => {
    await mount(two());
    expect($('.score').className).toBe('score grand'); expect(nexts()).toEqual([60, 64, 72]); expect(text('#now')).toBe('Do + Mi + Do');
    expect(div.querySelector('#kb [data-m="48"]')).toBeTruthy(); expect(div.querySelector('#kb [data-m="47"]')).toBeNull(); expect(div.querySelector('.kbscroll')).toBeNull();
  });
  it('el evento solo avanza al completar el acorde, en cualquier orden; cada nota es un acierto', async () => {
    await mount(two()); await key('KeyK'); expect([text('#hits'), text('#prog')]).toEqual(['1', '0%']); expect(nexts()).toEqual([60, 64]);
    await key('KeyA'); expect(text('#prog')).toBe('0%'); await key('KeyD'); expect([text('#hits'), text('#prog')]).toEqual(['3', '50%']); expect(nexts()).toEqual([74]);
    await key('KeyL'); expect(text('#msg')).toMatch(/completada/);
  });
  it('una nota que no pertenece al acorde es un fallo y no lo rompe', async () => {
    await mount(two()); await key('KeyK'); await key('KeyS'); expect(text('#miss')).toBe('1'); await key('KeyA'); await key('KeyD'); expect(text('#prog')).toBe('50%');
  });
});

describe('Playing: modo Ritmo', () => {
  const toRhythm = async (extra: Partial<Preferences> = {}) => { prefs = { ...prefs, mode: 'rhythm', ...extra }; await mount(); };
  it('controles propios del Ritmo (Empezar, velocidad) y aviso de ritmo provisional', async () => {
    await toRhythm(); expect(text('#start')).toBe('Empezar'); expect($('#speed')).toBeTruthy(); expect(text('#notice')).toMatch(/ritmo de esta canción es provisional/); expect(nexts()).toEqual([60]);
  });
  it('cuenta previa → acierto, error de tiempo (tarde) y omisión → resumen; el estado final es coherente', async () => {
    await toRhythm({ metronome: true }); await click($('#start')); expect(text('#start')).toBe('Pausa');
    await run(0.1); expect(text('#msg')).toBe('4'); await run(1.4); expect(text('#msg')).toBe('2');
    await run(2.667 - 1.5 + 0.02);                          // t ≈ +0,02 s: llega el Do
    await key('KeyA'); expect(text('#hits')).toBe('1');
    await run(0.667 + 0.18 - 0.02 - 0.05);                  // Re a +180 ms de su instante: error de tiempo (tarde, cerca)
    await run(0.05); await key('KeyS'); expect(text('#msg')).toMatch(/Tarde \(\+1[5-9]\d ms\)/); expect(text('#miss')).toBe('1');
    await run(2.5);                                         // el Mi nunca se toca: omisión y fin
    expect(text('#msg')).toMatch(/¡Terminado! Aciertos 1, fallos 2 \(precisión 33%\)\. Omitidas 1, de tiempo 1, equivocadas 0/);
    expect(text('#detail')).toMatch(/Acertadas 1 · Pronto 0 · Tarde 1 · Equivocadas 0 · Omitidas 1/); expect(text('#start')).toBe('Repetir'); expect(text('#prog')).toBe('100%');
  });
  it('una nota equivocada y otra tocada pronto se distinguen', async () => {
    await toRhythm(); await click($('#start')); await run(2.667 + 0.02); await key('KeyG');          // Sol en lugar de Do
    expect(text('#msg')).toMatch(/Nota equivocada: Sol/); await run(0.667 - 0.02 - 0.17); await key('KeyS'); expect(text('#msg')).toMatch(/Pronto \(−1[5-9]\d ms\)/);
  });
  it('pausa y reanudación: el tiempo no corre en pausa y no se generan omisiones', async () => {
    await toRhythm(); await click($('#start')); await run(2.667 + 0.02); await click($('#start')); expect(text('#start')).toBe('Reanudar'); expect(text('#msg')).toBe('En pausa');
    await run(10); expect(text('#miss')).toBe('0'); expect(text('#prog')).toBe('0%');
    await click($('#start')); expect(text('#start')).toBe('Pausa'); await key('KeyA'); expect(text('#hits')).toBe('1');   // seguimos en el mismo punto: el Do aún cuenta
  });
  it('las pulsaciones durante la cuenta previa no penalizan', async () => {
    await toRhythm(); await click($('#start')); await run(0.5); await key('KeyC'); await key('KeyG'); expect(text('#miss')).toBe('0'); expect(text('#detail')).toMatch(/Equivocadas 0/);
  });
  it('Reiniciar vuelve a «Empezar» y deja los contadores a cero', async () => {
    await toRhythm(); await click($('#start')); await run(3); await click($('#restart')); expect(text('#start')).toBe('Empezar'); expect([text('#hits'), text('#miss'), text('#prog')]).toEqual(['0', '0', '0%']);
  });
  it('cambiar de modo y de velocidad se guarda en las preferencias; la velocidad se bloquea mientras se juega', async () => {
    await mount(); await setSelect($('#mode') as HTMLSelectElement, 'rhythm'); await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(puts).toContainEqual({ mode: 'rhythm' }); expect($('#start')).toBeTruthy();
    await setSelect($('#speed') as HTMLSelectElement, '0.5'); await act(async () => { await vi.advanceTimersByTimeAsync(500); }); expect(prefs.speed).toBe(0.5);
    await click($('#start')); expect(($('#speed') as HTMLSelectElement).disabled).toBe(true);
  });
  it('al desmontar durante la partida se liberan temporizadores y bucle de animación', async () => {
    await toRhythm(); await click($('#start')); await run(1); await act(async () => root.unmount()); await vi.advanceTimersByTimeAsync(1000); expect(vi.getTimerCount()).toBe(0);
    root = createRoot(div);   // para el afterEach
  });
});
