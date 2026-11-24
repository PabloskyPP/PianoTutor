import { PROFILES, type Preferences, type PreferencesPatch, type ProfileId } from '@pianotutor/shared';

export interface PrefsPanelProps {
  prefs: Preferences; update: (p: PreferencesPatch) => void; error: string;
  onCalibrate: () => void; calibMsg: string; calibrating: boolean;
  onRecalibrateMic: () => void; micOn: boolean;
}

/** Ajustes de interpretación. Plegado por defecto para no alterar el aspecto de Playing. */
export function PrefsPanel({ prefs, update, error, onCalibrate, calibMsg, calibrating, onRecalibrateMic, micOn }: PrefsPanelProps) {
  return (
    <details className="adv" data-added="true">
      <summary>Ajustes de interpretación</summary>
      <div className="prefs">
        <label>Tolerancia (modo Ritmo)
          <select value={prefs.profile} onChange={(e) => update({ profile: e.target.value as ProfileId })}>
            {(Object.keys(PROFILES) as ProfileId[]).map((k) => <option key={k} value={k}>{PROFILES[k].label} (±{PROFILES[k].okMs} ms acierto, ±{PROFILES[k].outMs} ms)</option>)}
          </select>
        </label>
        <label>Latencia (ms)
          <input type="number" min={-300} max={300} step={5} value={prefs.latencyMs} onChange={(e) => update({ latencyMs: Number(e.target.value) })} />
        </label>
        <button onClick={onCalibrate} disabled={calibrating}>{calibrating ? 'Calibrando…' : 'Calibrar latencia'}</button>
        <label className="check"><input type="checkbox" checked={prefs.metronome} onChange={(e) => update({ metronome: e.target.checked })} /> Metrónomo durante la canción (la cuenta previa siempre suena)</label>
        <label>Simultaneidad de acordes (ms, Aprendizaje)
          <input type="number" min={30} max={500} step={10} value={prefs.simultaneityMs} onChange={(e) => update({ simultaneityMs: Number(e.target.value) })} />
        </label>
        <label>Canal MIDI
          <select value={prefs.midiChannel} onChange={(e) => update({ midiChannel: Number(e.target.value) })}>
            <option value={0}>Todos</option>{Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
          </select>
        </label>
        <label>Sensibilidad del micrófono ({prefs.mic.sensitivity.toFixed(1)})
          <input type="range" min={0.5} max={3} step={0.1} value={prefs.mic.sensitivity} onChange={(e) => update({ mic: { sensitivity: Number(e.target.value) } })} />
        </label>
        <button onClick={onRecalibrateMic} disabled={!micOn}>Recalibrar ruido del micrófono</button>
        <label className="check"><input type="checkbox" checked={prefs.mic.acceptAnyOctave} onChange={(e) => update({ mic: { acceptAnyOctave: e.target.checked } })} /> Micrófono: aceptar la nota en cualquier octava</label>
        <label className="check"><input type="checkbox" checked={prefs.mic.countMisses} onChange={(e) => update({ mic: { countMisses: e.target.checked } })} /> Micrófono: contar como fallo las notas equivocadas detectadas</label>
      </div>
      {calibMsg && <p className="meta" role="status">{calibMsg}</p>}
      {error && <p className="notice bad" role="alert">{error}</p>}
      <p className="meta">La latencia se mide siguiendo los clics con cualquier tecla o con tu piano MIDI (no con el micrófono). Los ajustes se guardan en <code>data/settings.json</code>.</p>
    </details>
  );
}
