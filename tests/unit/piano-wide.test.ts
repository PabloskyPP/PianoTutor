// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { PianoKeyboard, whiteKeys, WIDE_WHITE_KEYS } from '../../frontend/src/piano/PianoKeyboard';

beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
const render = async (props: any) => { const div = document.createElement('div'); document.body.append(div); const root = createRoot(div); await act(async () => { root.render(createElement(PianoKeyboard, { next: new Set<number>(), flashes: {}, ...props })); }); return { div, root }; };

describe('piano virtual: rango y desplazamiento', () => {
  it('rango por defecto (Do4–Do6) = diseño original: sin contenedor de desplazamiento y con 25 teclas', async () => {
    const { div } = await render({}); expect(div.querySelector('.kbscroll')).toBeNull(); expect(div.querySelectorAll('#kb > div')).toHaveLength(25); expect(div.querySelector('#kb')!.getAttribute('style')).toBeNull();
  });
  it('rango de dos manos habitual (Do2–Do7, 36 blancas) → contenedor con desplazamiento horizontal y ancho mínimo', async () => {
    expect(whiteKeys(36, 96)).toBe(36); const { div } = await render({ lo: 36, hi: 96 });
    expect(div.querySelector('.kbscroll #kb')).toBeTruthy(); expect((div.querySelector('#kb') as HTMLElement).style.minWidth).toBe('936px'); expect(div.querySelectorAll('#kb > div')).toHaveLength(61);
  });
  it('el piano completo (88 teclas) también se dibuja; el umbral es de 35 teclas blancas', async () => {
    const { div } = await render({ lo: 21, hi: 108 }); expect(div.querySelectorAll('#kb > div')).toHaveLength(88); expect(whiteKeys(21, 108)).toBe(52); expect(WIDE_WHITE_KEYS).toBe(35);
  });
  it('una octava menos del umbral no se envuelve (Do2–Do6 = 29 blancas)', async () => { const { div } = await render({ lo: 36, hi: 84 }); expect(div.querySelector('.kbscroll')).toBeNull(); });
  it('todas las teclas conservan data-m (necesario para el ratón) y marcan next/ok/bad/warn', async () => {
    const { div } = await render({ lo: 36, hi: 96, next: new Set([60, 61]), flashes: { 62: 'ok', 63: 'warn', 64: 'bad' } });
    expect([...div.querySelectorAll('#kb .next')].map((e) => e.getAttribute('data-m'))).toEqual(['60', '61']); for (const [m, c] of [[62, 'ok'], [63, 'warn'], [64, 'bad']] as const) expect(div.querySelector(`[data-m="${m}"]`)!.classList.contains(c)).toBe(true);
  });
  it('centra las teclas pendientes cuando quedan fuera de la vista (scrollTo)', async () => {
    const div = document.createElement('div'); document.body.append(div); const root = createRoot(div); const calls: any[] = [];
    const proto = HTMLElement.prototype as any; const sc = proto.scrollTo, ow = Object.getOwnPropertyDescriptor(proto, 'offsetLeft'), cw = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
    proto.scrollTo = function (o: any) { calls.push(o); }; Object.defineProperty(proto, 'offsetLeft', { configurable: true, get() { return (Number(this.getAttribute?.('data-m')) - 36) * 20; } }); Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return 400; } });
    try { await act(async () => { root.render(createElement(PianoKeyboard, { lo: 36, hi: 96, next: new Set([90]), flashes: {} })); }); } finally { proto.scrollTo = sc; if (ow) Object.defineProperty(proto, 'offsetLeft', ow); if (cw) Object.defineProperty(proto, 'clientWidth', cw); }
    expect(calls).toHaveLength(1); expect(calls[0].left).toBe(880);   // posición de la tecla (1080) menos media pantalla (200)
    expect(calls[0].behavior).toBe('smooth');
  });
});
