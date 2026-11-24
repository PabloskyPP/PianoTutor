import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LibraryRepository } from '../../backend/src/library/repository';
import { createApp } from '../../backend/src/server';
import { DEFAULT_PREFERENCES } from '@pianotutor/shared';

const SEED = path.resolve(__dirname, '../../backend/seed');
let root: string, repo: LibraryRepository, app: Awaited<ReturnType<typeof createApp>>, file: string;
const H = { host: '127.0.0.1:4173' }, J = { ...H, 'content-type': 'application/json' };
const mkApp = async () => createApp({ repo, port: 4173, roots: [repo.root, path.join(root, 'otra')], settingsFile: file });
const get = async () => (await app.inject({ url: '/api/preferences', headers: H })).json().preferences;
const put = (body: unknown) => app.inject({ method: 'PUT', url: '/api/preferences', headers: J, payload: body as any });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-pref-')); file = path.join(root, 'cfg', 'settings.json');
  repo = new LibraryRepository(path.join(root, 'lib'), { seedDir: SEED }); await repo.init(); app = await mkApp();
});
afterEach(async () => { await app.close(); await repo.dispose(); fs.rmSync(root, { recursive: true, force: true }); });

describe('API de preferencias', () => {
  it('sin archivo devuelve los valores por defecto', async () => { expect(await get()).toEqual(DEFAULT_PREFERENCES); });
  it('cambio parcial (incluido mic anidado) persiste, y sobrevive a reiniciar el servidor', async () => {
    expect((await put({ latencyMs: 35, mode: 'rhythm', mic: { sensitivity: 2 } })).statusCode).toBe(200);
    expect(await get()).toMatchObject({ latencyMs: 35, mode: 'rhythm', profile: 'beginner', mic: { sensitivity: 2, acceptAnyOctave: true } });
    await app.close(); app = await mkApp(); expect(await get()).toMatchObject({ latencyMs: 35, mic: { sensitivity: 2 } });
  });
  it('valores inválidos → 400 con motivos y el archivo NO cambia', async () => {
    await put({ latencyMs: 10 }); const before = fs.readFileSync(file, 'utf8');
    for (const bad of [{ latencyMs: 9999 }, { mode: 'turbo' }, { mic: { sensitivity: -1 } }, 'texto', null, [1]]) expect((await put(bad)).statusCode, JSON.stringify(bad)).toBe(400);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
  it('elegir biblioteca (PUT /api/settings) NO borra las preferencias, y guardar preferencias no borra la biblioteca elegida', async () => {
    await put({ speed: 0.5 });
    expect((await app.inject({ method: 'PUT', url: '/api/settings', headers: J, payload: { rootIndex: 1 } })).json()).toEqual({ restartRequired: true });
    let s = JSON.parse(fs.readFileSync(file, 'utf8')); expect(s.libraryRoot).toBe(path.join(root, 'otra')); expect(s.preferences.speed).toBe(0.5);
    await put({ latencyMs: 5 }); s = JSON.parse(fs.readFileSync(file, 'utf8')); expect(s.libraryRoot).toBe(path.join(root, 'otra')); expect(s.preferences).toMatchObject({ speed: 0.5, latencyMs: 5 });
  });
  it('dos cambios simultáneos se aplican ambos (escritura serializada)', async () => {
    await Promise.all([put({ latencyMs: 12 }), put({ speed: 0.75 }), put({ mic: { acceptAnyOctave: false } }), put({ metronome: false })]);
    expect(await get()).toMatchObject({ latencyMs: 12, speed: 0.75, metronome: false, mic: { acceptAnyOctave: false } });
  });
  it('archivo dañado o con campos antiguos: se leen los campos válidos y el resto vuelve a su valor por defecto; nunca da error', async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '{ roto');
    expect(await get()).toEqual(DEFAULT_PREFERENCES);
    fs.writeFileSync(file, JSON.stringify({ libraryRoot: '/x', preferences: { latencyMs: 20, speed: 99, viejo: true } })); expect(await get()).toMatchObject({ latencyMs: 20, speed: 1 });
  });
  it('Host/Origin ajenos no pueden cambiar preferencias', async () => {
    expect((await app.inject({ method: 'PUT', url: '/api/preferences', headers: { host: 'evil.example', 'content-type': 'application/json' }, payload: { latencyMs: 1 } })).statusCode).toBe(403);
  });
});
