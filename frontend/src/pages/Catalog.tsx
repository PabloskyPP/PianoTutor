import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_FILTERS, distinctGenres, filterSongs, type CatalogFilters, type SongSummary } from '@pianotutor/shared';
import { api, type ListResponse } from '../api/client';
import { navigate } from '../app/router';

const ORIGIN: Record<SongSummary['origin'], string> = { preloaded: 'Precargada', imported: 'Importada', composed: 'Propia' };
const DIFFS = Array.from({ length: 10 }, (_, i) => i + 1);

export function CatalogPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [typed, setTyped] = useState('');                       // texto escrito (se aplica al pulsar «Buscar»)
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);

  const load = useCallback(async () => {
    try { setData(await api.listSongs()); setError(''); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const all = data?.songs ?? [];
  const rows = useMemo(() => filterSongs(all, filters), [all, filters]);
  const genres = useMemo(() => distinctGenres(all), [all]);
  const set = (p: Partial<CatalogFilters>) => setFilters((f) => ({ ...f, ...p }));
  const filtersActive = filters.genre !== '' || filters.minDifficulty !== 1 || filters.maxDifficulty !== 10 || filters.hands !== 'all' || filters.own !== 'all';

  return (
    <main className="page">
      <div className="bar"><button onClick={() => navigate('/')}>← Menú principal</button></div>
      <h1>Catálogo de canciones</h1>

      <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); set({ query: typed }); }}>
        <input type="search" aria-label="Buscar por título" placeholder="Buscar por título…" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="submit" className="primary">Buscar</button>
        <button type="button" onClick={() => { setTyped(''); set({ query: '' }); }} disabled={!typed && !filters.query}>Limpiar búsqueda</button>
      </form>
      <div className="filters" role="group" aria-label="Filtros">
        <label>Género
          <select value={filters.genre} onChange={(e) => set({ genre: e.target.value })}>
            <option value="">Todos</option>{genres.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label>Dificultad desde
          <select value={filters.minDifficulty} onChange={(e) => set({ minDifficulty: Number(e.target.value) })}>{DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        </label>
        <label>hasta
          <select value={filters.maxDifficulty} onChange={(e) => set({ maxDifficulty: Number(e.target.value) })}>{DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        </label>
        <label>Manos
          <select value={String(filters.hands)} onChange={(e) => set({ hands: e.target.value === 'all' ? 'all' : (Number(e.target.value) as 1 | 2) })}>
            <option value="all">Todas</option><option value="1">A una mano</option><option value="2">A dos manos</option>
          </select>
        </label>
        <label>Propias
          <select value={filters.own} onChange={(e) => set({ own: e.target.value as CatalogFilters['own'] })}>
            <option value="all">Todas</option><option value="own">Solo composiciones propias</option><option value="notOwn">Solo canciones no propias</option>
          </select>
        </label>
        {filtersActive && <button onClick={() => set({ genre: '', minDifficulty: 1, maxDifficulty: 10, hands: 'all', own: 'all' })}>Quitar filtros</button>}
      </div>

      {error && <div className="notice bad" role="alert">{error} <button onClick={() => void load()}>Reintentar</button></div>}
      {status && <div className="notice ok" role="status">{status}</div>}
      {data?.errors.length ? (
        <div className="notice warn" role="alert">
          <b>{data.errors.length === 1 ? 'Un archivo de la biblioteca no se pudo cargar:' : `${data.errors.length} archivos de la biblioteca no se pudieron cargar:`}</b>
          <ul>{data.errors.map((e) => <li key={e.file}><code>{e.file}</code>: {e.message}</li>)}</ul>
        </div>
      ) : null}
      {data && all.length === 0 && !error && <p className="sub">La biblioteca está vacía. Añade una canción desde el menú principal.</p>}
      {data && all.length > 0 && <p className="sub" aria-live="polite">{rows.length === all.length ? `${all.length} canciones` : `${rows.length} de ${all.length} canciones`}</p>}
      {data && all.length > 0 && rows.length === 0 && <div className="notice" role="status">No hay canciones que coincidan con la búsqueda y los filtros.</div>}
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
                {sel === s.id && <tr className="detail"><td colSpan={4}><SongCard song={s}
                  onSaved={async (t) => { setStatus(`Canción guardada: «${t}»`); await load(); }}
                  onDeleted={async (t) => { setSel(null); setStatus(`Canción eliminada: «${t}». Se movió a la carpeta data/trash (se puede recuperar a mano).`); await load(); }} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function SongCard({ song, onSaved, onDeleted }: { song: SongSummary; onSaved: (title: string) => Promise<void>; onDeleted: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState(`${song.title} (copia)`);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const protectedSong = song.origin === 'preloaded';
  const remove = async () => {
    setBusy(true); setErr('');
    try { const r = await api.deleteSong(song.id, song.revision); await onDeleted(r.title); }
    catch (e) { setErr((e as Error).message); setConfirming(false); } finally { setBusy(false); }
  };
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
      <div className="bar">
        {!confirming && <button className="danger" disabled={protectedSong || busy} onClick={() => setConfirming(true)} aria-describedby={protectedSong ? `prot-${song.id}` : undefined}>Eliminar canción</button>}
        {protectedSong && <span id={`prot-${song.id}`} className="meta">Las canciones precargadas no se pueden eliminar.</span>}
      </div>
      {confirming && (
        <div className="notice bad" role="alertdialog" aria-label="Confirmar eliminación">
          <p><b>¿Eliminar «{song.title}»?</b> Desaparecerá del catálogo y se moverá a la carpeta <code>data/trash</code> junto con su archivo original (si lo tiene). La aplicación no puede deshacerlo, pero puedes recuperarla a mano.</p>
          <div className="bar">
            <button className="danger solid" disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Sí, eliminar'}</button>
            <button disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {err && <p className="notice bad" role="alert">{err}</p>}
    </div>
  );
}
