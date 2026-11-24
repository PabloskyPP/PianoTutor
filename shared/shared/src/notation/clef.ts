import type { Staff } from '../model/schema';

export type ClefId = Staff['clef'];

/** Clave vigente en un pentagrama en un instante (la inicial más los cambios guardados). */
export function clefAt(staff: Pick<Staff, 'clef' | 'clefChanges'>, tick: number): ClefId {
  let c = staff.clef;
  for (const ch of staff.clefChanges ?? []) { if (ch.tick <= tick) c = ch.clef; else break; }
  return c;
}
