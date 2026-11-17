import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LibraryRepository } from '../../backend/src/library/repository';
import { createApp } from '../../backend/src/server';

const SEED = path.resolve(__dirname, '../../backend/seed');
let root: string, repo: LibraryRepository, app: Awaited<ReturnType<typeof createApp>>, settingsFile: string;
const H = { host: '127.0.0.1:4173' };
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-api-')); settingsFile = path.join(root, 'cfg', 'settings.json');
  repo = new LibraryRepository(path.join(root, 'lib'), { seedDir: SEED }); await repo.init();
  app = await createApp({ repo, port: 4173, roots: [repo.root, path.join(root, 'otra')], settingsFile });
});
afterEach(async () => { await app.close(); await repo.dispose(); fs.rmSync(root, { recursive: true, force: true }); });

describe('API local', () => {
  it('lista las 4 canciones', async () => {
    const r = await app.inject({ url: '/api/songs', headers: H }); const b = r.json();
    expect(r.statusCode).toBe(200); expect(b.songs).toHaveLength(4); expect(b.errors).toEqual([]);
  });
  it('rechaza Host ajeno (DNS rebinding) y Origin ajeno', async () => {
    expect((await app.inject({ url: '/api/songs', headers: { host: 'evil.example:4173' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/songs', headers: { ...H, origin: 'https://evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/songs', headers: { ...H, origin: 'http://127.0.0.1:4173' } })).statusCode).toBe(200);
  });
  it('ids con rutas se rechazan; inexistente da 404', async () => {
    expect((await app.inject({ url: '/api/songs/..%2F..%2Fetc%2Fpasswd', headers: H })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/songs/no-existe-nada', headers: H })).statusCode).toBe(404);
  });
  it('flujo guardar-como -> PUT con If-Match -> 409 con revisión vieja', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/songs/preloaded-jingle-bells/save-as', headers: H, payload: { title: 'Copia' } });
    expect(created.statusCode).toBe(201); const song = created.json();
    const put = await app.inject({ method: 'PUT', url: `/api/songs/${song.id}`, headers: { ...H, 'if-match': '1' }, payload: { ...song, title: 'Cambiada' } });
    expect(put.statusCode).toBe(200); expect(put.json()).toMatchObject({ title: 'Cambiada', revision: 2 });
    const stale = await app.inject({ method: 'PUT', url: `/api/songs/${song.id}`, headers: { ...H, 'if-match': '1' }, payload: { ...song, title: 'Otra' } });
    expect(stale.statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: `/api/songs/${song.id}`, headers: H, payload: song })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/songs/preloaded-jingle-bells', headers: { ...H, 'if-match': '1' }, payload: song })).statusCode).toBe(403);
  });
  it('«Guardar como» con título inválido da 400', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/songs/preloaded-jingle-bells/save-as', headers: H, payload: { title: '' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/songs/preloaded-jingle-bells/save-as', headers: H, payload: {} })).statusCode).toBe(400);
  });
  it('ajustes: solo se elige entre raíces autorizadas por índice, nunca una ruta', async () => {
    const g = (await app.inject({ url: '/api/settings', headers: H })).json(); expect(g.roots).toHaveLength(2); expect(g.roots[0].active).toBe(true);
    for (const bad of [{ rootIndex: 5 }, { rootIndex: -1 }, { rootIndex: '/etc' }, { rootIndex: 1.5 }, {}])
      expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: H, payload: bad })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/api/settings', headers: H, payload: { rootIndex: 1 } });
    expect(ok.json()).toEqual({ restartRequired: true }); expect(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).libraryRoot).toBe(path.join(root, 'otra'));
  });
  it('rutas /api desconocidas no devuelven HTML', async () => { expect((await app.inject({ url: '/api/nada', headers: H })).statusCode).toBe(404); });
});
