import { lazy, Suspense } from 'react';
import { useRoute } from './router';
import { MenuPage } from '../pages/Menu';
import { CatalogPage } from '../pages/Catalog';
import { PlayingPage } from '../pages/Playing';

// VexFlow (con su fuente incluida) pesa ~1 MB: solo se descarga al abrir «Añadir canción».
const AddSongPage = lazy(() => import('../pages/AddSong').then((m) => ({ default: m.AddSongPage })));

export function App() {
  const r = useRoute();
  switch (r.name) {
    case 'menu': return <MenuPage />;
    case 'catalog': return <CatalogPage />;
    case 'add': return <Suspense fallback={<main className="page"><p className="sub" role="status">Cargando…</p></main>}><AddSongPage /></Suspense>;
    case 'play': return <PlayingPage songId={r.id} />; // mismo componente al cambiar de id: no se reinicia el micrófono
    default: return <MenuPage />;
  }
}
