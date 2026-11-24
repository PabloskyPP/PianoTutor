import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFERENCES, mergePreferences, sanitizePreferences, preferencesSchema, PROFILES } from '@pianotutor/shared';

describe('preferencias', () => {
  it('los valores por defecto son válidos y el perfil «Principiante» es ±100/±200 ms (lo aprobado en la Fase 0)', () => {
    expect(preferencesSchema.safeParse(DEFAULT_PREFERENCES).success).toBe(true); expect(PROFILES.beginner).toMatchObject({ okMs: 100, outMs: 200 });
  });
  it('cambio parcial (incluido el anidado de mic) conserva lo demás', () => {
    const r = mergePreferences(DEFAULT_PREFERENCES, { latencyMs: 40, mic: { sensitivity: 2 } }); expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ latencyMs: 40, mode: 'learning', mic: { sensitivity: 2, acceptAnyOctave: true, countMisses: true } });
  });
  it('rechaza valores fuera de rango, tipos incorrectos y no-objetos', () => {
    for (const bad of [{ latencyMs: 999 }, { latencyMs: 'x' }, { speed: 0 }, { speed: 5 }, { mode: 'turbo' }, { midiChannel: 17 }, { mic: { sensitivity: 0 } }, { simultaneityMs: 1 }, { profile: 'dios' }]) expect(mergePreferences(DEFAULT_PREFERENCES, bad).ok, JSON.stringify(bad)).toBe(false);
    for (const bad of [null, 'x', 5, [1]]) expect(mergePreferences(DEFAULT_PREFERENCES, bad).ok).toBe(false);
  });
  it('sanitize: un campo dañado vuelve a su valor por defecto sin perder los demás', () => {
    expect(sanitizePreferences({ latencyMs: 20, speed: 99, mode: 'rhythm', basura: 1 })).toMatchObject({ latencyMs: 20, speed: 1, mode: 'rhythm' });
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES); expect(sanitizePreferences('x')).toEqual(DEFAULT_PREFERENCES);
  });
});
