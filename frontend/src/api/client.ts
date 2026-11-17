import type { Song, SongSummary } from '@pianotutor/shared';

export class ApiError extends Error {
  constructor(message: string, readonly status = 0, readonly details?: string[]) { super(message); }
}
export interface ListResponse { songs: SongSummary[]; errors: { file: string; message: string }[] }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(url, init); }
  catch { throw new ApiError('No se pudo conectar con el servidor local. ¿Sigue en marcha Piano Tutor?'); }
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
  saveAs: (id: string, title: string) => request<Song>(`/api/songs/${encodeURIComponent(id)}/save-as`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
  }),
};
