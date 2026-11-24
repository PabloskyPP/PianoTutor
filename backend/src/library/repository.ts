import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateSong, summarize, type Song, type SongSummary } from '@pianotutor/shared';
import { LibraryError, ioError } from './errors';
import { assertValidId, resolveInside } from './safePath';
import { writeFileAtomic, type AtomicOptions } from './atomic';

export interface ListResult { songs: SongSummary[]; errors: { file: string; message: string }[] }
export interface RepoOptions { seedDir?: string; backupsToKeep?: number; atomic?: AtomicOptions }
const SUBDIRS = ['songs', 'compositions', 'imports', 'drafts', 'backups', 'trash'] as const;
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

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

  /**
   * Elimina una canción del catálogo MOVIÉNDOLA a data/trash/<fecha>-<id>/ (song.json, imports/, y si existen backups/ y draft.json).
   * No es un borrado definitivo: se puede recuperar a mano. Las precargadas no se pueden eliminar. Exige la revisión (If-Match).
   * Si algo falla a medias, se deshace lo ya movido y la canción queda como estaba.
   */
  async delete(id: string, ifMatchRevision: number | undefined): Promise<{ id: string; title: string; trashedAs: string }> {
    assertValidId(id);
    const song = await this.get(id);
    if (song.origin === 'preloaded') throw new LibraryError('READ_ONLY', 'Las canciones precargadas no se pueden eliminar. Si quieres una versión distinta, usa «Guardar como copia propia».');
    if (ifMatchRevision === undefined) throw new LibraryError('INVALID', 'Falta la revisión (If-Match).');
    if (ifMatchRevision !== song.revision) throw new LibraryError('CONFLICT', 'La canción cambió desde que la viste. Recarga el catálogo antes de eliminarla.');
    const entry = `${new Date().toISOString().replace(/[:.]/g, '-')}-${id}`;
    const trash = resolveInside(this.root, 'trash', entry);
    const rename = this.opts.atomic?.rename ?? ((a: string, b: string) => fs.promises.rename(a, b));
    const mv = async (from: string, to: string) => {
      for (let i = 0; ; i++) {
        try { await rename(from, to); return; }
        catch (e) { const c = (e as NodeJS.ErrnoException).code; if (i < 5 && c && RETRYABLE.has(c)) { await new Promise((r) => setTimeout(r, 40 * (i + 1))); continue; } throw e; }
      }
    };
    const moved: [string, string][] = [];
    try {
      await fs.promises.mkdir(trash, { recursive: true });
      const imp = resolveInside(this.root, 'imports', id);
      if (fs.existsSync(imp)) { await mv(imp, path.join(trash, 'imports')); moved.push([imp, path.join(trash, 'imports')]); }
      const file = this.fileFor(song);
      await mv(file, path.join(trash, 'song.json')); moved.push([file, path.join(trash, 'song.json')]);
    } catch (e) {
      for (const [from, to] of moved.reverse()) await fs.promises.rename(to, from).catch(() => {});
      await fs.promises.rm(trash, { recursive: true, force: true }).catch(() => {});
      throw ioError(e, 'eliminar la canción');
    }
    // Lo accesorio se mueve «si se puede»: un fallo aquí no revierte la eliminación.
    for (const [from, to] of [[resolveInside(this.root, 'backups', id), path.join(trash, 'backups')], [resolveInside(this.root, 'drafts', `${id}.draft.json`), path.join(trash, 'draft.json')]] as const) {
      try { if (fs.existsSync(from)) await mv(from, to); } catch { /* se queda donde está */ }
    }
    return { id, title: song.title, trashedAs: `trash/${entry}` };
  }

  /** Guarda una canción importada junto con el archivo original (data/imports/<id>/original.<ext>). Si algo falla, no queda nada a medias. */
  async createImported(song: Song, original: Uint8Array, ext: string): Promise<Song> {
    if (song.origin !== 'imported') throw new LibraryError('INVALID', 'Solo se pueden crear canciones importadas por esta vía.');
    assertValidId(song.id);
    const v = validateSong(song);
    if (!v.ok) throw new LibraryError('INVALID', 'La canción no es válida.', v.errors);
    const dir = resolveInside(this.root, 'imports', song.id);
    const origFile = resolveInside(this.root, 'imports', song.id, `original${ext}`);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await writeFileAtomic(origFile, Buffer.from(original), this.opts.atomic);
      await writeFileAtomic(this.fileFor(v.song), JSON.stringify(v.song, null, 2) + '\n', this.opts.atomic);
      return v.song;
    } catch (e) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      await fs.promises.rm(this.fileFor(v.song), { force: true }).catch(() => {});
      throw ioError(e, 'guardar la canción importada');
    }
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
