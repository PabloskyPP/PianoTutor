import type { ReactNode, Ref } from 'react';
import { PianoKeyboard, type KeyFlash } from '../piano/PianoKeyboard';

export type Phase = 'idle' | 'countdown' | 'running' | 'paused' | 'finished';
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
  // Fase 3 (todo lo añadido va marcado con data-added)
  grand?: boolean; mode?: 'learning' | 'rhythm'; phase?: Phase; speed?: number;
  detail?: string; notice?: string; children?: ReactNode;
  onMode?: (m: 'learning' | 'rhythm') => void; onStart?: () => void; onSpeed?: (s: number) => void;
}

const START_LABEL: Record<Phase, string> = { idle: 'Empezar', countdown: 'Pausa', running: 'Pausa', paused: 'Reanudar', finished: 'Repetir' };

/**
 * Pantalla Playing. Estructura DOM idéntica a piano-tutor.html; lo añadido (navegación, modo, empezar, velocidad, detalle, aviso, ajustes)
 * va marcado con data-added y la prueba tests/regression/playing-parity.test.ts verifica que el resto no cambia.
 */
export function PlayingView(p: PlayingViewProps) {
  const rhythm = p.mode === 'rhythm';
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
        {p.mode && (
          <select id="mode" data-added="true" aria-label="Modo de práctica" value={p.mode} onChange={(e) => { p.onMode?.(e.target.value as 'learning' | 'rhythm'); e.target.blur(); }}>
            <option value="learning">Aprendizaje</option><option value="rhythm">Ritmo</option>
          </select>
        )}
        {rhythm && <>
          <button id="start" data-added="true" className="primary" onClick={p.onStart}>{START_LABEL[p.phase ?? 'idle']}</button>
          <select id="speed" data-added="true" aria-label="Velocidad" value={String(p.speed ?? 1)} onChange={(e) => { p.onSpeed?.(Number(e.target.value)); e.target.blur(); }} disabled={p.phase !== 'idle' && p.phase !== 'finished'}>
            {[0.5, 0.75, 1, 1.25].map((v) => <option key={v} value={String(v)}>×{String(v).replace('.', ',')}</option>)}
          </select>
        </>}
        <span className="stats">Aciertos <b id="hits">{p.hits}</b> Fallos <b id="miss">{p.miss}</b> Progreso <b id="prog">{p.progress}%</b></span>
      </div>
      <div className={'score' + (p.grand ? ' grand' : '')}><canvas id="cv" ref={p.canvasRef} role="img" aria-label="Partitura: la nota resaltada es la siguiente a tocar" /><div className="now" id="now">{p.now}</div></div>
      <div className="msg" id="msg" aria-live="polite">{p.msg}</div>
      <PianoKeyboard {...(p.lo !== undefined ? { lo: p.lo } : {})} {...(p.hi !== undefined ? { hi: p.hi } : {})} next={p.next} flashes={p.flashes} kbRef={p.kbRef} />
      <p className="help" id="inp">{p.inputText}</p>
      <p className="help">Teclado del ordenador: <kbd>A W S E D F T G Y H U J K O L P</kbd> = Do central a Re♯ (octava superior). También puedes hacer clic en las teclas. Con el micrófono se acepta la nota en cualquier octava. Pulsa de nuevo «Micrófono activo» para desactivarlo.</p>
      {p.detail ? <p className="help" id="detail" data-added="true" aria-live="polite">{p.detail}</p> : null}
      {p.notice ? <p className="help" id="notice" data-added="true">{p.notice}</p> : null}
      {p.children}
    </main>
  );
}
