import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayingView } from '../../frontend/src/pages/PlayingView';

const htmlPath = path.resolve(__dirname, 'original/piano-tutor.html');
const html = fs.readFileSync(htmlPath, 'utf8');

/** Ejecuta el HTML original real en jsdom (sin canvas: su draw() final falla, pero el DOM ya está construido). */
function loadOriginal() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: new VirtualConsole() });
  return dom.window.document;
}
const norm = (el: Element): unknown => ({
  tag: el.tagName, id: el.id || undefined, cls: [...el.classList].sort().join(' ') || undefined,
  left: (el as HTMLElement).style?.left || undefined, width: (el as HTMLElement).style?.width || undefined,
  m: el.getAttribute('data-m') ?? undefined, n: el.getAttribute('data-n') ?? undefined,
  text: ['H1', 'B', 'OPTION', 'BUTTON', 'P', 'DIV', 'KBD', 'SPAN'].includes(el.tagName) && el.children.length === 0 ? el.textContent : undefined,
  kids: [...el.children].filter((c) => !c.hasAttribute('data-added')).map(norm),
});

describe('paridad de Playing con el HTML original', () => {
  const style = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  it('playing.css es byte a byte el <style> del original', () => {
    expect(fs.readFileSync(path.resolve(__dirname, '../../frontend/src/styles/playing.css'), 'utf8')).toBe(style);
  });

  const orig = loadOriginal();
  const titles = [...orig.querySelectorAll('#song option')].map((o) => o.textContent!);
  const mine = new JSDOM(renderToStaticMarkup(createElement(PlayingView, {
    songs: titles.map((t) => ({ id: t, title: t })), songId: titles[0]!, hits: 0, miss: 0, progress: 0,
    now: 'Mi', msg: '', micOn: false, inputText: orig.querySelector('#inp')!.textContent!, next: new Set([64]), flashes: {},
  }))).window.document;

  it('el original se ejecutó y construyó teclado y selector', () => {
    expect(orig.querySelectorAll('#kb > div').length).toBe(25);
    expect(titles.length).toBe(4);
  });
  it('misma estructura DOM, clases, estilos de teclas y textos (salvo los 2 botones de navegación añadidos)', () => {
    const a = norm(orig.querySelector('main')!) as any;
    const b = norm(mine.querySelector('main')!) as any;
    // El texto de ayuda final se corrigió a propósito (P16: el mapa llega a Re♯, no a Mi) y añade la frase del micrófono.
    const stripHelp = (n: any) => { n.kids = n.kids.map((k: any, i: number) => (i === n.kids.length - 1 ? { ...k, kids: k.kids.map((x: any) => ({ ...x, text: x.tag === 'KBD' ? x.text : undefined })), text: undefined } : k)); return n; };
    expect(stripHelp(b)).toEqual(stripHelp(a));
  });
  it('los únicos elementos añadidos son botones de navegación marcados con data-added', () => {
    const added = [...mine.querySelectorAll('[data-added]')];
    expect(added.map((e) => e.tagName)).toEqual(['BUTTON', 'BUTTON']);
    expect(added.map((e) => e.textContent)).toEqual(['← Menú', 'Catálogo']);
  });
  it('la nota siguiente (Mi4) está en naranja en el piano, igual que el original', () => {
    expect(mine.querySelector('#kb .next')?.getAttribute('data-m')).toBe('64');
    expect(orig.querySelector('#kb .next')?.getAttribute('data-m')).toBe('64');
  });
});
