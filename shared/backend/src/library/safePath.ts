import path from 'node:path';
import fs from 'node:fs';
import { SONG_ID_RE } from '@pianotutor/shared';
import { LibraryError } from './errors';

export function assertValidId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SONG_ID_RE.test(id)) throw new LibraryError('INVALID', 'Identificador de canción no válido.');
}

/** Resuelve `parts` bajo `root` y garantiza (también tras seguir symlinks) que el resultado queda dentro. */
export function resolveInside(root: string, ...parts: string[]): string {
  const rootReal = fs.realpathSync(root);
  const target = path.resolve(rootReal, ...parts);
  const rel = path.relative(rootReal, target);
  if (rel === '' ) return target;
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new LibraryError('FORBIDDEN', 'Ruta fuera de la biblioteca autorizada.');
  // Si el destino (o su ancestro existente más cercano) es un symlink que escapa, se rechaza.
  let probe = target;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const real = fs.realpathSync(probe);
  const relReal = path.relative(rootReal, real);
  if (relReal.startsWith('..') || path.isAbsolute(relReal)) throw new LibraryError('FORBIDDEN', 'Ruta fuera de la biblioteca autorizada.');
  return target;
}
