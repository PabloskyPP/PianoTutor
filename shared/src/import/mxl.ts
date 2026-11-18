import { unzipSync } from 'fflate';
import { ImportError } from './types';

export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

/** Decodifica XML respetando BOM UTF-8/UTF-16. */
export function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Extrae el MusicXML principal de un .mxl (zip comprimido). Protege frente a «zip bombs» limitando el tamaño descomprimido. */
export function extractMxl(bytes: Uint8Array): string {
  let total = 0, tooBig = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => { total += f.originalSize; if (total > MAX_UNCOMPRESSED_BYTES) { tooBig = true; throw new Error('big'); } return !f.name.endsWith('/'); } });
  } catch {
    throw new ImportError(tooBig ? 'El archivo .mxl descomprimido es demasiado grande.' : 'El archivo .mxl no es un zip válido o está dañado.');
  }
  let rootPath: string | undefined;
  const container = files['META-INF/container.xml'];
  if (container) rootPath = /full-path\s*=\s*["']([^"']+)["']/.exec(decodeXml(container))?.[1];
  const chosen = (rootPath && files[rootPath] ? rootPath : undefined)
    ?? Object.keys(files).find((n) => !n.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(n));
  if (!chosen) throw new ImportError('El archivo .mxl no contiene ninguna partitura MusicXML.');
  return decodeXml(files[chosen]!);
}
