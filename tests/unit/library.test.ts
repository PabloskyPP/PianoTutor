import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LibraryRepository } from '../../backend/src/library/repository';
import { writeFileAtomic } from '../../backend/src/library/atomic';
import { resolveInside, assertValidId } from '../../backend/src/library/safePath';
import { LibraryError } from '../../backend/src/library/errors';
import { loadAuthorizedRoots, resolveActiveRoot } from '../../backend/src/config';

const SEED = path.resolve(__dirname, '../../backend/seed');
let root: string; let repos: LibraryRepository[] = [];
const mk = async (r = root, o = {}) => { const x = new LibraryRepository(r, { seedDir: SEED, ...o }); await x.init(); repos.push(x); return x; };
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-')); });
afterEach(async () => { for (const r of repos) await r.dispose(); repos = []; fs.rmSync(root, { recursive: true, force: true }); });

describe('semilla y listado', () => {
  it('crea carpetas y copia las 4 canciones', async () => {
    const r = await mk(); const l = await r.list();
    expect(l.songs.map((s) => s.title).sort()).toHaveLength(4); expect(l.errors).toEqual([]);
    for (const d of ['songs', 'compositions', 'imports', 'drafts', 'backups']) expect(fs.existsSync(path.join(root, d))).toBe(true);
  });
  it('no pisa archivos existentes en un segundo arranque y no duplica', async () => {
    const r = await mk(); const f = path.join(root, 'songs', 'preloaded-jingle-bells.json');
    const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.title = 'Editada a mano'; fs.writeFileSync(f, JSON.stringify(j));
    await r.dispose(); const r2 = await mk();
    const l = await r2.list(); expect(l.songs).toHaveLength(4); expect(l.songs.some((s) => s.title === 'Editada a mano')).toBe(true);
  });
  it('un archivo corrupto no impide cargar el resto y se informa', async () => {
    fs.mkdirSync(path.join(root, 'songs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'songs', 'roto-roto-roto.json'), '{ esto no es json');
    fs.writeFileSync(path.join(root, 'songs', 'invalido-invalido.json'), JSON.stringify({ schemaVersion: 1 }));
    const r = await mk(); const l = await r.list();
    expect(l.songs).toHaveLength(4); expect(l.errors).toHaveLength(2);
    expect(l.errors.find((e) => e.file.includes('roto'))!.message).toMatch(/JSON/);
  });
  it('archivo cuyo nombre no coincide con su id se rechaza', async () => {
    const r = await mk(); fs.copyFileSync(path.join(root, 'songs', 'preloaded-jingle-bells.json'), path.join(root, 'songs', 'preloaded-otro-nombre.json'));
    const l = await r.list(); expect(l.songs).toHaveLength(4); expect(l.errors).toHaveLength(1);
  });
});

describe('guardar, revisión, copias y «Guardar como»', () => {
  it('Guardar como: copia propia en compositions/, original intacto, persiste tras reiniciar', async () => {
    const r = await mk(); const before = fs.readFileSync(path.join(root, 'songs', 'preloaded-jingle-bells.json'), 'utf8');
    const c = await r.saveAs('preloaded-jingle-bells', '  Mi Jingle  ');
    expect(c).toMatchObject({ title: 'Mi Jingle', origin: 'composed', revision: 1 }); expect(c.id).not.toBe('preloaded-jingle-bells');
    expect(fs.existsSync(path.join(root, 'compositions', `${c.id}.json`))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'songs', 'preloaded-jingle-bells.json'), 'utf8')).toBe(before);
    await r.dispose(); const r2 = await mk(); const l = await r2.list();
    expect(l.songs).toHaveLength(5); expect(l.songs.filter((s) => s.title === 'Mi Jingle')).toHaveLength(1);
  });
  it('las precargadas son de solo lectura', async () => {
    const r = await mk(); const s = await r.get('preloaded-jingle-bells');
    await expect(r.update(s.id, s, 1)).rejects.toMatchObject({ code: 'READ_ONLY' });
  });
  it('actualizar exige revisión; conflicto 409; sube revisión; crea copia de seguridad previa', async () => {
    const r = await mk(); const c = await r.saveAs('preloaded-jingle-bells', 'A');
    await expect(r.update(c.id, { ...c, title: 'B' }, undefined)).rejects.toMatchObject({ code: 'INVALID' });
    await expect(r.update(c.id, { ...c, title: 'B' }, 99)).rejects.toMatchObject({ code: 'CONFLICT' });
    const u = await r.update(c.id, { ...c, title: 'B' }, 1);
    expect(u).toMatchObject({ title: 'B', revision: 2, origin: 'composed' });
    const bk = fs.readdirSync(path.join(root, 'backups', c.id)); expect(bk).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'backups', c.id, bk[0]!), 'utf8')).title).toBe('A');
  });
  it('no permite cambiar id ni origen vía actualización', async () => {
    const r = await mk(); const c = await r.saveAs('preloaded-jingle-bells', 'A');
    const u = await r.update(c.id, { ...c, id: 'composed-otro-id-0001', origin: 'preloaded' }, 1);
    expect(u.id).toBe(c.id); expect(u.origin).toBe('composed');
  });
  it('rechaza contenido inválido sin tocar el archivo', async () => {
    const r = await mk(); const c = await r.saveAs('preloaded-jingle-bells', 'A'); const f = path.join(root, 'compositions', `${c.id}.json`); const before = fs.readFileSync(f, 'utf8');
    await expect(r.update(c.id, { ...c, difficulty: 99 }, 1)).rejects.toMatchObject({ code: 'INVALID' });
    expect(fs.readFileSync(f, 'utf8')).toBe(before);
  });
  it('las copias de seguridad se limitan a N', async () => {
    const r = await mk(root, { backupsToKeep: 3 }); let c = await r.saveAs('preloaded-jingle-bells', 'v1');
    for (let i = 0; i < 6; i++) c = await r.update(c.id, { ...c, title: `v${i + 2}` }, c.revision);
    expect(fs.readdirSync(path.join(root, 'backups', c.id))).toHaveLength(3);
  });
  it('título vacío o enorme en «Guardar como» se rechaza', async () => {
    const r = await mk(); await expect(r.saveAs('preloaded-jingle-bells', '   ')).rejects.toMatchObject({ code: 'INVALID' });
    await expect(r.saveAs('preloaded-jingle-bells', 'x'.repeat(121))).rejects.toMatchObject({ code: 'INVALID' });
    await expect(r.saveAs('no-existe-nada-1', 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('un fallo de escritura no deja la copia a medias', async () => {
    const r = await mk();
    (r as any).opts.atomic = { rename: async () => { throw Object.assign(new Error('x'), { code: 'EACCES' }); }, retries: 0 }; // falla solo tras init()
    await expect(r.saveAs('preloaded-jingle-bells', 'X')).rejects.toMatchObject({ code: 'IO', message: expect.stringMatching(/permisos/) });
    expect(fs.readdirSync(path.join(root, 'compositions'))).toEqual([]);
  });
});

describe('escritura atómica', () => {
  it('escribe y no deja temporales', async () => {
    const f = path.join(root, 'a.json'); await writeFileAtomic(f, '{"a":1}'); expect(fs.readFileSync(f, 'utf8')).toBe('{"a":1}'); expect(fs.readdirSync(root)).toEqual(['a.json']);
  });
  it('si el rename falla, el original queda intacto y se limpia el temporal', async () => {
    const f = path.join(root, 'a.json'); fs.writeFileSync(f, 'ORIGINAL');
    await expect(writeFileAtomic(f, 'NUEVO', { rename: async () => { throw Object.assign(new Error('boom'), { code: 'EIO' }); } })).rejects.toThrow('boom');
    expect(fs.readFileSync(f, 'utf8')).toBe('ORIGINAL'); expect(fs.readdirSync(root)).toEqual(['a.json']);
  });
  it('reintenta ante EPERM/EBUSY (antivirus en Windows) y acaba escribiendo', async () => {
    const f = path.join(root, 'a.json'); let n = 0;
    await writeFileAtomic(f, 'OK', { rename: async (a, b) => { if (n++ < 2) throw Object.assign(new Error('busy'), { code: 'EPERM' }); await fs.promises.rename(a, b); } });
    expect(n).toBe(3); expect(fs.readFileSync(f, 'utf8')).toBe('OK');
  });
  it('agota los reintentos y propaga el error', async () => {
    await expect(writeFileAtomic(path.join(root, 'a'), 'x', { retries: 2, rename: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } })).rejects.toThrow('busy');
  });
});

describe('rutas seguras', () => {
  it('ids válidos e inválidos', () => {
    expect(() => assertValidId('preloaded-jingle-bells')).not.toThrow();
    for (const bad of ['../x', 'a/b-cdefgh', 'ABCDEFGH', 'short', 'a'.repeat(65), '', 'ok-ok-ok\\..\\x', 'x..-xxxxxxxx.', undefined, 5]) expect(() => assertValidId(bad)).toThrow(LibraryError);
  });
  it('resolveInside rechaza escapes con .. y rutas absolutas', () => {
    expect(() => resolveInside(root, '..', 'x')).toThrow(LibraryError);
    expect(() => resolveInside(root, 'songs', '..', '..', 'etc')).toThrow(LibraryError);
    expect(() => resolveInside(root, path.resolve(root, '..', 'otra'))).toThrow(LibraryError);
    expect(resolveInside(root, 'songs', 'a.json')).toBe(path.join(fs.realpathSync(root), 'songs', 'a.json'));
  });
  it.skipIf(process.platform === 'win32')('rechaza un symlink que sale de la raíz', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-out-')); fs.symlinkSync(outside, path.join(root, 'link'));
    expect(() => resolveInside(root, 'link', 'x.json')).toThrow(LibraryError); fs.rmSync(outside, { recursive: true, force: true });
  });
});

describe('bloqueo de instancia única', () => {
  it('una segunda instancia sobre la misma biblioteca falla y tras dispose() se libera', async () => {
    const a = await mk();
    // Simula otro proceso vivo: el PID del padre (siempre existe y es distinto del actual).
    fs.writeFileSync(path.join(root, '.pianotutor.lock'), String(process.ppid));
    await a.dispose(); fs.writeFileSync(path.join(root, '.pianotutor.lock'), String(process.ppid));
    const b = new LibraryRepository(root, { seedDir: SEED }); await expect(b.init()).rejects.toMatchObject({ code: 'LOCKED' });
    fs.rmSync(path.join(root, '.pianotutor.lock')); const c = await mk(); expect(c).toBeTruthy();
  });
  it('un bloqueo huérfano (PID inexistente) se recupera', async () => {
    fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, '.pianotutor.lock'), '2147480000'); await mk();
  });
});

describe('raíces autorizadas', () => {
  it('por defecto ./data; por entorno; ajustes no autorizados caen a la primera', () => {
    expect(loadAuthorizedRoots({}, '/repo')).toEqual([path.resolve('/repo', 'data')]);
    expect(loadAuthorizedRoots({ PIANOTUTOR_ROOTS: ['/a', '/b'].join(path.delimiter) } as any, '/repo')).toEqual([path.resolve('/a'), path.resolve('/b')]);
    expect(resolveActiveRoot(['/a', '/b'], { libraryRoot: '/b' })).toEqual({ root: '/b' });
    expect(resolveActiveRoot(['/a', '/b'], { libraryRoot: '/etc' }).root).toBe('/a');
    expect(resolveActiveRoot(['/a', '/b'], { libraryRoot: '/etc' }).warning).toBeTruthy();
  });
});
