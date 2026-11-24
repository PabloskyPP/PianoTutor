// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CatalogPage } from '../../frontend/src/pages/Catalog';

type S = { id: string; title: string; genre: string; hands: 1 | 2; difficulty: number; origin: 'preloaded' | 'imported' | 'composed'; modifiedAt: string; revision: number; provisional: boolean };
const song = (id: string, title: string, origin: S['origin'], revision = 1): S => ({ id, title, genre: 'Clásica', hands: 1, difficulty: 2, origin, modifiedAt: '', revision, provisional: false });
let songs: S[]; let calls: { method: string; url: string; ifMatch?: string }[]; let deleteResponse: () => Response; let root: Root; let div: HTMLDivElement;

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  songs = [song('preloaded-oda-0001', 'Oda a la alegría', 'preloaded'), song('composed-mia-00001', 'Mi composición', 'composed', 3)]; calls = [];
  deleteResponse = () => { const id = calls.at(-1)!.url.split('/').pop()!; const s = songs.find((x) => x.id === id)!; songs = songs.filter((x) => x.id !== id); return new Response(JSON.stringify({ id, title: s.title, trashedAs: `trash/x-${id}` }), { status: 200 }); };
  (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'; calls.push({ method, url, ifMatch: (init?.headers as Record<string, string> | undefined)?.['if-match'] });
    if (method === 'DELETE') return deleteResponse();
    return new Response(JSON.stringify({ songs, errors: [] }), { status: 200 });
  });
  div = document.createElement('div'); document.body.append(div); root = createRoot(div);
  await act(async () => { root.render(createElement(CatalogPage)); });
});
afterEach(async () => { await act(async () => root.unmount()); div.remove(); });

const btn = (label: RegExp) => [...div.querySelectorAll('button')].find((b) => label.test(b.textContent ?? '')) as HTMLButtonElement | undefined;
const open = async (title: string) => { await act(async () => { [...div.querySelectorAll('button.link')].find((b) => b.textContent === title)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const click = async (b: HTMLButtonElement) => { await act(async () => { b.click(); }); };
const deletes = () => calls.filter((c) => c.method === 'DELETE');

describe('catálogo: botón «Eliminar canción»', () => {
  it('pide confirmación; «Cancelar» no elimina nada', async () => {
    await open('Mi composición'); await click(btn(/^Eliminar canción$/)!);
    expect(div.querySelector('[role=alertdialog]')!.textContent).toMatch(/¿Eliminar «Mi composición»\?.*data\/trash/s);
    await click(btn(/^Cancelar$/)!); expect(div.querySelector('[role=alertdialog]')).toBeNull(); expect(deletes()).toHaveLength(0); expect(div.textContent).toContain('Mi composición');
  });
  it('confirmar envía DELETE con la revisión que ve el usuario, retira la fila y avisa dónde quedó', async () => {
    await open('Mi composición'); await click(btn(/^Eliminar canción$/)!); await click(btn(/Sí, eliminar/)!);
    expect(deletes()).toEqual([{ method: 'DELETE', url: '/api/songs/composed-mia-00001', ifMatch: '3' }]);
    expect(div.querySelector('[role=status]')!.textContent).toMatch(/Canción eliminada: «Mi composición».*data\/trash/);
    expect([...div.querySelectorAll('button.link')].map((b) => b.textContent)).toEqual(['Oda a la alegría']);
  });
  it('las precargadas tienen el botón desactivado con explicación y no se puede lanzar DELETE', async () => {
    await open('Oda a la alegría'); const b = btn(/^Eliminar canción$/)!;
    expect(b.disabled).toBe(true); expect(div.textContent).toContain('Las canciones precargadas no se pueden eliminar.'); await click(b); expect(div.querySelector('[role=alertdialog]')).toBeNull(); expect(deletes()).toHaveLength(0);
  });
  it('un error del servidor (p. ej. conflicto) se muestra, la canción sigue y se puede reintentar', async () => {
    deleteResponse = () => new Response(JSON.stringify({ error: 'La canción cambió desde que la viste. Recarga el catálogo antes de eliminarla.' }), { status: 409 });
    await open('Mi composición'); await click(btn(/^Eliminar canción$/)!); await click(btn(/Sí, eliminar/)!);
    expect(div.querySelector('.notice.bad[role=alert]')!.textContent).toMatch(/cambió desde que la viste/); expect(div.textContent).toContain('Mi composición'); expect(btn(/^Eliminar canción$/)).toBeTruthy();
  });
  it('sin conexión con el servidor muestra un mensaje comprensible', async () => {
    (globalThis as any).fetch = vi.fn(async (_u: string, init?: RequestInit) => { if (init?.method === 'DELETE') throw new TypeError('Failed to fetch'); return new Response(JSON.stringify({ songs, errors: [] })); });
    await open('Mi composición'); await click(btn(/^Eliminar canción$/)!); await click(btn(/Sí, eliminar/)!);
    expect(div.textContent).toMatch(/No se pudo conectar con el servidor local/);
  });
});
