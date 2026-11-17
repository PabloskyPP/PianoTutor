import { useEffect, useState } from 'react';

export type Route = { name: 'menu' } | { name: 'catalog' } | { name: 'play'; id: string } | { name: 'notfound' };

export function parseHash(hash: string): Route {
  const p = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p.length === 0) return { name: 'menu' };
  if (p[0] === 'catalog' && p.length === 1) return { name: 'catalog' };
  if (p[0] === 'play' && p.length === 2) return { name: 'play', id: decodeURIComponent(p[1]!) };
  return { name: 'notfound' };
}
export const navigate = (path: string) => { location.hash = '#' + path; };
export function useRoute(): Route {
  const [r, setR] = useState(() => parseHash(location.hash));
  useEffect(() => { const f = () => setR(parseHash(location.hash)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return r;
}
