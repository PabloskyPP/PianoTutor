import { createRoot } from 'react-dom/client';
import '@fontsource/noto-music/music-400.css';
import './styles/playing.css';   // CSS original, sin tocar
import './styles/app.css';       // ampliaciones (menú, catálogo, botones nuevos)
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(<App />);
