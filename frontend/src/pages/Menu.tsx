import { navigate } from '../app/router';

/** Menú principal. Las opciones de fases futuras están deshabilitadas y rotuladas (no son botones falsos). */
export function MenuPage() {
  return (
    <main className="menu">
      <h1>Piano Tutor</h1>
      <p className="sub">Aprende, practica y compón al piano.</p>
      <nav className="menu-list" aria-label="Menú principal">
        <button className="menu-item" onClick={() => navigate('/catalog')}><b>Catálogo de canciones</b><span>Elige una canción y tócala</span></button>
        <button className="menu-item" disabled><b>Añadir una nueva canción</b><span>Importar MusicXML o MIDI · disponible en la Fase 2</span></button>
        <button className="menu-item" disabled><b>Componer una melodía propia</b><span>Editor de partituras · disponible en la Fase 5</span></button>
      </nav>
    </main>
  );
}
