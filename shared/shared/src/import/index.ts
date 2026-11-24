import { PPQ, SCHEMA_VERSION, validateSong, type ImportIssue, type Song } from '../model/schema';
import { toPerformance } from '../projection/toPerformance';
import { decodeXml, extractMxl } from './mxl';
import { parseMidiFile } from './midi';
import { parseMusicXml } from './musicxml';
import { ImportError, type ImportDraft, type ImportKind, type ImportOptions } from './types';

export * from './types';
export { parseMusicXml } from './musicxml';
export { parseMidiFile } from './midi';
export { extractMxl, decodeXml } from './mxl';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['.musicxml', '.xml', '.mxl', '.mid', '.midi'] as const;

const ext = (name: string) => (/\.[^./\\]+$/.exec(name.toLowerCase())?.[0] ?? '');

/** Determina el tipo por extensión y comprueba que el contenido lo confirma. */
export function detectKind(fileName: string, bytes: Uint8Array): ImportKind {
  const e = ext(fileName);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(e)) throw new ImportError('Formato no soportado. Usa MusicXML (.musicxml, .xml, .mxl) o MIDI (.mid, .midi).');
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (e === '.mid' || e === '.midi') { if (magic !== 'MThd') throw new ImportError('El archivo no es un MIDI válido (falta la cabecera «MThd»).'); return 'midi'; }
  if (e === '.mxl') { if (!magic.startsWith('PK')) throw new ImportError('El archivo .mxl no es un zip válido.'); return 'mxl'; }
  if (magic === 'MThd' || magic.startsWith('PK')) throw new ImportError('La extensión no coincide con el contenido del archivo.');
  return 'musicxml';
}

export function importFile(fileName: string, bytes: Uint8Array, options: ImportOptions = {}): ImportDraft {
  if (bytes.length === 0) throw new ImportError('El archivo está vacío.');
  if (bytes.length > MAX_IMPORT_BYTES) throw new ImportError('El archivo supera el límite de 20 MB.');
  const kind = detectKind(fileName, bytes);
  if (kind === 'midi') return parseMidiFile(bytes, options.hands, options.midi);
  const draft = parseMusicXml(kind === 'mxl' ? extractMxl(bytes) : decodeXml(bytes));
  return { ...draft, kind };
}

/** Comprueba que las manos elegidas encajan con los pentagramas del archivo. Devuelve el motivo o null. */
export function checkHands(draft: ImportDraft, hands: 1 | 2): string | null {
  const n = draft.parts.reduce((a, p) => a + p.staves.length, 0);
  if (n !== hands) return `El archivo tiene ${n} pentagrama${n === 1 ? '' : 's'}: elige «${n === 2 ? 'A dos manos' : 'A una mano'}».`;
  return null;
}

export interface SongMeta { id: string; title: string; genre: string; hands: 1 | 2; difficulty: number; now: string; fileName: string; storedAs: string }

/** Convierte el análisis en una canción completa y la valida con el esquema. */
export function draftToSong(draft: ImportDraft, m: SongMeta): Song {
  const bad = checkHands(draft, m.hands); if (bad) throw new ImportError(bad);
  const song: Song = {
    schemaVersion: SCHEMA_VERSION, id: m.id, title: m.title.trim(), genre: m.genre.trim(), hands: m.hands, difficulty: m.difficulty,
    origin: 'imported', createdAt: m.now, modifiedAt: m.now, revision: 1, ppq: PPQ,
    tempoMap: draft.tempoMap, timeSignatures: draft.timeSignatures, keySignatures: draft.keySignatures, measures: draft.measures, parts: draft.parts,
    source: { kind: draft.kind, fileName: m.fileName, storedAs: m.storedAs, ...(draft.originalPpq ? { originalPpq: draft.originalPpq } : {}), importReport: draft.report, importOptions: draft.options },
  };
  const v = validateSong(song);
  if (!v.ok) throw new ImportError('El resultado de la importación no cumple el esquema de canción.', v.errors);
  return v.song;
}

export interface SongStats { measures: number; notes: number; events: number; staves: number; lowMidi: number | null; highMidi: number | null; bpm: number; timeSignature: string; fifths: number; hasChords: boolean; voices: number }
export function songStats(song: Song): SongStats {
  const perf = toPerformance(song);
  const midis = perf.flatMap((e) => e.midis);
  const staves = song.parts.flatMap((p) => p.staves);
  return {
    measures: song.measures.length, notes: perf.reduce((a, e) => a + e.notes.length, 0), events: perf.length, staves: staves.length,
    lowMidi: midis.length ? Math.min(...midis) : null, highMidi: midis.length ? Math.max(...midis) : null,
    bpm: song.tempoMap[0]!.bpm, timeSignature: `${song.timeSignatures[0]!.num}/${song.timeSignatures[0]!.den}`, fifths: song.keySignatures[0]!.fifths,
    hasChords: perf.some((e) => e.midis.length > 1), voices: Math.max(...staves.flatMap((s) => s.events.map((e) => e.voice))),
  };
}

/** Respuesta de la previsualización (la calcula el servidor; la usa la interfaz). */
export interface PreviewResult {
  song: Song; stats: SongStats; report: ImportIssue[];
  detected: { kind: ImportKind; suggestedTitle: string; suggestedHands: 1 | 2; staffCount: number };
  handsProblem: string | null;
}
