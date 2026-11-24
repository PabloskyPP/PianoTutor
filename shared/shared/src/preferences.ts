/** Preferencias de interpretación (se guardan en data/settings.json). Validadas con Zod; los límites protegen frente a valores absurdos. */
import { z } from 'zod';

export const PROFILES = {
  beginner: { okMs: 100, outMs: 200, label: 'Principiante' },
  intermediate: { okMs: 70, outMs: 140, label: 'Intermedio' },
  advanced: { okMs: 40, outMs: 90, label: 'Avanzado' },
} as const;
export type ProfileId = keyof typeof PROFILES;

const micSchema = z.object({
  sensitivity: z.number().min(0.5).max(3),
  acceptAnyOctave: z.boolean(),
  countMisses: z.boolean(),
});
export const preferencesSchema = z.object({
  mode: z.enum(['learning', 'rhythm']),
  latencyMs: z.number().min(-300).max(300),           // + = las pulsaciones se registran tarde
  profile: z.enum(['beginner', 'intermediate', 'advanced']),
  simultaneityMs: z.number().min(30).max(500),        // Aprendizaje: dispersión máxima para considerar «simultáneo» un acorde
  metronome: z.boolean(),
  showBars: z.boolean(),                              // barras de compás y cifra de compás en la partitura de Playing
  speed: z.number().min(0.25).max(1.5),               // velocidad del modo Ritmo (1 = tempo de la canción)
  midiChannel: z.number().int().min(0).max(16),       // 0 = todos los canales
  mic: micSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const DEFAULT_PREFERENCES: Preferences = {
  mode: 'learning', latencyMs: 0, profile: 'beginner', simultaneityMs: 150, metronome: true, showBars: true, speed: 1, midiChannel: 0,
  mic: { sensitivity: 1, acceptAnyOctave: true, countMisses: true },
};
export type PreferencesPatch = Partial<Omit<Preferences, 'mic'>> & { mic?: Partial<Preferences['mic']> };

/** Aplica un cambio parcial sobre las preferencias actuales y valida el resultado completo. */
export function mergePreferences(current: Preferences, patch: unknown): { ok: true; value: Preferences } | { ok: false; errors: string[] } {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return { ok: false, errors: ['Las preferencias deben ser un objeto.'] };
  const p = patch as PreviewPatch;
  const merged = { ...current, ...p, mic: { ...current.mic, ...(typeof p.mic === 'object' && p.mic ? p.mic : {}) } };
  const r = preferencesSchema.safeParse(merged);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}
type PreviewPatch = Record<string, unknown> & { mic?: unknown };

/** Lee preferencias guardadas (posiblemente antiguas o dañadas): cada campo inválido vuelve a su valor por defecto. */
export function sanitizePreferences(raw: unknown): Preferences {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFERENCES;
  const r = raw as Record<string, unknown>;
  let out: Preferences = DEFAULT_PREFERENCES;
  for (const [k, v] of Object.entries(r)) { const m = mergePreferences(out, { [k]: v }); if (m.ok) out = m.value; }
  return out;
}
