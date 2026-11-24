import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// En pruebas con jsdom import.meta.url no es un file:; entonces se parte del directorio de trabajo (la raíz del proyecto).
const here = import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : path.join(process.cwd(), 'backend', 'src', 'config.ts');
export const REPO_ROOT = path.resolve(path.dirname(here), '..', '..');
export const BACKUPS_TO_KEEP = 10;
export const MAX_BODY_BYTES = 20 * 1024 * 1024;

/**
 * Raíces autorizadas para la biblioteca. Orden de prioridad:
 *  1. variable de entorno PIANOTUTOR_ROOTS (lista separada por el delimitador de rutas del sistema);
 *  2. fichero opcional pianotutor.config.json en la raíz del proyecto: { "authorizedRoots": ["./data", "..."] };
 *  3. por defecto, ./data dentro del proyecto.
 * La primera es la predeterminada. Las rutas relativas se resuelven desde la raíz del proyecto.
 */
export function loadAuthorizedRoots(env = process.env, repoRoot = REPO_ROOT): string[] {
  let raw: string[] | undefined;
  if (env.PIANOTUTOR_ROOTS) raw = env.PIANOTUTOR_ROOTS.split(path.delimiter).filter(Boolean);
  else {
    const cfg = path.join(repoRoot, 'pianotutor.config.json');
    if (fs.existsSync(cfg)) {
      const parsed = JSON.parse(fs.readFileSync(cfg, 'utf8')) as { authorizedRoots?: unknown };
      if (Array.isArray(parsed.authorizedRoots) && parsed.authorizedRoots.every((x) => typeof x === 'string')) raw = parsed.authorizedRoots as string[];
      else throw new Error('pianotutor.config.json: "authorizedRoots" debe ser una lista de textos.');
    }
  }
  const roots = (raw?.length ? raw : ['./data']).map((r) => path.resolve(repoRoot, r));
  return [...new Set(roots)];
}

export interface Settings { libraryRoot?: string; preferences?: unknown }

/** settings.json vive siempre en <proyecto>/data (no depende de la biblioteca elegida). */
export const settingsPath = (repoRoot = REPO_ROOT) => path.join(repoRoot, 'data', 'settings.json');

export function readSettings(file: string): Settings {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as Settings; } catch { return {}; }
}

/** Raíz activa: la guardada en ajustes si sigue autorizada; si no, la primera autorizada. */
export function resolveActiveRoot(roots: string[], settings: Settings): { root: string; warning?: string } {
  if (settings.libraryRoot && roots.includes(settings.libraryRoot)) return { root: settings.libraryRoot };
  if (settings.libraryRoot) return { root: roots[0]!, warning: 'La biblioteca guardada ya no está autorizada; se usa la predeterminada.' };
  return { root: roots[0]! };
}
