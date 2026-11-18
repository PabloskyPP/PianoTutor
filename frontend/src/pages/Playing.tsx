import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { LearningSession, toPerformance, diatonicStep, noteNameEs, type Song } from '@pianotutor/shared';
import { api } from '../api/client';
import { tone } from '../audio/engine';
import { InputHub, type NoteInputEvent } from '../input/hub';
import { attachComputerKeyboard, attachVirtualKeyboard } from '../input/keyboard';
import { connectMidi, midiStatusText, type MidiStatus } from '../input/midi';
import { MicInput } from '../input/mic';
import { ScrollScoreRenderer } from '../score/ScrollScoreRenderer';
import type { KeyFlash } from '../piano/PianoKeyboard';
import { PlayingView } from './PlayingView';
import { navigate } from '../app/router';

const FLASH_MS = 180;

/** Playing (una mano, modo Aprendizaje). La lógica musical vive en shared/LearningSession; aquí solo se conecta a la UI. */
export function PlayingPage({ songId }: { songId: string }) {
  const [list, setList] = useState<{ id: string; title: string }[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [msg, setMsg] = useState('');
  const [micOn, setMicOn] = useState(false);
  const [inputText, setInputText] = useState('Teclado MIDI: buscando…');
  const [range, setRange] = useState({ lo: 60, hi: 84 });
  const [flashes, setFlashes] = useState<Record<number, KeyFlash>>({});
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  const session = useRef<LearningSession | null>(null);
  const hub = useRef(new InputHub());
  const renderer = useRef<ScrollScoreRenderer | null>(null);
  const mic = useRef<MicInput | null>(null);
  const micBusy = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const kb = useRef<HTMLDivElement>(null);
  const timers = useRef(new Set<number>());

  const flash = useCallback((midi: number, cls: KeyFlash) => {
    setFlashes((f) => ({ ...f, [midi]: cls }));
    const t = window.setTimeout(() => { timers.current.delete(t); setFlashes((f) => { const { [midi]: _gone, ...rest } = f; return rest; }); }, FLASH_MS);
    timers.current.add(t);
  }, []);

  const handleInput = useCallback((e: NoteInputEvent) => {
    if (e.kind !== 'on') return;
    if (e.source === 'virtual' || e.source === 'computer-keyboard') tone(e.midi);
    const s = session.current; if (!s) return;
    const mic = e.source === 'mic';
    // Comportamiento heredado: el micrófono acepta cualquier octava y nunca cuenta fallos (el detector ya filtra).
    const r = s.noteOn(e.midi, { pitchClassOnly: mic, countMisses: !mic });
    if (r.outcome === 'hit') { flash(e.midi, 'ok'); renderer.current?.setPos(s.pos); }
    else if (r.outcome === 'miss' && !mic) flash(e.midi, 'bad');
    if (r.finishedSong) setMsg(`¡Canción completada! Precisión: ${s.accuracyPercent}% (${s.misses} fallos).`);
    redraw();
  }, [flash]);

  // Montaje: entradas, renderer y micrófono. Todo se libera al desmontar.
  useEffect(() => {
    const h = hub.current;
    const unsub = h.subscribe(handleInput);
    const detachKeys = attachComputerKeyboard(h);
    const detachVirtual = kb.current ? attachVirtualKeyboard(kb.current, h) : () => {};
    const detachMidi = connectMidi(h, (st: MidiStatus) => setInputText(midiStatusText(st)));
    renderer.current = new ScrollScoreRenderer(canvas.current!);
    mic.current = new MicInput({
      accept: (m) => { const t = session.current?.current; return !!t && t.midis.some((x) => x % 12 === m % 12); },
      onNote: (m) => h.emit({ kind: 'on', midi: m, tMs: performance.now(), source: 'mic' }),
    });
    api.listSongs().then((r) => setList(r.songs.map((x) => ({ id: x.id, title: x.title })).sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }))))
      .catch((e: Error) => setMsg(e.message));
    const pending = timers.current;
    return () => {
      unsub(); detachKeys(); detachVirtual(); detachMidi();
      mic.current?.stop(); mic.current = null;
      renderer.current?.dispose(); renderer.current = null;
      pending.forEach((t) => clearTimeout(t)); pending.clear();
    };
  }, [handleInput]);

  // Carga de canción (también al cambiar de canción con el micrófono activo: se reinicia su estado interno).
  useEffect(() => {
    let cancelled = false;
    setMsg(''); mic.current?.reset();
    api.getSong(songId).then((s) => {
      if (cancelled) return;
      setSong(s);
      const events = toPerformance(s);
      if (s.hands !== 1 || events.some((e) => e.midis.length !== 1)) {
        session.current = null; renderer.current?.setNotes([]);
        setMsg('Esta canción usa acordes o dos manos; ese modo de interpretación llega en la Fase 3.'); redraw(); return;
      }
      session.current = new LearningSession(events);
      // El piano cubre al menos Do4–Do6 (como el original) y se amplía por octavas para incluir toda la canción.
      const ms = events.map((e) => e.midis[0]!), mn = Math.min(...ms), mx = Math.max(...ms);
      setRange({ lo: Math.min(60, mn - (mn % 12)), hi: Math.max(84, mx % 12 === 0 ? mx : mx + 12 - (mx % 12)) });
      const steps = events.map((e) => diatonicStep(e.notes[0]!.pitch));
      if (Math.min(...steps) < 23 || Math.max(...steps) > 50) setMsg('Aviso: hay notas fuera del rango que dibuja la partitura de esta versión; puedes tocarlas igualmente con el piano.');
      renderer.current?.setNotes(events.map((e) => ({ step: diatonicStep(e.notes[0]!.pitch), sharp: e.notes[0]!.pitch.alter === 1 })));
      redraw();
    }).catch((e: Error) => { if (!cancelled) { session.current = null; setSong(null); setMsg(e.message); redraw(); } });
    return () => { cancelled = true; };
  }, [songId]);

  const restart = () => { session.current?.reset(); renderer.current?.reset(); mic.current?.reset(); setMsg(''); redraw(); };

  const toggleMic = async () => {
    const m = mic.current; if (!m || micBusy.current) return;
    if (micOn) { m.stop(); setMicOn(false); return; }
    micBusy.current = true;
    try { await m.start(); setMicOn(m.active); }
    catch { setMsg('No se pudo acceder al micrófono. Revisa los permisos del navegador.'); setMicOn(false); }
    finally { micBusy.current = false; }
  };

  const s = session.current;
  const pending = s ? s.pending : [];
  return (
    <PlayingView
      songs={list.length ? list : song ? [{ id: song.id, title: song.title }] : []} songId={songId}
      hits={s?.hits ?? 0} miss={s?.misses ?? 0} progress={s?.progressPercent ?? 0}
      now={pending.length ? pending.map(noteNameEs).join(' + ') : ''} msg={msg}
      lo={range.lo} hi={range.hi} micOn={micOn} inputText={inputText} next={new Set(pending)} flashes={flashes}
      canvasRef={canvas} kbRef={kb}
      onSelect={(id) => navigate(`/play/${encodeURIComponent(id)}`)} onRestart={restart} onMic={toggleMic}
      onMenu={() => navigate('/')} onCatalog={() => navigate('/catalog')}
    />
  );
}
