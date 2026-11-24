import crypto from 'node:crypto';
import { z } from 'zod';
import { importFile, draftToSong, songStats, checkHands, ImportError, type ImportDraft, type ImportOptions, type Song, type PreviewResult, ALLOWED_EXTENSIONS } from '@pianotutor/shared';
import { LibraryError } from './errors';

const flag = z.enum(['0', '1']);
const base = {
  fileName: z.string().min(1).max(255),
  hands: z.enum(['1', '2']).optional(),
  grid: z.enum(['quarter', 'eighth', 'sixteenth', 'thirtysecond']).optional(),
  handMode: z.enum(['auto', 'byTrack', 'bySplit']).optional(),
  split: z.coerce.number().int().min(0).max(127).optional(),
  legato: flag.optional(),
};
export const previewQuery = z.object(base);
export const saveQuery = z.object({
  ...base,
  hands: z.enum(['1', '2']),
  title: z.string().trim().min(1, 'El título es obligatorio.').max(120, 'El título admite hasta 120 caracteres.'),
  genre: z.string().trim().min(1, 'El género es obligatorio.').max(60, 'El género admite hasta 60 caracteres.'),
  difficulty: z.coerce.number().int('La dificultad debe ser un número entero.').min(1, 'La dificultad va de 1 a 10.').max(10, 'La dificultad va de 1 a 10.'),
  confirmHands: flag.optional(),
});

export function parseQuery<T extends z.ZodType>(schema: T, q: unknown): z.infer<T> {
  const r = schema.safeParse(q);
  if (!r.success) throw new LibraryError('INVALID', r.error.issues[0]?.message ?? 'Parámetros no válidos.', r.error.issues.map((i) => i.message));
  return r.data;
}

const toOptions = (q: z.infer<typeof previewQuery>): ImportOptions => ({
  ...(q.hands ? { hands: Number(q.hands) as 1 | 2 } : {}),
  midi: { ...(q.grid ? { grid: q.grid } : {}), ...(q.handMode ? { handMode: q.handMode } : {}), ...(q.split !== undefined ? { splitMidi: q.split } : {}), ...(q.legato ? { legatoTrim: q.legato === '1' } : {}) },
});

const safeName = (n: string) => n.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 120) || 'archivo';
export const extOf = (n: string) => { const e = /\.[^./\\]+$/.exec(n.toLowerCase())?.[0] ?? ''; return (ALLOWED_EXTENSIONS as readonly string[]).includes(e) ? e : ''; };

function run(bytes: Uint8Array, q: z.infer<typeof previewQuery>): ImportDraft {
  try { return importFile(q.fileName, bytes, toOptions(q)); }
  catch (e) { if (e instanceof ImportError) throw new LibraryError('IMPORT_FAILED', e.message, e.details); throw e; }
}

/** Previsualiza: analiza el archivo sin guardar nada. La canción devuelta usa tantas manos como pentagramas tiene el archivo. */
export function previewImport(bytes: Uint8Array, rawQuery: unknown): PreviewResult {
  const q = parseQuery(previewQuery, rawQuery);
  const d = run(bytes, q);
  const staffCount = d.parts.reduce((a, p) => a + p.staves.length, 0);
  const handsProblem = q.hands ? checkHands(d, Number(q.hands) as 1 | 2) : null;
  const song = draftToSimple(d, { id: 'preview-preview', title: d.suggestedTitle || safeName(q.fileName).replace(/\.[^.]+$/, ''), genre: '-', hands: (staffCount === 2 ? 2 : 1), difficulty: 1, fileName: safeName(q.fileName), storedAs: 'preview' });
  return { song, stats: songStats(song), report: song.source!.importReport, detected: { kind: d.kind, suggestedTitle: d.suggestedTitle, suggestedHands: d.suggestedHands, staffCount }, handsProblem };
}

function draftToSimple(d: ImportDraft, m: { id: string; title: string; genre: string; hands: 1 | 2; difficulty: number; fileName: string; storedAs: string }): Song {
  try { return draftToSong(d, { ...m, now: new Date().toISOString() }); }
  catch (e) { if (e instanceof ImportError) throw new LibraryError('IMPORT_FAILED', e.message, e.details); throw e; }
}

export interface PreparedImport { song: Song; ext: string }
/** Valida metadatos y archivo, y construye la canción lista para guardar. No escribe nada. */
export function prepareImport(bytes: Uint8Array, rawQuery: unknown): PreparedImport {
  const q = parseQuery(saveQuery, rawQuery);
  const ext = extOf(q.fileName);
  if (!ext) throw new LibraryError('IMPORT_FAILED', 'Formato no soportado. Usa MusicXML (.musicxml, .xml, .mxl) o MIDI (.mid, .midi).');
  const d = run(bytes, q);
  const hands = Number(q.hands) as 1 | 2;
  if (d.kind === 'midi' && hands === 2 && q.confirmHands !== '1') throw new LibraryError('INVALID', 'Debes confirmar la separación de manos propuesta antes de guardar.');
  const id = `imported-${crypto.randomUUID()}`;
  const song = draftToSimple(d, { id, title: q.title, genre: q.genre, hands, difficulty: q.difficulty, fileName: safeName(q.fileName), storedAs: `imports/${id}/original${ext}` });
  return { song, ext };
}
