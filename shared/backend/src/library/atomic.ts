import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface AtomicOptions {
  /** Inyectable para pruebas. */
  rename?: (from: string, to: string) => Promise<void>;
  retries?: number;
}
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Escribe en un temporal del mismo directorio, fsync y renombra sobre el destino.
 * Si algo falla, el destino original queda intacto y el temporal se elimina.
 * En Windows el rename puede fallar con EPERM/EBUSY si un antivirus bloquea el fichero: se reintenta (acotado).
 */
export async function writeFileAtomic(target: string, data: string | Buffer, opts: AtomicOptions = {}): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  const rename = opts.rename ?? ((a, b) => fs.promises.rename(a, b));
  const retries = opts.retries ?? 5;
  let fh: fs.promises.FileHandle | undefined;
  try {
    fh = await fs.promises.open(tmp, 'wx');
    await fh.writeFile(data);
    await fh.sync();
    await fh.close(); fh = undefined;
    for (let attempt = 0; ; attempt++) {
      try { await rename(tmp, target); return; }
      catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (attempt < retries && code && RETRYABLE.has(code)) { await sleep(40 * (attempt + 1)); continue; }
        throw e;
      }
    }
  } catch (e) {
    if (fh) await fh.close().catch(() => {});
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}
