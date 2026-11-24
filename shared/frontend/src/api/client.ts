import type { MetadataPatch, Preferences, PreferencesPatch, PreviewResult, QuantGrid, HandMode, Song, SongSummary } from '@pianotutor/shared';

export class ApiError extends Error {
  constructor(message: string, readonly status = 0, readonly details?: string[]) { super(message); }
}
export interface ListResponse { songs: SongSummary[]; errors: { file: string; message: string }[] }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(url, init); }
  catch (e) {
    if ((e as Error).name === 'AbortError') throw e; throw new ApiError('No se pudo conectar con el servidor local. ¿Sigue en marcha Piano Tutor?'); }
  if (!res.ok) {
    let body: { error?: string; details?: string[] } = {};
    try { body = await res.json(); } catch { /* sin cuerpo JSON */ }
    throw new ApiError(body.error ?? `Error ${res.status} del servidor.`, res.status, body.details);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listSongs: () => request<ListResponse>('/api/songs'),
  getSong: (id: string) => request<Song>(`/api/songs/${encodeURIComponent(id)}`),
  /** Cambia título, género y/o dificultad (no la música). Exige la revisión que ve el usuario. */
  updateMetadata: (id: string, revision: number, patch: MetadataPatch) => request<Song>(`/api/songs/${encodeURIComponent(id)}/metadata`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'if-match': String(revision) }, body: JSON.stringify(patch) }),
  /** Mueve la canción a data/trash (no es un borrado definitivo). Exige la revisión que ve el usuario. */
  deleteSong: (id: string, revision: number) => request<{ id: string; title: string; trashedAs: string }>(`/api/songs/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'if-match': String(revision) } }),
  saveAs: (id: string, title: string) => request<Song>(`/api/songs/${encodeURIComponent(id)}/save-as`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
  }),
};

export interface ImportParams { fileName: string; hands?: 1 | 2; grid?: QuantGrid; handMode?: HandMode; split?: number; legato?: boolean }
export interface ImportMeta { title: string; genre: string; difficulty: number; confirmHands?: boolean }
const qs = (o: Record<string, string | number | boolean | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)])).toString();
const OCTET = { 'content-type': 'application/octet-stream' };

export const importApi = {
  preview: (bytes: ArrayBuffer, p: ImportParams, signal?: AbortSignal) =>
    request<PreviewResult>(`/api/import/preview?${qs({ ...p })}`, { method: 'POST', headers: OCTET, body: bytes, ...(signal ? { signal } : {}) }),
  save: (bytes: ArrayBuffer, p: ImportParams, m: ImportMeta) =>
    request<Song>(`/api/import?${qs({ ...p, title: m.title, genre: m.genre, difficulty: m.difficulty, confirmHands: m.confirmHands })}`, { method: 'POST', headers: OCTET, body: bytes }),
};

export const prefsApi = {
  get: () => request<{ preferences: Preferences }>('/api/preferences'),
  put: (patch: PreferencesPatch) => request<{ preferences: Preferences }>('/api/preferences', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }),
};
