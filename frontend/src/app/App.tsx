import { useRoute } from './router';
import { MenuPage } from '../pages/Menu';
import { CatalogPage } from '../pages/Catalog';
import { PlayingPage } from '../pages/Playing';

export function App() {
  const r = useRoute();
  switch (r.name) {
    case 'menu': return <MenuPage />;
    case 'catalog': return <CatalogPage />;
    case 'play': return <PlayingPage songId={r.id} />; // mismo componente al cambiar de id: no se reinicia el micrófono
    default: return <MenuPage />;
  }
}
