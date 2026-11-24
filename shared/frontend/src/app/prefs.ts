import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PREFERENCES, mergePreferences, type Preferences, type PreferencesPatch } from '@pianotutor/shared';
import { prefsApi } from '../api/client';

/**
 * Preferencias de interpretación: se cargan del servidor (data/settings.json) y cada cambio se aplica al instante en pantalla y se guarda
 * con un pequeño antirrebote (los cambios seguidos se agrupan en una sola petición). Si el servidor falla, la sesión sigue con lo elegido.
 */
export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [error, setError] = useState('');
  const latest = useRef(prefs); latest.current = prefs;
  const pending = useRef<PreferencesPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let off = false;
    prefsApi.get().then((r) => { if (!off) { setPrefs(r.preferences); latest.current = r.preferences; } })
      .catch((e: Error) => { if (!off) setError(`No se pudieron cargar las preferencias (se usan las predeterminadas): ${e.message}`); });
    return () => { off = true; };
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current); const patch = pending.current; pending.current = {};
    if (!Object.keys(patch).length) return;
    prefsApi.put(patch).then(() => setError('')).catch((e: Error) => setError(`No se pudieron guardar las preferencias: ${e.message}`));
  }, []);
  useEffect(() => () => flush(), [flush]);   // al salir de la pantalla, no se pierde el último cambio

  const update = useCallback((patch: PreferencesPatch) => {
    const m = mergePreferences(latest.current, patch);
    if (!m.ok) { setError(`Valor no válido: ${m.errors[0] ?? ''}`); return; }
    latest.current = m.value; setPrefs(m.value);
    const cur = pending.current;
    pending.current = { ...cur, ...patch, ...(patch.mic ? { mic: { ...cur.mic, ...patch.mic } } : {}) };
    clearTimeout(timer.current); timer.current = setTimeout(flush, 400);
  }, [flush]);

  return { prefs, update, error };
}
