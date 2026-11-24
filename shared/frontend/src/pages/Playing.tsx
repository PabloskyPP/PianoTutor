import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  LearningSession, RhythmSession, DEFAULT_RHYTHM, PROFILES, buildBeats, buildTimeline, fractionalIndex, noteNameEs, toPerformance,
  type Judgement, type PerformanceEvent, type Song, type TimedEvent,
} from '@pianotutor/shared';
import { api } from '../api/client';
import { getAudioContext, tone } from '../audio/engine';
import { newClock } from '../audio/clock';
import { Transport } from '../audio/transport';
import { BeatScheduler, createClickSink } from '../audio/beats';
import { calibrateLatency } from '../audio/calibrate';
import { InputHub, type NoteInputEvent } from '../input/hub';
import { attachComputerKeyboard, attachVirtualKeyboard } from '../input/keyboard';
import { connectMidi, midiStatusText, type MidiStatus } from '../input/midi';
import { MicInput } from '../input/mic';
import type { MicStatus } from '../input/audio/analyzer';
import { ScrollScoreRenderer } from '../score/ScrollScoreRenderer';
import { buildScoreEvents, outOfView } from '../score/scoreEvents';
import type { KeyFlash } from '../piano/PianoKeyboard';
import { PlayingView, type Phase } from './PlayingView';
import { PrefsPanel } from './PrefsPanel';
import { usePreferences } from '../app/prefs';
import { navigate } from '../app/router';

const FLASH_MS = 180;
const octaveName = (m: number) => `${noteNameEs(m)}${Math.floor(m / 12) - 1}`;
const floorC = (m: number) => m - (m % 12), ceilC = (m: number) => (m % 12 === 0 ? m : m + 12 - (m % 12));

/**
 * Playing: modos Aprendizaje y Ritmo, una o dos manos. La lógica musical está en shared (LearningSession, RhythmSession) y el tiempo en el
 * Transport (reloj de audio); aquí solo se conecta todo con la interfaz.
 */
export function PlayingPage({ songId }: { songId: string }) {
  const { prefs, update, error: prefsError } = usePreferences();
  const prefsRef = useRef(prefs); prefsRef.current = prefs;

  const [list, setList] = useState<{ id: string; title: string }[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [scoreEvs, setScoreEvs] = useState<ReturnType<typeof buildScoreEvents>>([]);
  const [msg, setMsg] = useState('');
  const [micOn, setMicOn] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>('listening');
  const [inputText, setInputText] = useState('Teclado MIDI: buscando…');
  const [range, setRange] = useState({ lo: 60, hi: 84 });
  const [flashes, setFlashes] = useState<Record<number, KeyFlash>>({});
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [calib, setCalib] = useState({ running: false, msg: '' });
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  const phaseRef = useRef<Phase>('idle');
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const perf = useRef<PerformanceEvent[]>([]);
  const timed = useRef<TimedEvent[]>([]);
  const learning = useRef<LearningSession | null>(null);
  const rhythm = useRef<RhythmSession | null>(null);
  const transport = useRef<Transport | null>(null);
  const sched = useRef<BeatScheduler | null>(null);
  const raf = useRef(0);
  const frameRef = useRef<() => void>(() => {});
  const countIn = useRef({ sec: 0, beats: 4, last: 0 });
  const lastUp = useRef('');
  const sustain = useRef(false);
  const calibrating = useRef(false);
  const micOnRef = useRef(false); micOnRef.current = micOn;
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

  const applyStatuses = () => {
    const r = rhythm.current;
    renderer.current?.setStatuses(perf.current.map((_, i) => (r ? r.statusOf(i) : 'pending')));
  };

  /** Traduce un juicio del modo Ritmo a color de tecla, mensaje y colores de la partitura. */
  const showJudgement = useCallback((j: Judgement, pressed?: number) => {
    const ms = (s: number) => `${s >= 0 ? '+' : '−'}${Math.abs(Math.round(s * 1000))} ms`;
    if (j.kind === 'hit') flash(pressed ?? j.midi, 'ok');
    else if (j.kind === 'timing') { flash(pressed ?? j.midi, 'warn'); setMsg(`${j.direction === 'early' ? 'Pronto' : 'Tarde'} (${ms(j.deltaSec)})`); }
    else if (j.kind === 'wrong') { flash(j.midi, 'bad'); setMsg(`Nota equivocada: ${noteNameEs(j.midi)}`); }
    else if (j.kind === 'omission') { flash(j.midi, 'bad'); setMsg(`Omitida: ${noteNameEs(j.midi)}`); }
    else return;
    applyStatuses(); redraw();
  }, [flash]);

  const learningOn = useCallback((e: NoteInputEvent) => {
    const s = learning.current; if (!s) return;
    const p = prefsRef.current, isMic = e.source === 'mic';
    const counted = !isMic || p.mic.countMisses;
    const r = s.noteOn(e.midi, { pitchClassOnly: isMic && p.mic.acceptAnyOctave, countMisses: counted, lenientChord: isMic, tMs: e.tMs });
    if (r.outcome === 'hit') { flash(e.midi, 'ok'); renderer.current?.setPos(s.pos); renderer.current?.setCovered(new Set(s.coveredNow)); }
    else if (r.outcome === 'miss' && counted) flash(e.midi, 'bad');
    if (r.finishedSong) setMsg(`¡Canción completada! Precisión: ${s.accuracyPercent}% (${s.misses} fallos).`);
    redraw();
  }, [flash]);

  const rhythmInput = useCallback((e: NoteInputEvent) => {
    const r = rhythm.current, tr = transport.current, ph = phaseRef.current;
    if (!r || !tr || (ph !== 'running' && ph !== 'countdown')) return;
    const p = prefsRef.current, isMic = e.source === 'mic', t = tr.atPerf(e.tMs);
    if (e.kind === 'on') {
      if (ph === 'countdown' && t < r.windowOf(0).from) return;   // pulsaciones durante la cuenta previa: sin penalización
      showJudgement(r.noteOn(e.midi, t, { pitchClassOnly: isMic && p.mic.acceptAnyOctave, lenientChord: isMic, countWrong: !isMic || p.mic.countMisses }), e.midi);
    } else if (e.kind === 'off' && r.noteOff(e.midi, t, { sustainDown: sustain.current })) redraw();
  }, [showJudgement]);

  const handleInput = useCallback((e: NoteInputEvent) => {
    if (e.kind === 'sustain') { sustain.current = !!e.down; return; }
    if (e.kind === 'on' && (e.source === 'virtual' || e.source === 'computer-keyboard')) tone(e.midi);
    if (calibrating.current) return;
    if (prefsRef.current.mode === 'learning') { if (e.kind === 'on') learningOn(e); } else rhythmInput(e);
  }, [learningOn, rhythmInput]);

  // ---- Modo Ritmo: ciclo de vida ----
  const stopRhythm = useCallback(() => {
    cancelAnimationFrame(raf.current); sched.current?.stop(); sched.current = null; transport.current?.stop(); transport.current = null;
    rhythm.current = null; lastUp.current = ''; setPhase('idle');
  }, []);

  const finishRhythm = () => {
    const r = rhythm.current; if (!r) return;
    cancelAnimationFrame(raf.current); sched.current?.stop(); transport.current?.pause(); r.finish(); applyStatuses();
    const s = r.stats;
    setMsg(`¡Terminado! Aciertos ${r.hits}, fallos ${r.fails} (precisión ${r.accuracyPercent}%). Omitidas ${s.omissions}, de tiempo ${s.timingEarly + s.timingLate}, equivocadas ${s.noteErrors}.`);
    setPhase('finished'); redraw();
  };

  frameRef.current = () => {
    const r = rhythm.current, tr = transport.current; if (!r || !tr) return;
    const t = tr.now();
    if (phaseRef.current === 'countdown') {
      if (t >= 0) { setPhase('running'); setMsg(''); }
      else { const k = Math.ceil(-t / (countIn.current.sec / countIn.current.beats)); if (k !== countIn.current.last) { countIn.current.last = k; setMsg(String(k)); } }
    }
    renderer.current?.setView(fractionalIndex(timed.current, t));
    const grace = micOnRef.current ? 0.3 : 0.05;   // el micrófono entrega las notas con retraso: se espera antes de dar una omisión
    r.tick(t - grace).forEach((j) => showJudgement(j));
    const up = r.upcoming; renderer.current?.setPos(up?.index ?? perf.current.length);
    const key = up ? `${up.index}:${up.midis.join(',')}` : ''; if (key !== lastUp.current) { lastUp.current = key; redraw(); }
    if (r.finished) { finishRhythm(); return; }
    raf.current = requestAnimationFrame(frameRef.current);
  };

  const startRhythm = async () => {
    const s = song; if (!s) return;
    if (!perf.current.length) { setMsg('La canción no tiene notas.'); return; }
    stopRhythm(); setMsg('');
    const p = prefsRef.current, ctx = getAudioContext();
    try { await ctx.resume(); } catch { setMsg('No se pudo iniciar el audio del navegador.'); return; }
    const prof = PROFILES[p.profile], extra = micOnRef.current ? 0.06 : 0;
    timed.current = buildTimeline(s, perf.current, p.speed);
    rhythm.current = new RhythmSession(timed.current, { ...DEFAULT_RHYTHM, okSec: prof.okMs / 1000 + extra, outSec: prof.outMs / 1000 + extra });
    const { beats, countInSec } = buildBeats(s, p.speed, true);
    countIn.current = { sec: countInSec, beats: s.timeSignatures[0]!.num, last: 0 };
    const clock = newClock(), tr = new Transport(clock); tr.setLatencyMs(p.latencyMs); transport.current = tr;
    sched.current = new BeatScheduler(tr, beats.filter((b) => p.metronome || b.t < 0), createClickSink(ctx), () => clock.audioNow());
    renderer.current?.setFollow(true); applyStatuses(); renderer.current?.setView(0);
    tr.start(-countInSec); sched.current.start(); setPhase('countdown'); redraw();
    raf.current = requestAnimationFrame(frameRef.current);
  };

  const togglePause = () => {
    const tr = transport.current; if (!tr) return;
    if (phaseRef.current === 'running' || phaseRef.current === 'countdown') {
      tr.pause(); sched.current?.stop(); cancelAnimationFrame(raf.current); setPhase('paused'); setMsg('En pausa');
    } else if (phaseRef.current === 'paused') {
      tr.resume(); sched.current?.start(); setPhase(tr.now() < 0 ? 'countdown' : 'running'); setMsg(''); raf.current = requestAnimationFrame(frameRef.current);
    }
  };
  const onStart = () => { const ph = phaseRef.current; if (ph === 'idle' || ph === 'finished') void startRhythm(); else togglePause(); };

  // ---- Montaje: entradas, renderer y micrófono. Todo se libera al desmontar. ----
  useEffect(() => {
    const h = hub.current;
    const unsub = h.subscribe(handleInput);
    const detachKeys = attachComputerKeyboard(h);
    const detachVirtual = kb.current ? attachVirtualKeyboard(kb.current, h) : () => {};
    const detachMidi = connectMidi(h, (st: MidiStatus) => setInputText(midiStatusText(st)), () => prefsRef.current.midiChannel);
    renderer.current = new ScrollScoreRenderer(canvas.current!);
    mic.current = new MicInput({
      sensitivity: prefsRef.current.mic.sensitivity,
      onNote: (ev) => h.emit({ kind: 'on', midi: ev.midi, tMs: ev.tMs, source: 'mic', confidence: ev.confidence }),
      onStatus: (s) => setMicStatus(s),
    });
    api.listSongs().then((r) => setList(r.songs.map((x) => ({ id: x.id, title: x.title })).sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }))))
      .catch((e: Error) => setMsg(e.message));
    const pending = timers.current;
    return () => {
      unsub(); detachKeys(); detachVirtual(); detachMidi();
      stopRhythm(); mic.current?.stop(); mic.current = null;
      renderer.current?.dispose(); renderer.current = null;
      pending.forEach((t) => clearTimeout(t)); pending.clear();
    };
  }, [handleInput, stopRhythm]);

  // ---- Carga de canción (también al cambiar de canción con el micrófono activo) ----
  useEffect(() => {
    let cancelled = false;
    setMsg(''); mic.current?.reset(); stopRhythm();
    api.getSong(songId).then((s) => {
      if (cancelled) return;
      const events = toPerformance(s); perf.current = events;
      const grand = s.hands === 2, se = buildScoreEvents(events, grand, s);
      renderer.current?.setLayout(grand ? 'grand' : 'single'); renderer.current?.setEvents(se);
      learning.current = events.length ? new LearningSession(events, { debounceMs: 30, simultaneityMs: prefsRef.current.simultaneityMs }) : null;
      const all = events.flatMap((e) => e.midis);
      if (all.length) {   // el piano cubre el rango por defecto (Do4–Do6, o Do3–Do6 a dos manos) y se amplía por octavas
        const mn = Math.min(...all), mx = Math.max(...all);
        setRange({ lo: Math.max(21, Math.min(grand ? 48 : 60, floorC(mn))), hi: Math.min(108, Math.max(84, ceilC(mx))) });
      } else setMsg('La canción no tiene notas.');
      setScoreEvs(se); setSong(s); redraw();
    }).catch((e: Error) => { if (!cancelled) { learning.current = null; perf.current = []; setSong(null); setMsg(e.message); redraw(); } });
    return () => { cancelled = true; };
  }, [songId, stopRhythm]);

  // ---- Cambio de modo ----
  useEffect(() => {
    stopRhythm(); setMsg(''); setFlashes({});
    const rn = renderer.current; if (!rn || !song) return;
    if (prefs.mode === 'rhythm') { rn.setFollow(true); rn.setCovered(new Set()); applyStatuses(); rn.setView(0); rn.setPos(0); }
    else { rn.setFollow(false); learning.current?.reset(); rn.reset(); }
    redraw();
  }, [prefs.mode, song, stopRhythm]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { renderer.current?.setNotation({ bars: prefs.showBars }); }, [prefs.showBars, song]);
  useEffect(() => { transport.current?.setLatencyMs(prefs.latencyMs); }, [prefs.latencyMs]);
  useEffect(() => { mic.current?.setSensitivity(prefs.mic.sensitivity); }, [prefs.mic.sensitivity]);

  const restart = () => {
    if (prefs.mode === 'rhythm') { stopRhythm(); applyStatuses(); renderer.current?.setView(0); renderer.current?.setPos(0); }
    else { learning.current?.reset(); renderer.current?.reset(); }
    mic.current?.reset(); setMsg(''); redraw();
  };

  const toggleMic = async () => {
    const m = mic.current; if (!m || micBusy.current) return;
    if (micOn) { m.stop(); setMicOn(false); return; }
    micBusy.current = true;
    try { await m.start(); setMicOn(m.active); }
    catch { setMsg('No se pudo acceder al micrófono. Revisa los permisos del navegador.'); setMicOn(false); }
    finally { micBusy.current = false; }
  };

  const runCalibration = async () => {
    if (calib.running) return;
    stopRhythm(); calibrating.current = true;
    setCalib({ running: true, msg: 'Pulsa una tecla (o una nota de tu piano MIDI) con cada clic: sonarán 8.' });
    try {
      const ctx = getAudioContext(); await ctx.resume();
      const r = await calibrateLatency({ clock: newClock(), hub: hub.current, sink: createClickSink(ctx) });
      if (r.ok) { update({ latencyMs: r.latencyMs }); setCalib({ running: false, msg: `Latencia estimada: ${r.latencyMs} ms (${r.samples} pulsaciones${r.unstable ? '; resultado irregular: repite la medición' : ''}).` }); }
      else setCalib({ running: false, msg: r.reason });
    } catch { setCalib({ running: false, msg: 'No se pudo iniciar el audio del navegador.' }); }
    finally { calibrating.current = false; }
  };

  // ---- Valores derivados para la vista ----
  const rhythmMode = prefs.mode === 'rhythm';
  const L = learning.current, R = rhythm.current;
  const pending = rhythmMode ? (R ? R.upcoming?.midis ?? [] : perf.current[0]?.midis ?? []) : (L?.pending ?? []);
  const hasChords = perf.current.some((e) => e.midis.length > 1);
  const notice = [
    micOn && micStatus === 'calibrating' ? 'Calibrando el ruido ambiente (1 s): no toques todavía.' : '',
    outOfView(scoreEvs, song?.hands === 2) ? 'Aviso: hay notas fuera del rango que dibuja la partitura de esta versión; puedes tocarlas igualmente con el piano.' : '',
    micOn && (hasChords || song?.hands === 2) ? 'Con el micrófono no se pueden comprobar los acordes ni las dos manos a la vez: basta con detectar una de las notas (fiabilidad baja). Para dos manos usa un teclado MIDI.' : '',
    micOn && rhythmMode ? 'El micrófono es menos preciso en el tiempo que un teclado MIDI: se amplía un poco la tolerancia.' : '',
    rhythmMode && song?.provisional?.rhythm ? 'El ritmo de esta canción es provisional (todas negras): no corresponde a la partitura real.' : '',
  ].filter(Boolean).join(' ');
  let detail = '';
  if (rhythmMode && R) { const s = R.stats; detail = `Acertadas ${s.hits} · Pronto ${s.timingEarly} · Tarde ${s.timingLate} · Equivocadas ${s.noteErrors} · Omitidas ${s.omissions} · Duración corta ${s.durationShort}${s.durationSkipped ? ` (no evaluable: ${s.durationSkipped})` : ''}`; }
  else if (!rhythmMode && L && (L.unverified || L.arpeggiated)) detail = `${L.unverified ? `Notas de acorde sin verificar: ${L.unverified}. ` : ''}${L.arpeggiated ? `Acordes tocados por separado: ${L.arpeggiated}.` : ''}`;

  return (
    <PlayingView
      songs={list.length ? list : song ? [{ id: song.id, title: song.title }] : []} songId={songId}
      hits={rhythmMode ? R?.hits ?? 0 : L?.hits ?? 0} miss={rhythmMode ? R?.fails ?? 0 : L?.misses ?? 0} progress={rhythmMode ? R?.progressPercent ?? 0 : L?.progressPercent ?? 0}
      now={pending.map(noteNameEs).join(' + ')} msg={msg}
      lo={range.lo} hi={range.hi} micOn={micOn} inputText={inputText} next={new Set(pending)} flashes={flashes}
      canvasRef={canvas} kbRef={kb}
      grand={song?.hands === 2} mode={prefs.mode} phase={phase} speed={prefs.speed} detail={detail} notice={notice}
      onSelect={(id) => navigate(`/play/${encodeURIComponent(id)}`)} onRestart={restart} onMic={toggleMic}
      onMenu={() => navigate('/')} onCatalog={() => navigate('/catalog')}
      onMode={(m) => update({ mode: m })} onStart={onStart} onSpeed={(v) => update({ speed: v })}
    >
      <PrefsPanel prefs={prefs} update={update} error={prefsError} onCalibrate={() => void runCalibration()} calibMsg={calib.msg} calibrating={calib.running}
        onRecalibrateMic={() => mic.current?.recalibrate()} micOn={micOn} />
    </PlayingView>
  );
}
