import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateSong, summarize, type Song, type SongSummary } from '@pianotutor/shared';
import { LibraryError, ioError } from './errors';
import { assertValidId, resolveInside } from './safePath';
import { writeFileAtomic, type AtomicOptions } from './atomic';

export interface ListResult { songs: SongSummary[]; errors: { file: string; message: string }[] }
export interface RepoOptions { seedDir?: string; backupsToKeep?: number; atomic?: AtomicOptions }
const SUBDIRS = ['songs', 'compositions', 'imports', 'drafts', 'backups'] as const;

export class LibraryRepository {
  private lockPath: string;
  private locked = false;
  constructor(readonly root: string, private opts: RepoOptions = {}) { this.lockPath = path.join(root, '.pianotutor.lock'); }

  /** Crea carpetas, adquiere el bloqueo de instancia única y copia la semilla solo si falta. */
  async init(): Promise<void> {
    try {
      await fs.promises.mkdir(this.root, { recursive: true });
      for (const d of SUBDIRS) await fs.promises.mkdir(path.join(this.root, d), { recursive: true });
      await this.acquireLock();
      if (this.opts.seedDir) await this.copySeed(this.opts.seedDir);
    } catch (e) { throw ioError(e, 'inicializar la biblioteca'); }
  }

  async dispose(): Promise<void> {
    if (this.locked) { await fs.promises.rm(this.lockPath, { force: true }); this.locked = false; }
  }

  private async acquireLock() {
    for (let i = 0; i < 2; i++) {
      try {
        const fh = await fs.promises.open(this.lockPath, 'wx');
        await fh.writeFile(String(process.pid)); await fh.close(); this.locked = true; return;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        const pid = Number(await fs.promises.readFile(this.lockPath, 'utf8').catch(() => ''));
        let alive = false;
        if (pid && pid !== process.pid) { try { process.kill(pid, 0); alive = true; } catch (err) { alive = (err as NodeJS.ErrnoException).code === 'EPERM'; } }
        if (alive) throw new LibraryError('LOCKED', `Otra instancia de Piano Tutor (PID ${pid}) está usando esta biblioteca.`);
        await fs.promises.rm(this.lockPath, { force: true }); // bloqueo huérfano
      }
    }
    throw new LibraryError('LOCKED', 'No se pudo adquirir el bloqueo de la biblioteca.');
  }

  private async copySeed(seedDir: string) {
    for (const f of (await fs.promises.readdir(seedDir)).filter((x) => x.endsWith('.json'))) {
      const dest = path.join(this.root, 'songs', f);
      if (fs.existsSync(dest)) continue; // nunca se pisa lo existente
      const raw = await fs.promises.readFile(path.join(seedDir, f), 'utf8');
      const v = validateSong(JSON.parse(raw));
      if (!v.ok) throw new LibraryError('INVALID', `Semilla inválida ${f}: ${v.errors.join('; ')}`);
      await writeFileAtomic(dest, raw, this.opts.atomic);
    }
  }

  private fileFor(song: Pick<Song, 'id' | 'origin'>) {
    return resolveInside(this.root, song.origin === 'composed' ? 'compositions' : 'songs', `${song.id}.json`);
  }

  private async readValidated(file: string): Promise<Song> {
    let raw: string;
    try { raw = await fs.promises.readFile(file, 'utf8'); } catch (e) { throw ioError(e, 'leer un archivo'); }
    let json: unknown;
    try { json = JSON.parse(raw); } catch { throw new LibraryError('INVALID', 'El archivo no es JSON válido (posiblemente corrupto).'); }
    const v = validateSong(json);
    if (!v.ok) throw new LibraryError('INVALID', 'El archivo no cumple el esquema de canción.', v.errors);
    if (path.basename(file) !== `${v.song.id}.json`) throw new LibraryError('INVALID', `El nombre del archivo no coincide con el id interno (${v.song.id}).`);
    return v.song;
  }

  /** Lee todos los archivos. Los inválidos no impiden el arranque: se devuelven en `errors`. */
  async scan(): Promise<{ songs: Song[]; errors: ListResult['errors'] }> {
    const songs: Song[] = []; const errors: ListResult['errors'] = []; const seen = new Set<string>();
    for (const sub of ['songs', 'compositions']) {
      const dir = path.join(this.root, sub);
      let files: string[] = [];
      try { files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.json') && !f.startsWith('.')); }
      catch (e) { errors.push({ file: sub, message: ioError(e, 'listar la carpeta').message }); continue; }
      for (const f of files.sort()) {
        try {
          const s = await this.readValidated(path.join(dir, f));
          if (seen.has(s.id)) throw new LibraryError('INVALID', `Id duplicado (${s.id}).`);
          if ((sub === 'compositions') !== (s.origin === 'composed')) throw new LibraryError('INVALID', 'El archivo está en una carpeta que no corresponde a su origen.');
          seen.add(s.id); songs.push(s);
        } catch (e) {
          const le = e as LibraryError;
          errors.push({ file: `${sub}/${f}`, message: le.details?.length ? `${le.message} ${le.details.slice(0, 3).join(' | ')}` : le.message });
        }
      }
    }
    return { songs, errors };
  }

  async list(): Promise<ListResult> {
    const { songs, errors } = await this.scan();
    return { songs: songs.map(summarize), errors };
  }

  async get(id: string): Promise<Song> {
    assertValidId(id);
    const { songs } = await this.scan();
    const s = songs.find((x) => x.id === id);
    if (!s) throw new LibraryError('NOT_FOUND', 'No existe esa canción en la biblioteca.');
    return s;
  }

  /** Guarda cambios sobre una canción existente con control de revisión (If-Match). */
  async update(id: string, incoming: unknown, ifMatchRevision: number | undefined): Promise<Song> {
    assertValidId(id);
    const current = await this.get(id);
    if (current.origin === 'preloaded') throw new LibraryError('READ_ONLY', 'Las canciones precargadas son de solo lectura. Usa «Guardar como» para crear una copia propia.');
    if (ifMatchRevision === undefined) throw new LibraryError('INVALID', 'Falta la revisión (If-Match).');
    if (ifMatchRevision !== current.revision) throw new LibraryError('CONFLICT', 'La canción cambió desde que la abriste. Recárgala para no perder cambios.');
    const draft = { ...(incoming as object), id: current.id, origin: current.origin, createdAt: current.createdAt, revision: current.revision + 1, modifiedAt: new Date().toISOString() };
    const v = validateSong(draft);
    if (!v.ok) throw new LibraryError('INVALID', 'La canción no es válida.', v.errors);
    const file = this.fileFor(v.song);
    await this.backup(current, file);
    try { await writeFileAtomic(file, JSON.stringify(v.song, null, 2) + '\n', this.opts.atomic); }
    catch (e) { throw ioError(e, 'guardar la canción'); }
    return v.song;
  }

  /** «Guardar como»: crea una copia propia (origin composed) con id nuevo. Nunca toca el original. */
  async saveAs(id: string, title: unknown): Promise<Song> {
    const src = await this.get(id);
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) throw new LibraryError('INVALID', 'El título debe tener entre 1 y 120 caracteres.');
    const now = new Date().toISOString();
    const copy: Song = { ...structuredClone(src), id: `composed-${crypto.randomUUID()}`, title: title.trim(), origin: 'composed', createdAt: now, modifiedAt: now, revision: 1 };
    const v = validateSong(copy);
    if (!v.ok) throw new LibraryError('INVALID', 'La copia no es válida.', v.errors);
    const file = this.fileFor(v.song);
    try { await writeFileAtomic(file, JSON.stringify(v.song, null, 2) + '\n', { ...this.opts.atomic }); }
    catch (e) { throw ioError(e, 'guardar la copia'); }
    return v.song;
  }

  private async backup(prev: Song, file: string) {
    try {
      const dir = resolveInside(this.root, 'backups', prev.id);
      await fs.promises.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.promises.copyFile(file, path.join(dir, `${stamp}-r${prev.revision}.json`));
      const keep = this.opts.backupsToKeep ?? 10;
      const all = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
      for (const old of all.slice(0, Math.max(0, all.length - keep))) await fs.promises.rm(path.join(dir, old), { force: true });
    } catch (e) { throw ioError(e, 'crear la copia de seguridad'); }
  }
}
