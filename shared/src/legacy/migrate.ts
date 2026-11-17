import { PPQ, SCHEMA_VERSION, type Song, type MusicEvent } from '../model/schema';
import { parsePitch } from '../model/pitch';
import { LEGACY_META, LEGACY_SONGS } from './songs';

/** Equivalente de la función parse() original, pero sobre el modelo Pitch. Solo para migración y regresión. */
export function parseLegacy(notation: string) {
  return notation.split(' ').map((n) => {
    const p = parsePitch(n);
    return { midi: p.midi, sharp: p.alter === 1, pitch: p };
  });
}

const PROVISIONAL_NOTE =
  'Género, dificultad, ritmo (todas negras), compás 4/4 y tempo 90 BPM son valores PROVISIONALES asignados en la migración: ' +
  'el HTML original solo contenía la secuencia de alturas. No son el ritmo real de la obra.';
const BEATS_PER_MEASURE = 4;
const QUARTER = PPQ;
export const LEGACY_BPM = 90;
export const MIGRATION_DATE = '2026-11-17T00:00:00.000Z';

export function buildLegacySong(title: string, notation: string, meta: { id: string; genre: string; difficulty: number }): Song {
  const pitches = notation.split(' ').map(parsePitch);
  const measureLen = BEATS_PER_MEASURE * QUARTER;
  const nMeasures = Math.ceil(pitches.length / BEATS_PER_MEASURE);
  const events: MusicEvent[] = pitches.map((pitch, i) => ({
    id: `e${i}`, type: 'note', pitches: [{ pitch }], tick: i * QUARTER, durationTicks: QUARTER,
    voice: 1, measure: Math.floor(i / BEATS_PER_MEASURE),
  }));
  return {
    schemaVersion: SCHEMA_VERSION, id: meta.id, title, genre: meta.genre, hands: 1, difficulty: meta.difficulty,
    origin: 'preloaded', createdAt: MIGRATION_DATE, modifiedAt: MIGRATION_DATE, revision: 1, ppq: PPQ,
    tempoMap: [{ tick: 0, bpm: LEGACY_BPM }],
    timeSignatures: [{ tick: 0, num: 4, den: 4 }],
    keySignatures: [{ tick: 0, fifths: 0, mode: 'major' }],
    measures: Array.from({ length: nMeasures }, (_, index) => ({
      index, startTick: index * measureLen, lengthTicks: measureLen,
      ...(index === nMeasures - 1 && pitches.length % BEATS_PER_MEASURE !== 0 ? { incomplete: true } : {}),
    })),
    parts: [{ id: 'P1', name: 'Melodía', staves: [{ index: 0, clef: 'G', hand: 'right', events }] }],
    provisional: { metadata: true, rhythm: true, note: PROVISIONAL_NOTE },
  };
}

export function buildAllLegacySongs(): Song[] {
  return Object.entries(LEGACY_SONGS).map(([title, notation]) => buildLegacySong(title, notation, LEGACY_META[title]!));
}
