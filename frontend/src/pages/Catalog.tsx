import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { SongSummary } from '@pianotutor/shared';
import { api, type ListResponse } from '../api/client';
import { navigate } from '../app/router';

const collator = new Intl.Collator('es', { sensitivity: 'base' });
const ORIGIN: Record<SongSummary['origin'], string> = { preloaded: 'Precargada', imported: 'Importada', composed: 'Propia' };

export function CatalogPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.listSongs()); setError(''); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => [...(data?.songs ?? [])].sort((a, b) => collator.compare(a.title, b.title)), [data]);

  return (
    <main className="page">
      <div className="bar"><button onClick={() => navigate('/')}>← Menú principal</button></div>
      <h1>Catálogo de canciones</h1>
      {error && <div className="notice bad" role="alert">{error} <button onClick={() => void load()}>Reintentar</button></div>}
      {status && <div className="notice ok" role="status">{status}</div>}
      {data?.errors.length ? (
        <div className="notice warn" role="alert">
          <b>{data.errors.length === 1 ? 'Un archivo de la biblioteca no se pudo cargar:' : `${data.errors.length} archivos de la biblioteca no se pudieron cargar:`}</b>
          <ul>{data.errors.map((e) => <li key={e.file}><code>{e.file}</code>: {e.message}</li>)}</ul>
        </div>
      ) : null}
      {data && rows.length === 0 && !error && <p className="sub">La biblioteca está vacía.</p>}
      {rows.length > 0 && (
        <table className="cat">
          <thead><tr><th>Título</th><th>Género</th><th>Manos</th><th>Dificultad</th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <Fragment key={s.id}>
                <tr className={sel === s.id ? 'sel' : undefined}>
                  <td><button className="link" aria-expanded={sel === s.id} onClick={() => setSel(sel === s.id ? null : s.id)}>{s.title}</button></td>
                  <td>{s.genre}</td><td>{s.hands === 1 ? 'A una mano' : 'A dos manos'}</td><td>{s.difficulty}</td>
                </tr>
                {sel === s.id && <tr className="detail"><td colSpan={4}><SongCard song={s} onSaved={async (t) => { setStatus(`Canción guardada: «${t}»`); await load(); }} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function SongCard({ song, onSaved }: { song: SongSummary; onSaved: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState(`${song.title} (copia)`);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { const s = await api.saveAs(song.id, title); await onSaved(s.title); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <h2>{song.title}</h2>
      <p className="meta">{song.genre} · {song.hands === 1 ? 'A una mano' : 'A dos manos'} · Dificultad {song.difficulty}/10 · {ORIGIN[song.origin]}</p>
      {song.provisional && <p className="meta">Género, dificultad y ritmo son valores provisionales asignados en la migración.</p>}
      <div className="bar">
        <button className="primary" onClick={() => navigate(`/play/${encodeURIComponent(song.id)}`)}>Tocar esta canción</button>
      </div>
      <div className="bar">
        <input aria-label="Título de la copia" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <button disabled={busy || !title.trim()} onClick={() => void save()}>Guardar como copia propia</button>
      </div>
      {err && <p className="notice bad" role="alert">{err}</p>}
    </div>
  );
}
