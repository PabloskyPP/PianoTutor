// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';

/** Registra qué fuentes pide VexFlow al cargarse y qué peticiones de red hace al dibujar. Sin navegador real: comprueba el código, no el renderizado. */
const sources: string[] = []; const net: string[] = [];
beforeAll(() => {
  (globalThis as any).FontFace = class { constructor(public family: string, public src: string) { sources.push(String(src)); } load() { return Promise.resolve(this); } };
  (document as any).fonts = { add: () => {}, load: () => Promise.resolve([]), ready: Promise.resolve(), size: 0, status: 'loaded', addEventListener: () => {}, removeEventListener: () => {} };   // FontFaceSet mínimo pero completo
  (globalThis as any).fetch = vi.fn((u: string) => { net.push(String(u)); return Promise.reject(new Error('sin red')); });
  const open = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m: string, u: string | URL, ...r: any[]) { net.push(String(u)); return (open as any).call(this, m, u, ...r); };
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
});

describe('VexFlow sin conexión', () => {
  it('todas las fuentes registradas son data: URLs incrustadas (ninguna remota) y dibujar no usa la red', async () => {
    const { Renderer, Stave, StaveNote, Voice, Formatter } = await import('vexflow/bravura');
    await new Promise((r) => setTimeout(r, 20));
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) { expect(s).toMatch(/^url\(data:font\/woff2/); expect(s).not.toMatch(/https?:/); }
    const div = document.createElement('div'); const r = new Renderer(div, Renderer.Backends.SVG); r.resize(300, 150); const ctx = r.getContext();
    const st = new Stave(10, 10, 250).addClef('treble').addTimeSignature('4/4'); st.setContext(ctx).draw();
    const v = new Voice({ numBeats: 1, beatValue: 4 }).addTickables([new StaveNote({ keys: ['c/4'], duration: 'q' })]); new Formatter().joinVoices([v]).format([v], 100); v.draw(ctx, st);
    expect(net).toEqual([]);
  });
});
