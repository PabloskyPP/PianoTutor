/**
 * Modelo de canción → especificación de dibujo (datos puros, sin VexFlow ni DOM, así se puede probar en Node).
 * Se encarga de lo que el modelo no guarda: rellenar huecos con silencios invisibles, partir duraciones no notables
 * en figuras ligadas (solo en pantalla), agrupar tresillos y decidir qué alteraciones hay que escribir en cada compás.
 */
import { keyAlterations, notatable, splitNotatable, type Alter, type Song, type Step, type VexDuration } from '@pianotutor/shared';

export interface VexNoteSpec {
  kind: 'note' | 'rest' | 'ghost';
  keys: string[];                     // 'c/4', ordenadas de grave a agudo
  duration: VexDuration; dots: number;
  accidentals: (string | null)[];     // una por tecla
  tieNext: boolean[]; tieFromPrev: boolean[];
  tuplet?: { actual: number; normal: number };
  eventId: string; tick: number; ticks: number; approx?: boolean;
}
export interface VexLane { staff: number; voice: number; notes: VexNoteSpec[] }
export interface VexMeasure {
  index: number; startTick: number; lengthTicks: number; num: number; den: number;
  timeSig?: string; fifths: number; keyChanged: boolean; lanes: VexLane[];
}
export interface VexScoreSpec { staves: { index: number; clef: 'treble' | 'bass' | 'alto' }[]; measures: VexMeasure[] }

const CLEF = { G: 'treble', F: 'bass', C: 'alto' } as const;
const REST_KEY = { treble: 'b/4', bass: 'd/3', alto: 'c/4' } as const;
const SYM: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: 'n', 1: '#', 2: '##' };
const keyName = (p: { step: Step; octave: number }) => `${p.step.toLowerCase()}/${p.octave}`;

export function toVexSpec(song: Song): VexScoreSpec {
  const staves = song.parts.flatMap((p) => p.staves).sort((a, b) => a.index - b.index);
  const spec: VexScoreSpec = { staves: staves.map((s) => ({ index: s.index, clef: CLEF[s.clef] })), measures: [] };
  let num = song.timeSignatures[0]!.num, den = song.timeSignatures[0]!.den, fifths = song.keySignatures[0]!.fifths;

  for (const m of song.measures) {
    const ts = song.timeSignatures.find((t) => t.tick === m.startTick);
    const ks = song.keySignatures.filter((k) => k.tick <= m.startTick).at(-1);
    const keyChanged = !!ks && ks.fifths !== fifths && m.index > 0;
    if (ts) { num = ts.num; den = ts.den; }
    if (ks) fifths = ks.fifths;
    const vm: VexMeasure = { index: m.index, startTick: m.startTick, lengthTicks: m.lengthTicks, num, den, fifths, keyChanged, lanes: [],
      ...(ts ? { timeSig: `${num}/${den}` } : {}) };   // la métrica se muestra donde empieza o cambia
    const base = keyAlterations(fifths);
    for (const staff of staves) {
      const clef = CLEF[staff.clef];
      const evs = staff.events.filter((e) => e.measure === m.index);
      const voices = [...new Set(evs.map((e) => e.voice))].sort((a, b) => a - b);
      if (!voices.includes(1)) voices.unshift(1);
      const lanes: VexLane[] = voices.map((v) => ({ staff: staff.index, voice: v, notes: [] }));
      for (const lane of lanes) {
        let cursor = m.startTick;
        const ghost = (from: number, to: number) => { for (const p of splitNotatable(to - from).parts) lane.notes.push(blank('ghost', p.vex, p.dots, from, p.ticks)); };
        for (const e of evs.filter((x) => x.voice === lane.voice).sort((a, b) => a.tick - b.tick)) {
          if (e.tick > cursor) ghost(cursor, e.tick);
          const sorted = [...e.pitches].sort((a, b) => a.pitch.midi - b.pitch.midi);
          const mk = (vex: VexDuration, dots: number, tick: number, ticks: number, first: boolean, last: boolean, approx = false): VexNoteSpec => ({
            kind: e.type === 'rest' ? 'rest' : 'note', keys: e.type === 'rest' ? [REST_KEY[clef]] : sorted.map((p) => keyName(p.pitch)),
            duration: vex, dots, accidentals: sorted.map(() => null),
            tieNext: sorted.map((p) => (!last) || !!p.tieNext), tieFromPrev: sorted.map((p) => (!first) || !!p.tiePrev),
            ...(e.tuplet && notatable(Math.round(ticks * e.tuplet.actual / e.tuplet.normal)) ? { tuplet: e.tuplet } : {}),
            eventId: e.id, tick, ticks, ...(approx ? { approx } : {}),
          });
          const tupBase = e.tuplet ? notatable(Math.round(e.durationTicks * e.tuplet.actual / e.tuplet.normal)) : undefined;
          const direct = tupBase ?? notatable(e.durationTicks);
          if (direct) lane.notes.push(mk(direct.vex, direct.dots, e.tick, e.durationTicks, true, true));
          else {
            const { parts, approx } = splitNotatable(e.durationTicks);
            let t = e.tick;
            parts.forEach((p, i) => { lane.notes.push(mk(p.vex, p.dots, t, p.ticks, i === 0, i === parts.length - 1, approx)); t += p.ticks; });
            if (!parts.length) lane.notes.push(mk('64', 0, e.tick, e.durationTicks, true, true, true));
          }
          if (e.type === 'rest') { const l = lane.notes.at(-1)!; l.tieNext = []; l.tieFromPrev = []; }
          cursor = e.tick + e.durationTicks;
        }
        if (cursor < m.startTick + m.lengthTicks) ghost(cursor, m.startTick + m.lengthTicks);
      }
      // Alteraciones: estado por pentagrama y compás, en orden temporal (las alteraciones valen para todas las voces).
      const state = new Map<string, number>();
      const flat = lanes.flatMap((l) => l.notes.map((n) => ({ l, n }))).filter((x) => x.n.kind === 'note').sort((a, b) => a.n.tick - b.n.tick);
      for (const { n } of flat) {
        const ev = staff.events.find((x) => x.id === n.eventId)!;
        const sorted = [...ev.pitches].sort((a, b) => a.pitch.midi - b.pitch.midi);
        sorted.forEach((cp, i) => {
          const k = `${cp.pitch.step}${cp.pitch.octave}`;
          const cur = state.get(k) ?? base[cp.pitch.step as Step];
          if (n.tieFromPrev[i]) return;   // continuación de una ligadura: la alteración no se reescribe
          if (cp.pitch.alter !== cur) { n.accidentals[i] = SYM[cp.pitch.alter as Alter]!; state.set(k, cp.pitch.alter); }
        });
      }
      vm.lanes.push(...lanes);
    }
    spec.measures.push(vm);
  }
  return spec;
}

function blank(kind: 'ghost', duration: VexDuration, dots: number, tick: number, ticks: number): VexNoteSpec {
  return { kind, keys: ['b/4'], duration, dots, accidentals: [null], tieNext: [false], tieFromPrev: [false], eventId: '', tick, ticks };
}

/** Anchura natural de un compás (px) según su contenido. Pura, para repartir compases en sistemas. */
export function measureWidth(m: VexMeasure, first: boolean): number {
  const per = Math.max(1, ...m.lanes.map((l) => l.notes.length));
  const acc = Math.max(0, ...m.lanes.map((l) => l.notes.reduce((a, n) => a + n.accidentals.filter(Boolean).length, 0)));
  return Math.max(110, 26 + per * 36 + acc * 12 + (first ? 80 + Math.abs(m.fifths) * 11 : 0) + (m.timeSig ? 30 : 0));
}

/** Reparte compases en sistemas (líneas) para una anchura dada; la última línea no se estira. */
export function layoutSystems(spec: VexScoreSpec, width: number): { measures: number[]; widths: number[] }[] {
  const systems: { measures: number[]; widths: number[] }[] = []; let cur = { measures: [] as number[], widths: [] as number[] }; let used = 0;
  const flush = (stretch: boolean) => {
    if (!cur.measures.length) return;
    if (stretch && used < width) { const k = Math.min(1.5, width / used); cur.widths = cur.widths.map((w) => w * k); }
    systems.push(cur); cur = { measures: [], widths: [] }; used = 0;
  };
  for (const m of spec.measures) {
    const w = measureWidth(m, cur.measures.length === 0);
    if (cur.measures.length && used + w > width) flush(true);
    cur.measures.push(m.index); cur.widths.push(measureWidth(m, cur.measures.length === 1)); used += w;
  }
  flush(false);
  return systems;
}
