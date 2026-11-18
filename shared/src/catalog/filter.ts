import type { SongSummary } from '../model/schema';

/** Minúsculas y sin acentos/diacríticos ("Niño" → "nino"). Se usa para la búsqueda, no para ordenar. */
export const normalizeText = (s: string): string => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim();

export interface CatalogFilters {
  query: string;
  genre: string;                 // '' = todos
  minDifficulty: number;         // 1..10
  maxDifficulty: number;
  hands: 'all' | 1 | 2;
  own: 'all' | 'own' | 'notOwn'; // propias = origen «composed»
}
export const DEFAULT_FILTERS: CatalogFilters = { query: '', genre: '', minDifficulty: 1, maxDifficulty: 10, hands: 'all', own: 'all' };

const collator = new Intl.Collator('es', { sensitivity: 'base' });
export const sortByTitle = <T extends { title: string }>(songs: readonly T[]): T[] => [...songs].sort((a, b) => collator.compare(a.title, b.title));

export function filterSongs(songs: readonly SongSummary[], f: CatalogFilters): SongSummary[] {
  const q = normalizeText(f.query);
  const lo = Math.min(f.minDifficulty, f.maxDifficulty), hi = Math.max(f.minDifficulty, f.maxDifficulty);
  return sortByTitle(songs.filter((s) =>
    (!q || normalizeText(s.title).includes(q)) &&
    (!f.genre || normalizeText(s.genre) === normalizeText(f.genre)) &&
    s.difficulty >= lo && s.difficulty <= hi &&
    (f.hands === 'all' || s.hands === f.hands) &&
    (f.own === 'all' || (f.own === 'own') === (s.origin === 'composed'))));
}

/** Géneros distintos presentes (sin duplicar por mayúsculas/acentos), ordenados. */
export function distinctGenres(songs: readonly { genre: string }[]): string[] {
  const m = new Map<string, string>();
  for (const s of songs) if (!m.has(normalizeText(s.genre))) m.set(normalizeText(s.genre), s.genre);
  return sortByTitle([...m.values()].map((title) => ({ title }))).map((x) => x.title);
}
