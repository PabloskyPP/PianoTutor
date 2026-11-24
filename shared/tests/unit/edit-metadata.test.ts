// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LibraryRepository } from '../../backend/src/library/repository';
import { createApp } from '../../backend/src/server';
import { CatalogPage } from '../../frontend/src/pages/Catalog';

const SEED = path.resolve(__dirname, '../../backend/seed');
let root: string, repo: LibraryRepository, app: Awaited<ReturnType<typeof createApp>>;
const H = { host: '127.0.0.1:4173', 'content-type': 'application/json' };
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-edit-')); repo = new LibraryRepository(path.join(root, 'lib'), { seedDir: SEED }); await repo.init();
  app = await createApp({ repo, port: 4173, roots: [repo.root], settingsFile: path.join(root, 's.json') });
});
afterEach(async () => { await app.close(); await repo.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
const patch = (id: string, body: unknown, rev?: string) => app.inject({ method: 'PATCH', url: `/api/songs/${id}/metadata`, headers: { ...H, ...(rev ? { 'if-match': rev } : {}) }, payload: body as any });

describe('editar título, género y dificultad (servidor)', () => {
  it('cambia solo esos datos, sube la revisión, guarda copia de seguridad y persiste tras reiniciar', async () => {
    const c = await repo.saveAs('preloaded-jingle-bells', 'Mi copia'); const r = await patch(c.id, { title: '  Nuevo título ', genre: 'Jazz', difficulty: 7 }, '1');
    expect(r.statusCode).toBe(200); expect(r.json()).toMatchObject({ title: 'Nuevo título', genre: 'Jazz', difficulty: 7, revision: 2, hands: 1 });
    expect(r.json().parts).toEqual(c.parts); expect(fs.readdirSync(path.join(repo.root, 'backups', c.id))).toHaveLength(1);
    await repo.dispose(); const r2 = new LibraryRepository(repo.root, { seedDir: SEED }); await r2.init(); expect((await r2.get(c.id)).title).toBe('Nuevo título'); await r2.dispose(); await repo.init();
  });
  it('las precargadas también se editan (las notas no cambian) y dejan de ser «provisionales» en género/dificultad; sigue provisional el ritmo', async () => {
    const before = await repo.get('preloaded-para-elisa'); const r = await patch('preloaded-para-elisa', { difficulty: 6 }, '1'); const s = r.json();
    expect([r.statusCode, s.difficulty, s.title]).toEqual([200, 6, before.title]); expect(s.parts).toEqual(before.parts); expect(s.provisional).toMatchObject({ metadata: false, rhythm: true }); expect(s.origin).toBe('preloaded');
    expect((await patch('preloaded-para-elisa', { title: 'Otro nombre' }, '2')).json().provisional.metadata).toBe(false);   // solo el título: no toca la marca (ya estaba en false)
  });
  it('solo cambiar el título de una precargada NO quita lo provisional del género/dificultad', async () => {
    expect((await patch('preloaded-jingle-bells', { title: 'Jingle' }, '1')).json().provisional.metadata).toBe(true);
  });
  it('rechaza: sin cambios, vacíos, fuera de rango, campos ajenos, sin revisión, revisión vieja, inexistente, id con rutas', async () => {
    const id = 'preloaded-jingle-bells';
    for (const bad of [{}, { title: '  ' }, { genre: '' }, { difficulty: 11 }, { difficulty: 0 }, { difficulty: 2.5 }, { title: 'x'.repeat(121) }, { hands: 2 }, { id: 'otro-id-0000' }, { origin: 'composed' }]) expect((await patch(id, bad, '1')).statusCode, JSON.stringify(bad)).toBe(400);
    expect((await patch(id, { title: 'A' })).statusCode).toBe(400); expect((await patch(id, { title: 'A' }, '9')).statusCode).toBe(409);
    expect((await patch('no-existe-nada', { title: 'A' }, '1')).statusCode).toBe(404); expect((await patch('..%2Fx', { title: 'A' }, '1')).statusCode).toBe(400);
    expect((await repo.get(id)).revision).toBe(1);
  });
  it('si falla la escritura la canción queda como estaba; Host ajeno no puede editar', async () => {
    const c = await repo.saveAs('preloaded-jingle-bells', 'X'); (repo as any).opts.atomic = { rename: async () => { throw Object.assign(new Error('x'), { code: 'EACCES' }); }, retries: 0 };
    expect((await patch(c.id, { title: 'Y' }, '1')).statusCode).toBe(500); (repo as any).opts.atomic = undefined; expect((await repo.get(c.id)).title).toBe('X');
    expect((await app.inject({ method: 'PATCH', url: `/api/songs/${c.id}/metadata`, headers: { host: 'evil.example', 'content-type': 'application/json', 'if-match': '1' }, payload: { title: 'Z' } })).statusCode).toBe(403);
  });
});

describe('editar en el catálogo (interfaz)', () => {
  let div: HTMLDivElement, rt: Root, calls: { method: string; url: string; body?: any; ifMatch?: string }[], songs: any[], fail: Response | null;
  beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; calls = []; fail = null;
    songs = [{ id: 'composed-mia-00001', title: 'Mi canción', genre: 'Pop', hands: 1, difficulty: 3, origin: 'composed', modifiedAt: '', revision: 4, provisional: false }];
    (globalThis as any).fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'; calls.push({ method, url, body: init?.body ? JSON.parse(init.body as string) : undefined, ifMatch: (init?.headers as any)?.['if-match'] });
      if (method === 'PATCH') { if (fail) return fail; const b = JSON.parse(init!.body as string); songs = [{ ...songs[0], ...b, revision: 5 }]; return new Response(JSON.stringify(songs[0])); }
      return new Response(JSON.stringify({ songs, errors: [] }));
    });
    div = document.createElement('div'); document.body.append(div); rt = createRoot(div); await act(async () => { rt.render(createElement(CatalogPage)); });
  });
  afterEach(async () => { await act(async () => rt.unmount()); div.remove(); });
  const btn = (re: RegExp) => [...div.querySelectorAll('button')].find((b) => re.test(b.textContent ?? '')) as HTMLButtonElement;
  const type = async (el: HTMLInputElement | HTMLSelectElement, v: string) => { await act(async () => { const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!; set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); };
  const open = async () => { await act(async () => { (div.querySelector('button.link') as HTMLElement).click(); }); await act(async () => { btn(/Editar datos/).click(); }); };

  it('abre el formulario con los datos actuales; «Cancelar» no envía nada', async () => {
    await open(); const [t, g] = [...div.querySelectorAll('[aria-label="Editar datos"] input')] as HTMLInputElement[];
    expect([t!.value, g!.value, (div.querySelector('[aria-label="Editar datos"] select') as HTMLSelectElement).value]).toEqual(['Mi canción', 'Pop', '3']);
    await act(async () => { btn(/^Cancelar$/).click(); }); expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0); expect(div.querySelector('[aria-label="Editar datos"]')).toBeNull();
  });
  it('guardar envía PATCH con la revisión vigente, refresca la lista y confirma', async () => {
    await open(); const [t, g] = [...div.querySelectorAll('[aria-label="Editar datos"] input')] as HTMLInputElement[];
    await type(t!, 'Otro nombre'); await type(g!, 'Rock'); await type(div.querySelector('[aria-label="Editar datos"] select') as HTMLSelectElement, '8'); await act(async () => { btn(/Guardar cambios/).click(); });
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/songs/composed-mia-00001/metadata', ifMatch: '4', body: { title: 'Otro nombre', genre: 'Rock', difficulty: 8 } });
    expect(div.querySelector('[role=status]')!.textContent).toMatch(/Cambios guardados: «Otro nombre»/); expect(div.textContent).toMatch(/Otro nombre.*Rock.*8/s);
  });
  it('con título o género vacíos no se puede guardar; un error del servidor se muestra y se conserva el formulario', async () => {
    await open(); const t = div.querySelector('[aria-label="Editar datos"] input') as HTMLInputElement; await type(t, '  '); expect(btn(/Guardar cambios/).disabled).toBe(true);
    await type(t, 'Válido'); fail = new Response(JSON.stringify({ error: 'La canción cambió desde que la viste. Recarga el catálogo antes de editarla.' }), { status: 409 });
    await act(async () => { btn(/Guardar cambios/).click(); }); expect(div.querySelector('.notice.bad')!.textContent).toMatch(/cambió desde que la viste/); expect(div.querySelector('[aria-label="Editar datos"]')).not.toBeNull();
  });
});
