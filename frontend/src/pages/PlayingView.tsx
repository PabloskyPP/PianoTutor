import type { Ref } from 'react';
import { PianoKeyboard, type KeyFlash } from '../piano/PianoKeyboard';

export interface PlayingViewProps {
  songs: { id: string; title: string }[];
  songId: string;
  hits: number; miss: number; progress: number;
  now: string; msg: string;
  micOn: boolean; inputText: string;
  lo?: number; hi?: number;
  next: ReadonlySet<number>; flashes: Readonly<Record<number, KeyFlash>>;
  canvasRef?: Ref<HTMLCanvasElement>; kbRef?: Ref<HTMLDivElement>;
  onSelect?: (id: string) => void; onRestart?: () => void; onMic?: () => void;
  onMenu?: () => void; onCatalog?: () => void;
}

/**
 * Pantalla Playing (una mano). Estructura DOM idéntica a piano-tutor.html; lo único añadido son los dos
 * botones de navegación marcados con data-added (tests/regression/playing-parity.test.tsx lo verifica).
 */
export function PlayingView(p: PlayingViewProps) {
  return (
    <main>
      <h1>Piano Tutor</h1>
      <p className="sub">Toca la nota resaltada para avanzar por la partitura. Funciona con teclado MIDI, micrófono (piano acústico) o el teclado del ordenador.</p>
      <div className="bar">
        <button data-added="true" onClick={p.onMenu}>← Menú</button>
        <button data-added="true" onClick={p.onCatalog}>Catálogo</button>
        <select id="song" aria-label="Canción" value={p.songId} onChange={(e) => { p.onSelect?.(e.target.value); e.target.blur(); }}>
          {p.songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <button id="restart" onClick={p.onRestart}>Reiniciar</button>
        <button id="mic" className={p.micOn ? 'on' : undefined} aria-pressed={p.micOn} onClick={p.onMic}
          title={p.micOn ? 'Pulsa para desactivar el micrófono' : undefined}>{p.micOn ? 'Micrófono activo' : 'Activar micrófono'}</button>
        <span className="stats">Aciertos <b id="hits">{p.hits}</b> Fallos <b id="miss">{p.miss}</b> Progreso <b id="prog">{p.progress}%</b></span>
      </div>
      <div className="score"><canvas id="cv" ref={p.canvasRef} role="img" aria-label="Partitura: la nota resaltada es la siguiente a tocar" /><div className="now" id="now">{p.now}</div></div>
      <div className="msg" id="msg" aria-live="polite">{p.msg}</div>
      <PianoKeyboard {...(p.lo !== undefined ? { lo: p.lo } : {})} {...(p.hi !== undefined ? { hi: p.hi } : {})} next={p.next} flashes={p.flashes} kbRef={p.kbRef} />
      <p className="help" id="inp">{p.inputText}</p>
      <p className="help">Teclado del ordenador: <kbd>A W S E D F T G Y H U J K O L P</kbd> = Do central a Re♯ (octava superior). También puedes hacer clic en las teclas. Con el micrófono se acepta la nota en cualquier octava. Pulsa de nuevo «Micrófono activo» para desactivarlo.</p>
    </main>
  );
}
