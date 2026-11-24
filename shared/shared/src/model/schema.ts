/**
 * Esquema de canción (schemaVersion 1). Ver docs/DATA_MODEL.md.
 * Se valida en cada lectura y escritura de disco y en cada importación.
 */
import { z } from 'zod';
import { midiOf } from './pitch';

export const SCHEMA_VERSION = 1;
export const PPQ = 960;
export const SONG_ID_RE = /^[a-z0-9-]{8,64}$/;

const stepSchema = z.enum(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
const alterSchema = z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]);

export const pitchSchema = z.object({
  midi: z.number().int().min(0).max(127),
  step: stepSchema,
  alter: alterSchema,
  octave: z.number().int().min(-1).max(9),
}).refine((p) => midiOf(p.step, p.alter, p.octave) === p.midi, { message: 'pitch.midi no coincide con step/alter/octave' });

export const chordNoteSchema = z.object({
  pitch: pitchSchema,
  tieNext: z.boolean().optional(),
  tiePrev: z.boolean().optional(),
});

export const eventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['note', 'chord', 'rest']),
  pitches: z.array(chordNoteSchema),
  tick: z.number().int().min(0),
  durationTicks: z.number().int().positive(),
  dots: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  tuplet: z.object({ actual: z.number().int().positive(), normal: z.number().int().positive() }).optional(),
  voice: z.number().int().min(1),
  measure: z.number().int().min(0),
}).superRefine((e, ctx) => {
  const want = e.type === 'rest' ? (n: number) => n === 0 : e.type === 'note' ? (n: number) => n === 1 : (n: number) => n >= 2;
  if (!want(e.pitches.length)) ctx.addIssue({ code: 'custom', message: `El evento ${e.id} de tipo ${e.type} tiene ${e.pitches.length} alturas` });
});

/** `index` es GLOBAL en la canción (0 = pentagrama superior), único aunque haya varias partes. */
export const staffSchema = z.object({
  index: z.number().int().min(0),
  clef: z.enum(['G', 'F', 'C']),
  /** Cambios de clave posteriores a la clave inicial (`clef`), en ticks crecientes. Opcional: los archivos anteriores no lo llevan. */
  clefChanges: z.array(z.object({ tick: z.number().int().min(1), clef: z.enum(['G', 'F', 'C']) })).optional(),
  hand: z.enum(['right', 'left', 'unknown']).optional(),
  events: z.array(eventSchema),
});
export const partSchema = z.object({ id: z.string().min(1), name: z.string(), staves: z.array(staffSchema).min(1) });

export const importIssueSchema = z.object({
  level: z.enum(['info', 'warning', 'error']),
  code: z.string(),
  message: z.string(),
});

export const songSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().regex(SONG_ID_RE, 'id no válido'),
  title: z.string().trim().min(1).max(120),
  genre: z.string().trim().min(1).max(60),
  hands: z.union([z.literal(1), z.literal(2)]),
  difficulty: z.number().int().min(1).max(10),
  origin: z.enum(['preloaded', 'imported', 'composed']),
  createdAt: z.iso.datetime(),
  modifiedAt: z.iso.datetime(),
  revision: z.number().int().min(1),
  ppq: z.literal(PPQ),
  tempoMap: z.array(z.object({ tick: z.number().int().min(0), bpm: z.number().positive().max(400) })).min(1),
  timeSignatures: z.array(z.object({ tick: z.number().int().min(0), num: z.number().int().positive(), den: z.number().int().positive() })).min(1),
  keySignatures: z.array(z.object({ tick: z.number().int().min(0), fifths: z.number().int().min(-7).max(7), mode: z.enum(['major', 'minor']).optional() })).min(1),
  measures: z.array(z.object({ index: z.number().int().min(0), startTick: z.number().int().min(0), lengthTicks: z.number().int().positive(), incomplete: z.boolean().optional() })),
  parts: z.array(partSchema).min(1),
  source: z.object({
    kind: z.enum(['musicxml', 'mxl', 'midi']), fileName: z.string(), storedAs: z.string(),
    originalPpq: z.number().int().positive().optional(), importReport: z.array(importIssueSchema),
    importOptions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }).optional(),
  provisional: z.object({ metadata: z.boolean().optional(), rhythm: z.boolean().optional(), note: z.string() }).optional(),
}).superRefine((song, ctx) => {
  if (song.tempoMap[0]!.tick !== 0) ctx.addIssue({ code: 'custom', message: 'tempoMap debe empezar en el tick 0' });
  const measureByIndex = new Map(song.measures.map((m) => [m.index, m]));
  for (const part of song.parts) for (const staff of part.staves) {
    const lastEnd = new Map<number, number>(); // por voz
    const byTick = [...staff.events].sort((a, b) => a.tick - b.tick);
    for (const e of byTick) {
      const m = measureByIndex.get(e.measure);
      if (!m) { ctx.addIssue({ code: 'custom', message: `El evento ${e.id} referencia un compás inexistente (${e.measure})` }); continue; }
      if (e.tick < m.startTick || e.tick + e.durationTicks > m.startTick + m.lengthTicks)
        ctx.addIssue({ code: 'custom', message: `El evento ${e.id} sale de los límites de su compás` });
      const prev = lastEnd.get(e.voice) ?? 0;
      if (e.tick < prev) ctx.addIssue({ code: 'custom', message: `El evento ${e.id} se solapa con otro en la misma voz` });
      lastEnd.set(e.voice, e.tick + e.durationTicks);
    }
    const ch = staff.clefChanges ?? [];
    for (let i = 1; i < ch.length; i++) if (ch[i]!.tick <= ch[i - 1]!.tick) ctx.addIssue({ code: 'custom', message: 'clefChanges debe tener ticks estrictamente crecientes' });
    // Ligaduras: cada tieNext necesita continuación con la misma altura en la misma voz.
    for (const e of staff.events) for (const cn of e.pitches) if (cn.tieNext) {
      const next = byTick.find((x) => x.voice === e.voice && x.tick === e.tick + e.durationTicks);
      if (!next || !next.pitches.some((p) => p.pitch.midi === cn.pitch.midi))
        ctx.addIssue({ code: 'custom', message: `Ligadura sin continuación en el evento ${e.id}` });
    }
  }
});

export type Song = z.infer<typeof songSchema>;
export type MusicEvent = z.infer<typeof eventSchema>;
export type Staff = z.infer<typeof staffSchema>;
export type ImportIssue = z.infer<typeof importIssueSchema>;

export interface SongSummary {
  id: string; title: string; genre: string; hands: 1 | 2; difficulty: number;
  origin: Song['origin']; modifiedAt: string; revision: number; provisional: boolean;
  provisionalMetadata?: boolean; provisionalRhythm?: boolean;
}
export const summarize = (s: Song): SongSummary => ({
  id: s.id, title: s.title, genre: s.genre, hands: s.hands, difficulty: s.difficulty,
  origin: s.origin, modifiedAt: s.modifiedAt, revision: s.revision, provisional: !!(s.provisional?.rhythm || s.provisional?.metadata),
  provisionalMetadata: !!s.provisional?.metadata, provisionalRhythm: !!s.provisional?.rhythm,
});

/** Valida un objeto desconocido. Devuelve la canción o una lista de mensajes legibles. */
export function validateSong(data: unknown): { ok: true; song: Song } | { ok: false; errors: string[] } {
  const r = songSchema.safeParse(data);
  if (r.success) return { ok: true, song: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) };
}

/** Datos de una canción que el usuario puede editar sin tocar la música. */
export const metadataPatchSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio.').max(120, 'El título admite hasta 120 caracteres.').optional(),
  genre: z.string().trim().min(1, 'El género es obligatorio.').max(60, 'El género admite hasta 60 caracteres.').optional(),
  difficulty: z.number().int('La dificultad debe ser un número entero.').min(1, 'La dificultad va de 1 a 10.').max(10, 'La dificultad va de 1 a 10.').optional(),
}).strict().refine((p) => Object.keys(p).length > 0, { message: 'No hay ningún cambio que guardar.' });
export type MetadataPatch = z.infer<typeof metadataPatchSchema>;
