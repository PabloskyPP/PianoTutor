/**
 * Las cuatro canciones del HTML original, copiadas LITERALMENTE (objeto SONGS de piano-tutor.html).
 * tests/regression/legacy.test.ts comprueba que siguen idénticas al HTML original guardado en
 * tests/regression/original/. No editar estas cadenas.
 */
export const LEGACY_SONGS: Record<string, string> = {
  'Oda a la alegría (Beethoven)': 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4',
  'Estrellita, ¿dónde estás?': 'C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4 G4 G4 F4 F4 E4 E4 D4 G4 G4 F4 F4 E4 E4 D4 C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4',
  'Para Elisa (inicio, Beethoven)': 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 G#4 B4 C5 E5 D#5 E5 D#5 E5 B4 D5 C5 A4',
  'Jingle Bells (estribillo)': 'E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4 F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4 G4',
};

/** Metadatos PROVISIONALES: el original no los especificaba (ver docs/DATA_MODEL.md §Migración). */
export const LEGACY_META: Record<string, { id: string; genre: string; difficulty: number }> = {
  'Oda a la alegría (Beethoven)': { id: 'preloaded-oda-a-la-alegria', genre: 'Clásica', difficulty: 2 },
  'Estrellita, ¿dónde estás?': { id: 'preloaded-estrellita-donde-estas', genre: 'Infantil', difficulty: 1 },
  'Para Elisa (inicio, Beethoven)': { id: 'preloaded-para-elisa', genre: 'Clásica', difficulty: 5 },
  'Jingle Bells (estribillo)': { id: 'preloaded-jingle-bells', genre: 'Navidad', difficulty: 2 },
};
