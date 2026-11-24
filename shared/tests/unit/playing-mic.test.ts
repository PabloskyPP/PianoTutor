// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { buildLegacySong, DEFAULT_PREFERENCES, mergePreferences, type Preferences } from '@pianotutor/shared';
import { PlayingPage } from '../../frontend/src/pages/Playing';
import { addNote, noise, PIANO, reseed } from '../helpers/audio';

/** Audio SINTÉTICO que atraviesa la cadena completa de la página: captura → analizador → eventos → evaluación. */
const SR = 44100;
let rec: Float32Array, tracks: { stop: ReturnType<typeof vi.fn> }[], prefs: Preferences, div: HTMLDivElement, root: Root;
class FakeCtx {
  sampleRate = SR; currentTime = 0; state = 'running'; destination = {}; resume = async () => {};
  createOscillator() { return { connect() { return this; }, disconnect() {}, start() {}, stop() {}, frequency: { value: 0 }, type: '', onended: null as any }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, disconnect() {} }; }
  createAnalyser() { return { fftSize: 0, disconnect() {}, getFloatTimeDomainData: (b: Float32Array) => { const end = Math.floor((performance.now() / 1000) * SR), from = Math.max(0, end - b.length); b.fill(0); b.set(rec.subarray(from, Math.min(end, rec.length)), b.length - (end - from)); } }; }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
}
const song = () => buildLegacySong('Tres notas', 'C4 D4 E4', { id: 'preloaded-tres-0001', genre: 'g', difficulty: 1 });

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
  (globalThis as any).AudioContext = FakeCtx; (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} }; delete (navigator as any).requestMIDIAccess;
  tracks = []; Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { const t = [{ stop: vi.fn() }]; tracks.push(...t); return { getTracks: () => t }; } } });
  prefs = { ...DEFAULT_PREFERENCES, mic: { ...DEFAULT_PREFERENCES.mic } }; reseed(4); rec = new Float32Array(SR * 8); noise(rec, 0.003);
  (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (o: unknown) => new Response(JSON.stringify(o));
    if (url === '/api/preferences' && init?.method === 'PUT') { const m = mergePreferences(prefs, JSON.parse(init.body as string)); if (m.ok) prefs = m.value; return json({ preferences: prefs }); }
    if (url === '/api/preferences') return json({ preferences: prefs });
    if (url === '/api/songs') return json({ songs: [], errors: [] });
    return json(song());
  });
  div = document.createElement('div'); document.body.append(div); root = createRoot(div);
});
afterEach(async () => { await act(async () => root.unmount()); div.remove(); vi.useRealTimers(); });

const $ = (s: string) => div.querySelector(s) as HTMLElement;
const run = async (sec: number) => { let left = Math.round(sec * 1000); while (left > 0) { const d = Math.min(20, left); await act(async () => { await vi.advanceTimersByTimeAsync(d); }); left -= d; } };
const mount = async () => { await act(async () => { root.render(createElement(PlayingPage, { songId: 'preloaded-tres-0001' })); await vi.advanceTimersByTimeAsync(0); }); };
const micOn = async () => { await act(async () => { $('#mic').click(); await vi.advanceTimersByTimeAsync(0); }); };
const stats = () => [$('#hits').textContent, $('#miss').textContent, $('#prog').textContent];

describe('Playing + micrófono (audio sintético)', () => {
  it('calibra el ruido (con aviso), detecta la nota esperada y avanza', async () => {
    addNote(rec, SR, 60, 1.6, 0.9, PIANO); await mount(); await micOn();
    expect($('#mic').textContent).toBe('Micrófono activo'); expect($('#notice').textContent).toMatch(/Calibrando el ruido ambiente/);
    await run(1.0); expect(document.getElementById('notice')?.textContent ?? '').not.toMatch(/Calibrando/);
    await run(1.2); expect(stats()).toEqual(['1', '0', '33%']);
  });
  it('acepta cualquier octava por defecto (Do5 vale como Do4); con la opción desactivada, no', async () => {
    addNote(rec, SR, 72, 1.6, 0.9, PIANO); await mount(); await micOn(); await run(2.8); expect(stats()).toEqual(['1', '0', '33%']);
  });
  it('una nota equivocada detectada SÍ se cuenta como fallo (ya no se filtra en silencio); con «contar fallos» desactivado no', async () => {
    addNote(rec, SR, 67, 1.6, 0.9, PIANO);
    await mount(); await micOn(); await run(2.8); expect(stats()).toEqual(['0', '1', '0%']);
  });
  it('con «contar fallos del micrófono» desactivado, la nota equivocada no cuenta', async () => {
    prefs.mic.countMisses = false; addNote(rec, SR, 67, 1.6, 0.9, PIANO); await mount(); await micOn(); await run(2.8); expect(stats()).toEqual(['0', '0', '0%']);
  });
  it('secuencia completa C4 D4 E4 con micrófono: completa la canción', async () => {
    [60, 62, 64].forEach((m, i) => addNote(rec, SR, m, 1.6 + i * 0.8, 0.9, PIANO)); await mount(); await micOn(); await run(4.6);
    expect(stats()).toEqual(['3', '0', '100%']); expect($('#msg').textContent).toMatch(/¡Canción completada! Precisión: 100%/);
  });
  it('desactivar el micrófono lo libera por completo: sin pista activa, sin temporizadores y sin más eventos', async () => {
    addNote(rec, SR, 60, 4, 0.9, PIANO); await mount(); await micOn(); await run(1.5); await micOn();
    expect($('#mic').textContent).toBe('Activar micrófono'); expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    await run(4); expect(stats()).toEqual(['0', '0', '0%']);
  });
  it('cambiar de pantalla con el micrófono activo lo apaga', async () => {
    await mount(); await micOn(); await act(async () => root.unmount()); expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true); await vi.advanceTimersByTimeAsync(500); expect(vi.getTimerCount()).toBe(0); root = createRoot(div);
  });
});
