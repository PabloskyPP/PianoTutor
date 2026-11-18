export type LibraryErrorCode = 'NOT_FOUND' | 'INVALID' | 'CONFLICT' | 'READ_ONLY' | 'FORBIDDEN' | 'IO' | 'LOCKED' | 'IMPORT_FAILED';
const HTTP: Record<LibraryErrorCode, number> = { NOT_FOUND: 404, INVALID: 400, CONFLICT: 409, READ_ONLY: 403, FORBIDDEN: 403, IO: 500, LOCKED: 500, IMPORT_FAILED: 422 };

export class LibraryError extends Error {
  constructor(readonly code: LibraryErrorCode, message: string, readonly details?: string[]) { super(message); }
  get status() { return HTTP[this.code]; }
}

/** Traduce errores del sistema de archivos a mensajes comprensibles. */
export function ioError(e: unknown, action: string): LibraryError {
  if (e instanceof LibraryError) return e;
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === 'EACCES' || code === 'EPERM') return new LibraryError('IO', `No se pudo ${action}: sin permisos sobre la carpeta de la biblioteca.`);
  if (code === 'ENOSPC') return new LibraryError('IO', `No se pudo ${action}: no hay espacio en disco.`);
  if (code === 'ENOENT') return new LibraryError('IO', `No se pudo ${action}: no se encontró la carpeta de la biblioteca.`);
  return new LibraryError('IO', `No se pudo ${action}: ${(e as Error)?.message ?? 'error desconocido'}`);
}
