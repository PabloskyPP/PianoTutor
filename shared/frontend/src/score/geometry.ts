import type { ClefId } from '@pianotutor/shared';

/** Geometría del pentagrama de Playing (px). BASE y STEP_PX son los del programa original; BASS_BASE sitúa el pentagrama inferior (dos manos). */
export const BASE = 150, BASS_BASE = 270, STEP_PX = 7, GAP = 50;
/** Paso diatónico (octava*7 + C=0…B=6) de la línea inferior de cada clave: Sol → Mi4 (30), Fa → Sol2 (18), Do (alto) → Fa3 (24). */
export const BOTTOM_STEP: Record<ClefId, number> = { G: 30, F: 18, C: 24 };

export interface StaffGeom { bottomY: number; bottomStep: number; yOf: (step: number) => number; below: number; above: number; mid: number }
export function geom(slot: 0 | 1, clef: ClefId): StaffGeom {
  const bottomY = slot === 0 ? BASE : BASS_BASE, b = BOTTOM_STEP[clef];
  return { bottomY, bottomStep: b, yOf: (s) => bottomY - (s - b) * STEP_PX, below: b - 2, above: b + 10, mid: b + 4 };
}
/** Altura (px) de una cabeza de nota. */
export const headY = (slot: 0 | 1, clef: ClefId, step: number) => geom(slot, clef).yOf(step);
export const CANVAS_H = { single: 210, grand: 340 };
