import { useEffect, useMemo, useRef, useState } from 'react';
import { distinctGenres, majorKeyName, noteNameEs, type HandMode, type PreviewResult, type QuantGrid, type Song } from '@pianotutor/shared';
import { api, importApi, type ImportParams } from '../api/client';
import { navigate } from '../app/router';
import { VexScore } from '../score/VexScore';

const GRIDS: [QuantGrid, string][] = [['quarter', 'Negras'], ['eighth', 'Corcheas'], ['sixteenth', 'Semicorcheas (recomendado)'], ['thirtysecond', 'Fusas']];
const MODES: [HandMode, string][] = [['auto', 'Automática (por pistas si hay dos; si no, por altura)'], ['byTrack', 'Por pista'], ['bySplit', 'Por altura']];
const PRESET_GENRES = ['Clásica', 'Infantil', 'Navidad', 'Popular', 'Folclore', 'Jazz', 'Ejercicio'];
const SPLITS = Array.from({ length: 49 }, (_, i) => 36 + i);
const noteLabel = (m: number) => `${noteNameEs(m)}${Math.floor(m / 12) - 1}`;
const isMidiName = (n: string) => /\.(mid|midi)$/i.test(n);
const LEVEL = { error: 'Error', warning: 'Aviso', info: 'Información' } as const;

export function AddSongPage() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [title, setTitle] = useState(''), [genre, setGenre] = useState(''), [difficulty, setDifficulty] = useState(''), [hands, setHands] = useState<'' | '1' | '2'>('');
  const [midi, setMidi] = useState<{ grid: QuantGrid; handMode: HandMode; split: number; legato: boolean }>({ grid: 'sixteenth', handMode: 'auto', split: 60, legato: true });
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewErr, setPreviewErr] = useState<{ message: string; details?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [saved, setSaved] = useState<Song | null>(null);
  const [known, setKnown] = useState<string[]>([]);
  const touched = useRef({ title: false, hands: false });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { api.listSongs().then((r) => setKnown(distinctGenres(r.songs))).catch(() => {}); }, []);
  const genres = useMemo(() => distinctGenres([...known.map((genre) => ({ genre })), ...PRESET_GENRES.map((genre) => ({ genre }))]), [known]);

  const params = useMemo<ImportParams | null>(() => file && {
    fileName: file.name, ...(hands ? { hands: Number(hands) as 1 | 2 } : {}),
    ...(isMidiName(file.name) ? { grid: midi.grid, handMode: midi.handMode, split: midi.split, legato: midi.legato } : {}),
  }, [file, hands, midi]);
  const pKey = JSON.stringify(params);

  // Previsualización con antirrebote; cancela la petición anterior si cambian las opciones.
  useEffect(() => {
    if (!params || !bytes) return;
    const ctl = new AbortController(); setLoading(true);
    const t = setTimeout(() => {
      importApi.preview(bytes, params, ctl.signal).then((r) => {
        setPreview(r); setPreviewErr(null);
        if (!touched.current.title && r.detected.suggestedTitle) setTitle(r.detected.suggestedTitle);
        if (!touched.current.title && !r.detected.suggestedTitle) setTitle(params.fileName.replace(/\.[^.]+$/, ''));
        if (!touched.current.hands) { setHands(String(r.detected.suggestedHands) as '1' | '2'); touched.current.hands = true; }
      }).catch((e: Error & { details?: string[] }) => { if (e.name !== 'AbortError') { setPreview(null); setPreviewErr({ message: e.message, ...(e.details ? { details: e.details } : {}) }); } })
        .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pKey, bytes]);
  useEffect(() => { setConfirm(false); }, [pKey]);   // la separación de manos propuesta cambió: hay que volver a confirmarla

  const chooseFile = async (f: File | null) => {
    setSaved(null); setSaveErr(''); setPreview(null); setPreviewErr(null); setConfirm(false); touched.current = { title: false, hands: false };
    setTitle(''); setHands('');
    if (!f) { setFile(null); setBytes(null); return; }
    if (f.size > 20 * 1024 * 1024) { setFile(null); setBytes(null); setPreviewErr({ message: 'El archivo supera el límite de 20 MB.' }); return; }
    setFile(f); setBytes(await f.arrayBuffer());
  };
  const reset = () => { void chooseFile(null); setGenre(''); setDifficulty(''); if (fileInput.current) fileInput.current.value = ''; };

  const midiFile = !!file && isMidiName(file.name);
  const needConfirm = midiFile && hands === '2';
  const missing: string[] = [];
  if (!file) missing.push('elige un archivo');
  if (file && !preview) missing.push(loading ? 'espera al análisis del archivo' : 'corrige el archivo');
  if (!title.trim()) missing.push('escribe el título'); if (!genre.trim()) missing.push('indica el género');
  if (!difficulty) missing.push('elige la dificultad (1–10)'); if (!hands) missing.push('elige una o dos manos');
  if (preview?.handsProblem) missing.push(preview.handsProblem);
  if (needConfirm && !confirm && preview) missing.push('confirma la separación de manos');
  const canSave = missing.length === 0 && !saving && !!params && !!bytes;

  const save = async () => {
    if (!canSave || !params || !bytes) return;
    setSaving(true); setSaveErr('');
    try { setSaved(await importApi.save(bytes, params, { title, genre, difficulty: Number(difficulty), confirmHands: confirm })); }
    catch (e) { setSaveErr((e as Error).message); }
    finally { setSaving(false); }
  };

  const st = preview?.stats;
  const playable = st && !st.hasChords && st.staves === 1 && st.voices === 1;
  return (
    <main className="page">
      <div className="bar"><button onClick={() => navigate('/')}>← Menú principal</button></div>
      <h1>Añadir una nueva canción</h1>
      <p className="sub">Importa una partitura en MusicXML (.musicxml, .xml, .mxl) o un archivo MIDI (.mid, .midi). Antes de guardar verás una previsualización; si cancelas, el catálogo no cambia.</p>

      {saved ? (
        <div className="notice ok" role="status">
          <b>Canción guardada</b>
          <p>«{saved.title}» ya está en el catálogo{saved.hands === 2 || !playable ? '. Aviso: la interpretación de canciones a dos manos o con acordes llega en la Fase 3; ahora se puede ver y guardar, pero Playing solo toca canciones de una mano sin acordes.' : '.'}</p>
          <div className="bar">
            {playable && <button className="primary" onClick={() => navigate(`/play/${encodeURIComponent(saved.id)}`)}>Tocar esta canción</button>}
            <button onClick={() => navigate('/catalog')}>Ver catálogo</button><button onClick={reset}>Añadir otra</button>
          </div>
        </div>
      ) : (
        <>
          <section className="panel">
            <div className="form">
              <label className="wide">Archivo
                <input ref={fileInput} type="file" accept=".musicxml,.xml,.mxl,.mid,.midi" onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)} />
              </label>
              <label className="wide">Título
                <input value={title} maxLength={120} onChange={(e) => { touched.current.title = true; setTitle(e.target.value); }} />
              </label>
              <label>Género
                <input list="genres" value={genre} maxLength={60} onChange={(e) => setGenre(e.target.value)} placeholder="Clásica, Infantil…" />
                <datalist id="genres">{genres.map((g) => <option key={g} value={g} />)}</datalist>
              </label>
              <label>Manos
                <select value={hands} onChange={(e) => { touched.current.hands = true; setHands(e.target.value as '' | '1' | '2'); }}>
                  <option value="">Elige…</option><option value="1">A una mano</option><option value="2">A dos manos</option>
                </select>
              </label>
              <label>Dificultad (1–10)
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="">Elige…</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </label>
            </div>
          </section>

          {midiFile && (
            <section className="panel">
              <h2>Opciones de importación MIDI</h2>
              <p className="meta">Un MIDI no trae partitura ni indica qué mano toca cada nota: la notación se obtiene cuantizando los tiempos y la separación de manos es una propuesta que debes revisar.</p>
              <div className="form">
                <label>Cuantización
                  <select value={midi.grid} onChange={(e) => setMidi({ ...midi, grid: e.target.value as QuantGrid })}>{GRIDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </label>
                <label className="check"><input type="checkbox" checked={midi.legato} onChange={(e) => setMidi({ ...midi, legato: e.target.checked })} /> Unir solapes de legato</label>
                {hands === '2' && <>
                  <label>Separación de manos
                    <select value={midi.handMode} onChange={(e) => setMidi({ ...midi, handMode: e.target.value as HandMode })}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  </label>
                  <label>Mano derecha desde
                    <select value={midi.split} onChange={(e) => setMidi({ ...midi, split: Number(e.target.value) })}>{SPLITS.map((m) => <option key={m} value={m}>{noteLabel(m)}</option>)}</select>
                  </label>
                </>}
              </div>
              {needConfirm && preview && (
                <label className="check confirm"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> He revisado la partitura y confirmo la separación de manos</label>
              )}
            </section>
          )}

          {loading && <p className="sub" role="status">Analizando el archivo…</p>}
          {previewErr && (
            <div className="notice bad" role="alert"><b>No se puede importar este archivo.</b> {previewErr.message}
              {previewErr.details?.length ? <ul>{previewErr.details.slice(0, 5).map((d) => <li key={d}>{d}</li>)}</ul> : null}
            </div>
          )}

          {preview && st && (
            <section className="panel" aria-label="Previsualización">
              <h2>Previsualización</h2>
              <dl className="stats-grid">
                <div><dt>Título</dt><dd>{title || '—'}</dd></div>
                <div><dt>Compases</dt><dd>{st.measures}</dd></div>
                <div><dt>Notas</dt><dd>{st.notes}</dd></div>
                <div><dt>Pentagramas</dt><dd>{st.staves}</dd></div>
                <div><dt>Rango</dt><dd>{st.lowMidi !== null && st.highMidi !== null ? `${noteLabel(st.lowMidi)} – ${noteLabel(st.highMidi)}` : '—'}</dd></div>
                <div><dt>Tempo</dt><dd>{Math.round(st.bpm)} BPM</dd></div>
                <div><dt>Compás</dt><dd>{st.timeSignature}</dd></div>
                <div><dt>Armadura</dt><dd>{st.fifths === 0 ? 'Sin alteraciones' : `${Math.abs(st.fifths)} ${st.fifths > 0 ? 'sostenido' : 'bemol'}${Math.abs(st.fifths) > 1 ? 's' : ''} (${majorKeyName(st.fifths)} mayor / relativa menor)`}</dd></div>
              </dl>
              {!playable && <p className="notice warn">Esta canción tiene {st.staves === 2 ? 'dos manos' : st.hasChords ? 'acordes' : 'varias voces'}: se puede guardar, pero Playing solo la tocará cuando llegue la Fase 3.</p>}
              {preview.handsProblem && <p className="notice bad" role="alert">{preview.handsProblem}</p>}
              <h3>Informe de importación</h3>
              {preview.report.length === 0 ? <p className="meta">Sin avisos: no se ha omitido nada.</p> : (
                <ul className="issues">{preview.report.map((r, i) => <li key={i} className={r.level}><b>{LEVEL[r.level]}:</b> {r.message}</li>)}</ul>
              )}
              <VexScore song={preview.song} />
            </section>
          )}

          {saveErr && <div className="notice bad" role="alert"><b>No se pudo guardar.</b> {saveErr}</div>}
          <div className="bar">
            <button className="primary" disabled={!canSave} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar canción'}</button>
            <button onClick={reset} disabled={saving}>Cancelar</button>
          </div>
          {missing.length > 0 && file && <p className="meta" aria-live="polite">Para guardar: {missing.join('; ')}.</p>}
        </>
      )}
    </main>
  );
}
