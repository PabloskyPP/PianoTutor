import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LibraryRepository } from '../../backend/src/library/repository';
import { createApp } from '../../backend/src/server';
import { buildMidi, seq, note, attrs, measure, score, part, enc, mxl } from '../helpers/builders';

const SEED = path.resolve(__dirname, '../../backend/seed');
let root: string, repo: LibraryRepository, app: Awaited<ReturnType<typeof createApp>>;
const H = { host: '127.0.0.1:4173', 'content-type': 'application/octet-stream' };
const A4 = attrs('<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>');
const XML = score(part('P1', measure(1, A4 + note('C', 4, 1) + note('D', 4, 1) + note('E', 4, 1) + note('F', 4, 1))), 'Escala');
const Q = (o: Record<string, string>) => '?' + new URLSearchParams(o).toString();
const META = { title: 'Mi escala', genre: 'Ejercicio', difficulty: '2', hands: '1' };
const post = (url: string, body: Uint8Array, headers = H) => app.inject({ method: 'POST', url, headers, payload: Buffer.from(body) });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-imp-'));
  repo = new LibraryRepository(path.join(root, 'lib'), { seedDir: SEED }); await repo.init();
  app = await createApp({ repo, port: 4173, roots: [repo.root], settingsFile: path.join(root, 's.json') });
});
afterEach(async () => { await app.close(); await repo.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
const listDir = (d: string) => fs.existsSync(path.join(repo.root, d)) ? fs.readdirSync(path.join(repo.root, d)) : [];

describe('previsualización', () => {
  it('analiza sin guardar nada: estadísticas, informe y detección', async () => {
    const r = await post('/api/import/preview' + Q({ fileName: 'escala.musicxml' }), enc(XML)); const b = r.json();
    expect(r.statusCode).toBe(200);
    expect(b.stats).toMatchObject({ measures: 1, notes: 4, staves: 1, lowMidi: 60, highMidi: 65 }); expect(b.detected).toMatchObject({ kind: 'musicxml', suggestedTitle: 'Escala', suggestedHands: 1, staffCount: 1 });
    expect(b.song.parts[0].staves[0].events).toHaveLength(4); expect(b.handsProblem).toBeNull();
    expect(listDir('songs')).toHaveLength(4); expect(listDir('imports')).toEqual([]);   // el catálogo no cambia
  });
  it('informa si las manos elegidas no encajan', async () => {
    expect((await post('/api/import/preview' + Q({ fileName: 'a.xml', hands: '2' }), enc(XML))).json().handsProblem).toMatch(/1 pentagrama/);
  });
  it('MIDI: opciones de cuantización y manos cambian la vista previa', async () => {
    const midi = buildMidi([seq([[72, 480], [48, 480]])]);
    const a = (await post('/api/import/preview' + Q({ fileName: 'a.mid', hands: '2', split: '60' }), midi)).json(), b = (await post('/api/import/preview' + Q({ fileName: 'a.mid', hands: '2', split: '40' }), midi)).json();
    const notesOf = (s: any, i: number) => s.song.parts[0].staves[i].events.filter((e: any) => e.type !== 'rest').length;
    expect([notesOf(a, 0), notesOf(a, 1)]).toEqual([1, 1]); expect([notesOf(b, 0), notesOf(b, 1)]).toEqual([2, 0]);
  });
  it('archivos inválidos → 422 con mensaje comprensible', async () => {
    for (const [name, bytes, re] of [['a.musicxml', enc('<hola>'), /XML válido|no parece/], ['a.mid', Uint8Array.from([1, 2, 3]), /MIDI válido/], ['a.pdf', enc('%PDF'), /no soportado/], ['a.mxl', Uint8Array.from([0x50, 0x4b, 0, 0]), /zip/]] as const) {
      const r = await post('/api/import/preview' + Q({ fileName: name }), bytes); expect(r.statusCode, name).toBe(422); expect(r.json().error).toMatch(re);
    }
  });
  it('sin cuerpo, parámetros absurdos y tipo de contenido incorrecto', async () => {
    expect((await post('/api/import/preview' + Q({ fileName: 'a.xml' }), new Uint8Array(0))).statusCode).toBe(400);
    expect((await post('/api/import/preview' + Q({ fileName: 'a.mid', grid: 'enorme' }), buildMidi([seq([[60, 480]])]))).statusCode).toBe(400);
    expect((await post('/api/import/preview' + Q({ fileName: 'a.xml' }), enc(XML), { host: H.host, 'content-type': 'text/plain' })).statusCode).toBe(400);  // solo se acepta application/octet-stream
  });
});

describe('guardar canción importada', () => {
  it('MusicXML: crea JSON validado + original idéntico; aparece en la lista y persiste tras reiniciar', async () => {
    const r = await post('/api/import' + Q({ fileName: 'escala.musicxml', ...META }), enc(XML)); expect(r.statusCode).toBe(201);
    const s = r.json(); expect(s).toMatchObject({ origin: 'imported', title: 'Mi escala', genre: 'Ejercicio', hands: 1, difficulty: 2, revision: 1 });
    expect(s.id).toMatch(/^imported-[0-9a-f-]{36}$/); expect(s.source).toMatchObject({ kind: 'musicxml', fileName: 'escala.musicxml', storedAs: `imports/${s.id}/original.musicxml` });
    expect(fs.readFileSync(path.join(repo.root, 'imports', s.id, 'original.musicxml'))).toEqual(Buffer.from(enc(XML)));
    expect(listDir('songs')).toContain(`${s.id}.json`);
    const list = (await app.inject({ url: '/api/songs', headers: H })).json(); expect(list.songs.filter((x: any) => x.id === s.id)).toHaveLength(1); expect(list.errors).toEqual([]);
    await repo.dispose(); const repo2 = new LibraryRepository(repo.root, { seedDir: SEED }); await repo2.init();
    expect((await repo2.list()).songs).toHaveLength(5); await repo2.dispose(); await repo.init();
  });
  it('.mxl y MIDI se guardan con su extensión original', async () => {
    const a = (await post('/api/import' + Q({ fileName: 'x.mxl', ...META }), mxl(XML))).json(); expect(fs.existsSync(path.join(repo.root, 'imports', a.id, 'original.mxl'))).toBe(true);
    const b = (await post('/api/import' + Q({ fileName: 'x.MID', ...META }), buildMidi([seq([[60, 480], [62, 480]])]))).json();
    expect(b.source).toMatchObject({ kind: 'midi', originalPpq: 480 }); expect(fs.existsSync(path.join(repo.root, 'imports', b.id, 'original.mid'))).toBe(true);
  });
  it('MIDI a dos manos exige confirmar la separación', async () => {
    const midi = buildMidi([seq([[72, 480]]), seq([[48, 480]])]);
    const q = { fileName: 'a.mid', ...META, hands: '2' };
    expect((await post('/api/import' + Q(q), midi)).statusCode).toBe(400); expect(listDir('imports')).toEqual([]);
    expect((await post('/api/import' + Q({ ...q, confirmHands: '1' }), midi)).statusCode).toBe(201);
  });
  it('validación de metadatos: nada se escribe', async () => {
    const before = listDir('songs').length;
    for (const bad of [{ title: '' }, { title: 'x'.repeat(121) }, { genre: '' }, { difficulty: '0' }, { difficulty: '11' }, { difficulty: '2.5' }, { difficulty: 'alta' }, { hands: '3' }, { hands: '' }]) {
      const r = await post('/api/import' + Q({ fileName: 'e.musicxml', ...META, ...bad }), enc(XML)); expect(r.statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect(listDir('songs')).toHaveLength(before); expect(listDir('imports')).toEqual([]);
  });
  it('manos que no encajan con el archivo → 422 y nada se escribe', async () => {
    const r = await post('/api/import' + Q({ fileName: 'e.musicxml', ...META, hands: '2' }), enc(XML)); expect(r.statusCode).toBe(422); expect(r.json().error).toMatch(/1 pentagrama/);
    expect(listDir('songs')).toHaveLength(4); expect(listDir('imports')).toEqual([]);
  });
  it('archivo inválido → 422, nada se escribe', async () => {
    expect((await post('/api/import' + Q({ fileName: 'e.musicxml', ...META }), enc('basura'))).statusCode).toBe(422); expect(listDir('imports')).toEqual([]);
  });
  it('nombre de archivo con rutas o caracteres raros no afecta a dónde se guarda', async () => {
    const r = await post('/api/import' + Q({ fileName: '..\\..\\..\\etc\\passwd.musicxml', ...META }), enc(XML)); expect(r.statusCode).toBe(201);
    const s = r.json(); expect(s.source.fileName).toBe('passwd.musicxml'); expect(fs.readdirSync(path.join(repo.root, 'imports', s.id))).toEqual(['original.musicxml']);
    expect(fs.existsSync(path.join(root, 'etc'))).toBe(false);
  });
  it('si falla la escritura se revierte por completo (sin original huérfano) y se informa del motivo', async () => {
    (repo as any).opts.atomic = { rename: async (a: string, b: string) => { if (b.endsWith('.json')) throw Object.assign(new Error('x'), { code: 'EACCES' }); await fs.promises.rename(a, b); }, retries: 0 };
    const r = await post('/api/import' + Q({ fileName: 'e.musicxml', ...META }), enc(XML)); expect(r.statusCode).toBe(500); expect(r.json().error).toMatch(/permisos/);
    expect(listDir('imports')).toEqual([]); expect(listDir('songs')).toHaveLength(4);
  });
  it('una canción importada se puede abrir, duplicar con «Guardar como» y no se puede sobrescribir sin revisión', async () => {
    const s = (await post('/api/import' + Q({ fileName: 'e.musicxml', ...META }), enc(XML))).json();
    expect((await app.inject({ url: `/api/songs/${s.id}`, headers: H })).json().parts[0].staves[0].events).toHaveLength(4);
    expect((await app.inject({ method: 'PUT', url: `/api/songs/${s.id}`, headers: { host: H.host, 'content-type': 'application/json', 'if-match': '1' }, payload: { ...s, title: 'Otro' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/api/songs/${s.id}`, headers: { host: H.host, 'content-type': 'application/json', 'if-match': '1' }, payload: { ...s, title: 'Otro2' } })).statusCode).toBe(409);
  });
  it('seguridad: Host/Origin ajenos también en importación', async () => {
    expect((await post('/api/import' + Q({ fileName: 'e.musicxml', ...META }), enc(XML), { host: 'evil.example', 'content-type': 'application/octet-stream' })).statusCode).toBe(403);
  });
});
