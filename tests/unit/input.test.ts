// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { InputHub, type NoteInputEvent } from '../../frontend/src/input/hub';
import { attachComputerKeyboard, attachVirtualKeyboard } from '../../frontend/src/input/keyboard';
import { connectMidi } from '../../frontend/src/input/midi';

const collect = (h: InputHub) => { const ev: NoteInputEvent[] = []; h.subscribe((e) => ev.push(e)); return ev; };
const key = (type: string, code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, ...init }));
afterEach(() => { vi.restoreAllMocks(); });

describe('InputHub', () => {
  it('suscribe/baja sin fugas', () => { const h = new InputHub(); const f = vi.fn(); const off = h.subscribe(f); h.emit({ kind: 'on', midi: 60, tMs: 0, source: 'midi' }); off(); h.emit({ kind: 'on', midi: 60, tMs: 0, source: 'midi' }); expect(f).toHaveBeenCalledTimes(1); expect(h.listenerCount).toBe(0); });
});

describe('teclado del ordenador', () => {
  it('Note On/Off, sin repetición de tecla mantenida', () => {
    const h = new InputHub(), ev = collect(h), off = attachComputerKeyboard(h);
    key('keydown', 'KeyA'); key('keydown', 'KeyA', { repeat: true }); key('keydown', 'KeyA'); key('keyup', 'KeyA');
    expect(ev.map((e) => [e.kind, e.midi])).toEqual([['on', 60], ['off', 60]]); off();
  });
  it('mapa completo: A=60 … P=75; ignora otras teclas, Ctrl/Meta y campos de texto', () => {
    const h = new InputHub(), ev = collect(h), off = attachComputerKeyboard(h);
    key('keydown', 'KeyP'); key('keydown', 'KeyZ'); key('keydown', 'KeyS', { ctrlKey: true }); key('keydown', 'KeyD', { metaKey: true });
    const input = document.createElement('input'); document.body.append(input); key('keydown', 'KeyF', {}, input);
    expect(ev.map((e) => e.midi)).toEqual([75]); off(); input.remove();
  });
  it('al desmontar libera notas pulsadas y deja de escuchar', () => {
    const h = new InputHub(), ev = collect(h), off = attachComputerKeyboard(h); key('keydown', 'KeyA'); off(); key('keydown', 'KeyS');
    expect(ev.map((e) => `${e.kind}${e.midi}`)).toEqual(['on60', 'off60']);
  });
});

describe('piano virtual', () => {
  it('pointerdown = on, pointerup (en window) = off', () => {
    const el = document.createElement('div'); const k = document.createElement('div'); k.dataset.m = '64'; el.append(k); document.body.append(el);
    const h = new InputHub(), ev = collect(h), off = attachVirtualKeyboard(el, h);
    const ptr = (t: string, target: EventTarget) => target.dispatchEvent(Object.assign(new Event(t, { bubbles: true }), { pointerId: 1 }));
    ptr('pointerdown', k); ptr('pointerup', window); ptr('pointerup', window);
    expect(ev.map((e) => `${e.kind}${e.midi}`)).toEqual(['on64', 'off64']); off(); el.remove();
  });
});

describe('MIDI', () => {
  const fakeAccess = () => {
    const input: any = { name: 'Piano de prueba', onmidimessage: null };
    const access: any = { inputs: new Map([['1', input]]), onstatechange: null };
    return { input, access };
  };
  const send = (input: any, ...data: number[]) => input.onmidimessage({ data: Uint8Array.from(data), timeStamp: 5 });
  it('Note On, Note Off, Note On vel 0 = Off, canal y velocidad', async () => {
    const { input, access } = fakeAccess(); (navigator as any).requestMIDIAccess = () => Promise.resolve(access);
    const h = new InputHub(), ev = collect(h), status = vi.fn(); const off = connectMidi(h, status);
    await vi.waitFor(() => expect(input.onmidimessage).toBeTruthy());
    send(input, 0x92, 60, 100); send(input, 0x82, 60, 0); send(input, 0x90, 62, 80); send(input, 0x90, 62, 0); send(input, 0xB0, 64, 127);
    expect(ev.map((e) => [e.kind, e.midi, e.channel, e.velocity])).toEqual([['on', 60, 2, 100], ['off', 60, 2, undefined], ['on', 62, 0, 80], ['off', 62, 0, undefined]]);
    expect(status).toHaveBeenLastCalledWith({ supported: true, denied: false, devices: ['Piano de prueba'] });
    off(); expect(input.onmidimessage).toBeNull(); expect(access.onstatechange).toBeNull();
  });
  it('rebindear en cambios de estado no duplica eventos', async () => {
    const { input, access } = fakeAccess(); (navigator as any).requestMIDIAccess = () => Promise.resolve(access);
    const h = new InputHub(), ev = collect(h); const off = connectMidi(h, () => {});
    await vi.waitFor(() => expect(access.onstatechange).toBeTruthy()); access.onstatechange(); access.onstatechange();
    send(input, 0x90, 60, 90); expect(ev).toHaveLength(1); off();
  });
  it('sin Web MIDI o con permiso denegado informa del estado', async () => {
    delete (navigator as any).requestMIDIAccess; const s1 = vi.fn(); connectMidi(new InputHub(), s1); expect(s1).toHaveBeenCalledWith({ supported: false, denied: false, devices: [] });
    (navigator as any).requestMIDIAccess = () => Promise.reject(new Error('denied')); const s2 = vi.fn(); connectMidi(new InputHub(), s2);
    await vi.waitFor(() => expect(s2).toHaveBeenCalledWith({ supported: true, denied: true, devices: [] }));
  });
  it('desmontar antes de que llegue el permiso no deja escuchas', async () => {
    const { input, access } = fakeAccess(); let resolve!: (a: any) => void; (navigator as any).requestMIDIAccess = () => new Promise((r) => { resolve = r; });
    const off = connectMidi(new InputHub(), () => {}); off(); resolve(access); await Promise.resolve(); await Promise.resolve();
    expect(input.onmidimessage).toBeNull();
  });
});
