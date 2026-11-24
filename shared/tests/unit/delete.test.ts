import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LibraryRepository } from '../../backend/src/library/repository';
import { createApp } from '../../backend/src/server';
import { buildMidi, seq, note, attrs, measure, score, part, enc } from '../helpers/builders';

const SEED = path.resolve(__dirname, '../../backend/seed');
let root: string, repo: LibraryRepository, app: Awaited<ReturnType<typeof createApp>>;
const H = { host: '127.0.0.1:4173' };
const JSON_H = { ...H, 'content-type': 'application/json' };
const XML = score(part('P1', measure(1, attrs('<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>') + note('C', 4, 4))));
const exists = (...p: string[]) => fs.existsSync(path.join(repo.root, ...p));
const ls = (d: string) => (exists(d) ? fs.readdirSync(path.join(repo.root, d)) : []);

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-del-'));
  repo = new LibraryRepository(path.join(root, 'lib'), { seedDir: SEED }); await repo.init();
  app = await createApp({ repo, port: 4173, roots: [repo.root], settingsFile: path.join(root, 's.json') });
});
afterEach(async () => { await app.close(); await repo.dispose(); fs.rmSync(root, { recursive: true, force: true }); });

const importOne = async () => (await app.inject({ method: 'POST', url: '/api/import?fileName=a.musicxml&hands=1&title=Mi%20import&genre=G&difficulty=2', headers: { ...H, 'content-type': 'application/octet-stream' }, payload: Buffer.from(enc(XML)) })).json();

describe('eliminar canciones (mover a data/trash)', () => {
  it('composición propia: sale del catálogo, queda recuperable en trash y no reaparece tras reiniciar', async () => {
    const c = await repo.saveAs('preloaded-jingle-bells', 'Para borrar');
    const r = await repo.delete(c.id, 1);
    expect(r).toMatchObject({ id: c.id, title: 'Para borrar' }); expect(r.trashedAs).toMatch(new RegExp(`^trash/.+-${c.id}$`));
    expect(exists('compositions', `${c.id}.json`)).toBe(false);
    const trashed = JSON.parse(fs.readFileSync(path.join(repo.root, r.trashedAs, 'song.json'), 'utf8')); expect(trashed).toMatchObject({ id: c.id, title: 'Para borrar' });
    expect((await repo.list()).songs.some((s) => s.id === c.id)).toBe(false);
    await repo.dispose(); const r2 = new LibraryRepository(repo.root, { seedDir: SEED }); await r2.init();
    const l = await r2.list(); expect(l.songs).toHaveLength(4); expect(l.errors).toEqual([]);   // trash no se escanea: ni aparece ni da errores
    await r2.dispose(); await repo.init();
  });
  it('importada: se mueve también el archivo original; el trash conserva ambos', async () => {
    const s = await importOne(); expect(exists('imports', s.id, 'original.musicxml')).toBe(true);
    const r = await repo.delete(s.id, 1);
    expect(exists('songs', `${s.id}.json`)).toBe(false); expect(exists('imports', s.id)).toBe(false);
    expect(fs.readFileSync(path.join(repo.root, r.trashedAs, 'imports', 'original.musicxml'))).toEqual(Buffer.from(enc(XML)));
    expect(exists(r.trashedAs, 'song.json')).toBe(true);
  });
  it('se llevan también las copias de seguridad si existen', async () => {
    const c = await repo.saveAs('preloaded-jingle-bells', 'A'); const u = await repo.update(c.id, { ...c, title: 'B' }, 1);
    expect(exists('backups', c.id)).toBe(true); const r = await repo.delete(c.id, u.revision);
    expect(exists('backups', c.id)).toBe(false); expect(exists(r.trashedAs, 'backups')).toBe(true);
  });
  it('las precargadas NO se pueden eliminar y siguen intactas', async () => {
    const before = fs.readFileSync(path.join(repo.root, 'songs', 'preloaded-jingle-bells.json'), 'utf8');
    await expect(repo.delete('preloaded-jingle-bells', 1)).rejects.toMatchObject({ code: 'READ_ONLY', message: expect.stringMatching(/precargadas/) });
    expect(fs.readFileSync(path.join(repo.root, 'songs', 'preloaded-jingle-bells.json'), 'utf8')).toBe(before); expect(ls('trash')).toEqual([]);
  });
  it('exige revisión y detecta cambios concurrentes (nada se mueve)', async () => {
    const c = await repo.saveAs('preloaded-jingle-bells', 'A'); await repo.update(c.id, { ...c, title: 'Cambiada' }, 1);
    await expect(repo.delete(c.id, undefined)).rejects.toMatchObject({ code: 'INVALID' });
    await expect(repo.delete(c.id, 1)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(exists('compositions', `${c.id}.json`)).toBe(true); expect(ls('trash')).toEqual([]);
  });
  it('inexistente → 404; id con rutas → inválido', async () => {
    await expect(repo.delete('no-existe-nada', 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    for (const bad of ['../x', '..%2Fx', 'a/b-cdefgh', '']) await expect(repo.delete(bad, 1)).rejects.toMatchObject({ code: 'INVALID' });
  });
  it('si falla el movimiento de la canción se deshace lo ya movido: la canción importada queda completa', async () => {
    const s = await importOne();
    (repo as any).opts.atomic = { rename: async (a: string, b: string) => { if (b.endsWith('song.json')) throw Object.assign(new Error('x'), { code: 'EACCES' }); await fs.promises.rename(a, b); } };
    await expect(repo.delete(s.id, 1)).rejects.toMatchObject({ code: 'IO', message: expect.stringMatching(/eliminar la canción.*permisos/) });
    expect(exists('songs', `${s.id}.json`)).toBe(true); expect(exists('imports', s.id, 'original.musicxml')).toBe(true); expect(ls('trash')).toEqual([]);
    (repo as any).opts.atomic = undefined; expect((await repo.list()).songs.some((x) => x.id === s.id)).toBe(true);
  });
  it('reintenta ante EPERM transitorio (antivirus en Windows) y acaba eliminando', async () => {
    const c = await repo.saveAs('preloaded-jingle-bells', 'X'); let n = 0;
    (repo as any).opts.atomic = { rename: async (a: string, b: string) => { if (n++ < 2) throw Object.assign(new Error('busy'), { code: 'EPERM' }); await fs.promises.rename(a, b); } };
    await repo.delete(c.id, 1); expect(exists('compositions', `${c.id}.json`)).toBe(false);
  });
});

describe('API DELETE /api/songs/:id', () => {
  it('200 con If-Match correcto; la lista ya no la incluye', async () => {
    const c = (await app.inject({ method: 'POST', url: '/api/songs/preloaded-jingle-bells/save-as', headers: JSON_H, payload: { title: 'Copia' } })).json();
    const r = await app.inject({ method: 'DELETE', url: `/api/songs/${c.id}`, headers: { ...H, 'if-match': '1' } });
    expect(r.statusCode).toBe(200); expect(r.json()).toMatchObject({ id: c.id, title: 'Copia' });
    expect((await app.inject({ url: '/api/songs', headers: H })).json().songs.map((s: any) => s.id)).not.toContain(c.id);
    expect((await app.inject({ url: `/api/songs/${c.id}`, headers: H })).statusCode).toBe(404);
  });
  it('403 precargada, 409 revisión vieja, 400 sin If-Match, 404 inexistente, 400 id inválido', async () => {
    const c = (await app.inject({ method: 'POST', url: '/api/songs/preloaded-jingle-bells/save-as', headers: JSON_H, payload: { title: 'Copia' } })).json();
    const del = (id: string, im?: string) => app.inject({ method: 'DELETE', url: `/api/songs/${id}`, headers: { ...H, ...(im ? { 'if-match': im } : {}) } });
    expect((await del('preloaded-jingle-bells', '1')).statusCode).toBe(403); expect((await del(c.id, '9')).statusCode).toBe(409); expect((await del(c.id)).statusCode).toBe(400);
    expect((await del('no-existe-nada', '1')).statusCode).toBe(404); expect((await del('..%2F..%2Fetc', '1')).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/songs/${c.id}`, headers: H })).statusCode).toBe(200);   // sigue existiendo tras los intentos fallidos
  });
  it('Host/Origin ajenos no pueden eliminar (protección CSRF/rebinding)', async () => {
    const c = (await app.inject({ method: 'POST', url: '/api/songs/preloaded-jingle-bells/save-as', headers: JSON_H, payload: { title: 'Copia' } })).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/songs/${c.id}`, headers: { host: 'evil.example', 'if-match': '1' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/songs/${c.id}`, headers: { ...H, origin: 'https://evil.example', 'if-match': '1' } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/songs/${c.id}`, headers: H })).statusCode).toBe(200);
  });
});
