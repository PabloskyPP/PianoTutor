/**
 * Importador MIDI estándar (.mid/.midi) → modelo interno. Ver docs/IMPORT.md para las limitaciones.
 * La cuantización solo afecta a la notación; el archivo original se conserva en data/imports/ para poder reimportar con otra rejilla.
 */
import { parseMidi } from 'midi-file';
import { PPQ, type MusicEvent, type Song } from '../model/schema';
import { spellMidi } from '../notation/durations';
import { DEFAULT_MIDI_OPTIONS, GRID_TICKS, ImportError, Report, type ImportDraft, type MidiImportOptions } from './types';

interface RawNote { start: number; end: number; midi: number; track: number }
const GRID_LABEL = { quarter: 'negras', eighth: 'corcheas', sixteenth: 'semicorcheas', thirtysecond: 'fusas' };
const MAX_MEASURES = 5000;

export function parseMidiFile(bytes: Uint8Array, hands: 1 | 2 | undefined, optsIn: Partial<MidiImportOptions> = {}): ImportDraft {
  const opt: MidiImportOptions = { ...DEFAULT_MIDI_OPTIONS, ...optsIn };
  const g = GRID_TICKS[opt.grid];
  if (!g) throw new ImportError('Rejilla de cuantización no válida.');
  const report = new Report();
  let midi: ReturnType<typeof parseMidi>;
  try { midi = parseMidi(bytes); } catch { throw new ImportError('El archivo MIDI no es válido o está dañado.'); }
  const ppq = midi.header.ticksPerBeat;
  if (!ppq) throw new ImportError(midi.header.framesPerSecond !== undefined
    ? 'El archivo MIDI usa temporización SMPTE, que no está soportada (solo «ticks por negra»).'
    : 'La cabecera del archivo MIDI está incompleta o dañada.');
  if (midi.header.format === 2) throw new ImportError('Los archivos MIDI de formato 2 (secuencias independientes) no están soportados.');
  const scale = PPQ / ppq;

  const notes: RawNote[] = [];
  const tempos: { tick: number; bpm: number }[] = [], times: { tick: number; num: number; den: number }[] = [], keys: { tick: number; fifths: number; mode: 'major' | 'minor' }[] = [];
  let drums = 0, sustain = false;
  midi.tracks.forEach((track, ti) => {
    let abs = 0; const open = new Map<number, number[]>();
    for (const ev of track) {
      abs += ev.deltaTime;
      const tick = Math.round(abs * scale);
      if (ev.type === 'noteOn' && ev.velocity > 0) {
        if (ev.channel === 9) { drums++; continue; }
        const k = ev.channel * 128 + ev.noteNumber; (open.get(k) ?? open.set(k, []).get(k)!).push(tick);
      } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) {
        if (ev.channel === 9) continue;
        const stack = open.get(ev.channel * 128 + ev.noteNumber);
        const start = stack?.shift();
        if (start === undefined) report.count('info', 'orphan-off', 'Se ignoraron fines de nota sin inicio');
        else notes.push({ start, end: tick, midi: ev.noteNumber, track: ti });
      } else if (ev.type === 'setTempo' && ev.microsecondsPerBeat > 0) tempos.push({ tick, bpm: 60_000_000 / ev.microsecondsPerBeat });
      else if (ev.type === 'timeSignature') times.push({ tick, num: ev.numerator, den: ev.denominator });
      else if (ev.type === 'keySignature') keys.push({ tick, fifths: Math.max(-7, Math.min(7, ev.key)), mode: ev.scale === 1 ? 'minor' : 'major' });
      else if (ev.type === 'controller' && ev.controllerType === 64) sustain = true;
    }
    const endTick = Math.round(abs * scale);
    open.forEach((stack, k) => { stack.forEach((start) => { notes.push({ start, end: endTick, midi: k % 128, track: ti }); report.count('warning', 'unclosed', 'Había notas sin cerrar; se cortaron al final de su pista'); }); });
  });
  if (drums) report.add('info', 'drums', `Se omitió el canal de percusión (canal 10): ${drums} golpes.`);
  if (sustain) report.add('info', 'sustain', 'El pedal de sustain del archivo se ignora (no afecta a la notación).');
  if (!notes.length) throw new ImportError('El archivo MIDI no contiene notas.');

  // Manos / pentagramas.
  const trackIds = [...new Set(notes.map((n) => n.track))];
  const span = Math.max(...notes.map((n) => n.midi)) - Math.min(...notes.map((n) => n.midi));
  const suggestedHands: 1 | 2 = trackIds.length >= 2 || span > 24 ? 2 : 1;
  const h = hands ?? suggestedHands;
  const staffOf = new Map<number, number>(); // pista -> pentagrama (modo por pista)
  let mode: 'single' | 'byTrack' | 'bySplit' = 'single';
  if (h === 2) {
    mode = opt.handMode === 'auto' ? (trackIds.length === 2 ? 'byTrack' : 'bySplit') : opt.handMode;
    if (mode === 'byTrack' && trackIds.length !== 2) { report.add('warning', 'bytrack', `Se pidió separar por pista pero el archivo tiene ${trackIds.length} pistas con notas; se separa por altura.`); mode = 'bySplit'; }
    if (mode === 'byTrack') {
      const mean = (t: number) => { const ns = notes.filter((n) => n.track === t); return ns.reduce((a, n) => a + n.midi, 0) / ns.length; };
      const sorted = [...trackIds].sort((a, b) => mean(b) - mean(a)); staffOf.set(sorted[0]!, 0); staffOf.set(sorted[1]!, 1);
      report.add('info', 'hands', 'Propuesta de manos: la pista de notas más agudas = mano derecha, la otra = mano izquierda. Confírmala o cámbiala antes de guardar.');
    } else report.add('info', 'hands', `Propuesta de manos: notas desde la altura MIDI ${opt.splitMidi} hacia arriba = mano derecha, las demás = mano izquierda. Confírmala o cámbiala antes de guardar.`);
  } else if (trackIds.length > 1) report.add('info', 'merge', `Las ${trackIds.length} pistas con notas se combinan en un único pentagrama.`);
  const nStaves = h === 2 ? 2 : 1;
  const staffNotes: RawNote[][] = Array.from({ length: nStaves }, () => []);
  for (const n of notes) staffNotes[h === 1 ? 0 : mode === 'byTrack' ? staffOf.get(n.track)! : (n.midi >= opt.splitMidi ? 0 : 1)]!.push({ ...n });

  // Cuantización.
  let collapsed = 0, trimmed = 0;
  for (const sn of staffNotes) {
    for (const n of sn) {
      const s = Math.round(n.start / g) * g; let e = Math.round(n.end / g) * g;
      if (e <= s) { e = s + g; collapsed++; }
      n.start = s; n.end = e;
    }
    if (opt.legatoTrim) {
      sn.sort((a, b) => a.start - b.start);
      const starts = [...new Set(sn.map((n) => n.start))];
      for (const a of sn) {
        const nextStart = starts.find((s) => s > a.start);
        if (nextStart !== undefined && a.end > nextStart && a.end - nextStart <= g && nextStart - a.start >= g) { a.end = nextStart; trimmed++; }
      }
    }
  }
  report.add('info', 'quant', `Cuantizado a ${GRID_LABEL[opt.grid]}. Los ritmos más finos se aproximan y los tresillos no se reconocen: la notación puede diferir de lo interpretado.`);
  if (collapsed) report.add('warning', 'short', `${collapsed} notas más cortas que la rejilla se alargaron a una casilla.`);
  if (trimmed) report.add('info', 'legato', `${trimmed} solapes de legato se recortaron.`);

  // Compases, métrica, armadura y tempo.
  const maxEnd = Math.max(...staffNotes.flat().map((n) => n.end));
  times.sort((a, b) => a.tick - b.tick);
  if (!times.length || times[0]!.tick > 0) { times.unshift({ tick: 0, num: 4, den: 4 }); report.add('info', 'no-time', 'El archivo no indica compás; se asume 4/4.'); }
  const measures: Song['measures'] = [], timeSignatures: Song['timeSignatures'] = [];
  let start = 0, ts = times[0]!, ti = 0, snapWarn = false;
  while (start < maxEnd) {
    while (ti < times.length && times[ti]!.tick <= start) {
      const t = times[ti++]!; if (t.tick < start && t.tick > (measures.at(-1)?.startTick ?? 0) && !snapWarn) { snapWarn = true; report.add('warning', 'timesig-mid', 'Un cambio de compás no coincidía con una barra; se aplica desde la siguiente barra.'); }
      if (t.num !== ts.num || t.den !== ts.den || !timeSignatures.length) { ts = t; timeSignatures.push({ tick: start, num: t.num, den: t.den }); }
    }
    if (!timeSignatures.length) timeSignatures.push({ tick: 0, num: ts.num, den: ts.den });
    const len = (ts.num * 4 * PPQ) / ts.den;
    measures.push({ index: measures.length, startTick: start, lengthTicks: len }); start += len;
    if (measures.length > MAX_MEASURES) throw new ImportError(`El archivo es demasiado largo (más de ${MAX_MEASURES} compases).`);
  }
  const measureAt = (tick: number) => { let lo = 0, hi = measures.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (measures[m]!.startTick <= tick) lo = m; else hi = m - 1; } return measures[lo]!; };
  keys.sort((a, b) => a.tick - b.tick);
  const keySignatures: Song['keySignatures'] = [];
  for (const k of keys) { const t = measureAt(k.tick).startTick; const l = keySignatures.at(-1); if (l && l.tick === t) { l.fifths = k.fifths; l.mode = k.mode; } else if (!l || l.fifths !== k.fifths) keySignatures.push({ tick: t, fifths: k.fifths, mode: k.mode }); }
  if (!keySignatures.length || keySignatures[0]!.tick !== 0) { keySignatures.unshift({ tick: 0, fifths: 0, mode: 'major' }); report.add('info', 'no-key', 'El archivo no indica armadura; se asume Do mayor (las alteraciones se escriben con sostenidos).'); }
  const fifthsAt = (tick: number) => { let f = keySignatures[0]!.fifths; for (const k of keySignatures) if (k.tick <= tick) f = k.fifths; return f; };
  tempos.sort((a, b) => a.tick - b.tick);
  const tempoMap: Song['tempoMap'] = [];
  for (const t of tempos) { const bpm = Math.min(400, t.bpm); if (t.bpm > 400) report.count('warning', 'bpm', 'Había tempos superiores a 400 BPM; se limitaron'); const l = tempoMap.at(-1); if (l && l.tick === t.tick) l.bpm = bpm; else if (!l || l.bpm !== bpm) tempoMap.push({ tick: t.tick, bpm }); }
  if (!tempoMap.length) { tempoMap.push({ tick: 0, bpm: 120 }); report.add('info', 'no-tempo', 'El archivo no indica tempo; se asumen 120 BPM (el valor por defecto de MIDI).'); }
  else if (tempoMap[0]!.tick > 0) tempoMap.unshift({ tick: 0, bpm: tempoMap[0]!.bpm });

  // Eventos por pentagrama.
  let evId = 0, maxVoices = 1;
  const staves: Song['parts'][number]['staves'] = staffNotes.map((sn, si) => {
    const groups = new Map<string, RawNote[]>();
    for (const n of sn) { const k = `${n.start}|${n.end}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(n); }
    const ordered = [...groups.values()].sort((a, b) => a[0]!.start - b[0]!.start || Math.max(...b.map((x) => x.midi)) - Math.max(...a.map((x) => x.midi)));
    const voiceEnd: number[] = [], events: MusicEvent[] = [];
    for (const grp of ordered) {
      const { start: s, end: e } = grp[0]!;
      let v = voiceEnd.findIndex((x) => x <= s); if (v < 0) { v = voiceEnd.length; voiceEnd.push(0); }
      voiceEnd[v] = e;
      const pitchesDesc = [...new Set(grp.map((x) => x.midi))].sort((a, b) => a - b);
      const segs: { tick: number; dur: number; m: number }[] = [];
      for (let t = s; t < e;) { const m = measureAt(t); const segEnd = Math.min(e, m.startTick + m.lengthTicks); segs.push({ tick: t, dur: segEnd - t, m: m.index }); t = segEnd; }
      segs.forEach((sg, i) => events.push({
        id: `e${evId++}`, type: pitchesDesc.length > 1 ? 'chord' : 'note', tick: sg.tick, durationTicks: sg.dur, voice: v + 1, measure: sg.m,
        pitches: pitchesDesc.map((mm) => ({ pitch: spellMidi(mm, fifthsAt(s)), ...(i < segs.length - 1 ? { tieNext: true } : {}), ...(i > 0 ? { tiePrev: true } : {}) })),
      }));
    }
    maxVoices = Math.max(maxVoices, voiceEnd.length);
    // Silencios en la voz 1 para completar cada compás.
    const v1 = events.filter((e) => e.voice === 1).sort((a, b) => a.tick - b.tick);
    for (const m of measures) {
      let cur = m.startTick; const end = m.startTick + m.lengthTicks;
      for (const e of v1.filter((x) => x.measure === m.index)) { if (e.tick > cur) events.push({ id: `e${evId++}`, type: 'rest', pitches: [], tick: cur, durationTicks: e.tick - cur, voice: 1, measure: m.index }); cur = e.tick + e.durationTicks; }
      if (cur < end) events.push({ id: `e${evId++}`, type: 'rest', pitches: [], tick: cur, durationTicks: end - cur, voice: 1, measure: m.index });
    }
    events.sort((a, b) => a.tick - b.tick || a.voice - b.voice);
    if (!sn.length) report.add('warning', 'empty-staff', `El pentagrama ${si === 0 ? 'superior' : 'inferior'} queda vacío con esta separación de manos.`);
    return { index: si, clef: (si === 0 ? 'G' : 'F') as 'G' | 'F', hand: (si === 0 ? 'right' : 'left') as 'right' | 'left', events };
  });
  if (maxVoices > 2) report.add('warning', 'voices', `Hay pasajes con hasta ${maxVoices} voces simultáneas por pentagrama; la partitura puede resultar poco legible.`);
  return {
    kind: 'midi', suggestedTitle: '', suggestedHands, originalPpq: ppq, tempoMap, timeSignatures, keySignatures, measures,
    parts: [{ id: 'P1', name: 'Piano', staves }], report: report.list,
    options: { grid: opt.grid, handMode: h === 2 ? mode : 'single', splitMidi: opt.splitMidi, legatoTrim: opt.legatoTrim, hands: h },
  };
}
