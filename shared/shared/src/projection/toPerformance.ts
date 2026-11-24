/**
 * Proyección "de interpretación": fusiona las cadenas de ligaduras y agrupa notas simultáneas.
 * Reproducción, evaluación y Piano Tiles consumen SOLO esta lista (nunca el modelo de grabado).
 */
import type { Song, MusicEvent } from '../model/schema';
import type { Pitch } from '../model/pitch';

export interface PerformanceNote { pitch: Pitch; staff: number; tickStart: number; tickEnd: number; /** Tresillo o similar (solo si la nota no es resultado de fusionar ligaduras). */ tuplet?: { actual: number; normal: number } }
export interface PerformanceEvent {
  id: string;
  tickStart: number;
  tickEnd: number;
  notes: PerformanceNote[];       // ≥1; varias = acorde / manos simultáneas
  midis: number[];                // alturas únicas, ordenadas
}

export function toPerformance(song: Song): PerformanceEvent[] {
  const notes: PerformanceNote[] = [];
  song.parts.forEach((part) => part.staves.forEach((staff) => {
    // Clave (voz, altura) -> nota abierta, para fusionar ligaduras.
    const open = new Map<string, PerformanceNote>();
    const events: MusicEvent[] = [...staff.events].sort((a, b) => a.tick - b.tick);
    for (const e of events) {
      if (e.type === 'rest') continue;
      for (const cn of e.pitches) {
        const key = `${e.voice}:${cn.pitch.midi}`;
        const cont = cn.tiePrev ? open.get(key) : undefined;
        if (cont) { cont.tickEnd = e.tick + e.durationTicks; delete cont.tuplet; }
        else { const n: PerformanceNote = { pitch: cn.pitch, staff: staff.index, tickStart: e.tick, tickEnd: e.tick + e.durationTicks, ...(e.tuplet ? { tuplet: e.tuplet } : {}) }; notes.push(n); open.set(key, n); }
        if (!cn.tieNext) open.delete(key);
      }
    }
  }));
  notes.sort((a, b) => a.tickStart - b.tickStart || a.pitch.midi - b.pitch.midi);
  const out: PerformanceEvent[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && last.tickStart === n.tickStart) {
      last.notes.push(n);
      last.tickEnd = Math.max(last.tickEnd, n.tickEnd);
      if (!last.midis.includes(n.pitch.midi)) last.midis.push(n.pitch.midi);
    } else out.push({ id: `p${out.length}`, tickStart: n.tickStart, tickEnd: n.tickEnd, notes: [n], midis: [n.pitch.midi] });
  }
  out.forEach((e) => e.midis.sort((a, b) => a - b));
  return out;
}
