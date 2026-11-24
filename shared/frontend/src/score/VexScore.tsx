import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Accidental, Beam, ClefNote, Dot, Formatter, GhostNote, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Tuplet, Voice } from 'vexflow/bravura';
import { majorKeyName, type Song } from '@pianotutor/shared';
import { layoutSystems, toVexSpec, type VexLane, type VexMeasure, type VexNoteSpec, type VexScoreSpec } from './toVexSpec';

const INK = '#2a2f3d', STAFF_GAP = 96, SYSTEM_PAD = 34;

/** Dibuja un sistema (línea) con VexFlow dentro de `host`. Devuelve el alto usado. */
export function drawSystem(host: HTMLElement, spec: VexScoreSpec, measureIdx: number[], widths: number[], y0: number, ctx: ReturnType<Renderer['getContext']>): number {
  let x = 6;
  const twoStaves = spec.staves.length > 1;
  const carry = new Map<string, boolean[]>(); // lane -> ligaduras que continúan al siguiente compás
  measureIdx.forEach((mi, k) => {
    const m = spec.measures[mi]!, w = widths[k]!, first = k === 0;
    const staveObjs = spec.staves.map((s, i) => {
      const st = new Stave(x, y0 + i * STAFF_GAP, w);
      if (first) { st.addClef(m.clefs[s.index] ?? s.clef); if (m.fifths) st.addKeySignature(majorKeyName(m.fifths)); }
      else if (m.keyChanged) st.addKeySignature(majorKeyName(m.fifths));
      if (m.timeSig) st.addTimeSignature(m.timeSig);
      st.setContext(ctx).draw(); return st;
    });
    if (twoStaves) {
      if (first) new StaveConnector(staveObjs[0]!, staveObjs[1]!).setType('brace').setContext(ctx).draw();
      new StaveConnector(staveObjs[0]!, staveObjs[1]!).setType(first ? 'singleLeft' : 'singleRight').setContext(ctx).draw();
    }
    // Voces de ambos pentagramas en un único formateador: así las notas simultáneas quedan alineadas.
    const built = m.lanes.map((lane) => buildLane(lane, spec.staves.find((s) => s.index === lane.staff)!.clef, m, first));
    const voices = built.map((b) => b.voice);
    if (voices.length) {
      const startX = Math.max(...staveObjs.map((s) => s.getNoteStartX()));
      new Formatter().joinVoices(voices).format(voices, Math.max(40, x + w - startX - 12));
    }
    built.forEach((b, i) => {
      const stave = staveObjs[spec.staves.findIndex((s) => s.index === m.lanes[i]!.staff)]!;
      b.voice.draw(ctx, stave);
      b.beams.forEach((bm) => bm.setContext(ctx).draw()); b.tuplets.forEach((t) => t.setContext(ctx).draw());
      const key = `${m.lanes[i]!.staff}:${m.lanes[i]!.voice}`;
      drawTies(ctx, b.notes, b.specs, carry.get(key));
      const last = b.specs.at(-1);
      carry.set(key, last ? last.tieNext : []);
    });
    x += w;
  });
  void host;
  return (twoStaves ? STAFF_GAP : 0) + SYSTEM_PAD + 70;
}

type Tick = StaveNote | GhostNote | ClefNote | null;   // null = elemento que no se dibuja (mantiene el índice alineado con lane.notes)
function buildLane(lane: VexLane, initialClef: 'treble' | 'bass' | 'alto', m: VexMeasure, firstInSystem: boolean) {
  const notes: Tick[] = [];
  for (const n of lane.notes) {
    if (n.kind === 'clef') { notes.push(n.atStart && firstInSystem ? null : new ClefNote(n.clef ?? initialClef, 'small')); continue; }
    if (n.kind === 'ghost') { notes.push(new GhostNote({ duration: n.duration + (n.dots ? 'd' : '') })); continue; }
    const sn = new StaveNote({ keys: n.keys, duration: n.duration + (n.kind === 'rest' ? 'r' : ''), clef: n.clef ?? initialClef, ...(n.dots ? { dots: n.dots } : {}) });
    if (n.dots) Dot.buildAndAttach([sn], { all: true });
    n.accidentals.forEach((a, i) => { if (a) sn.addModifier(new Accidental(a), i); });
    sn.setStyle({ fillStyle: INK, strokeStyle: INK });
    notes.push(sn);
  }
  const voice = new Voice({ numBeats: m.num, beatValue: m.den }).setStrict(false).addTickables(notes.filter((x): x is NonNullable<Tick> => x !== null));
  const real = notes.filter((n): n is StaveNote => n instanceof StaveNote);
  let beams: Beam[] = [];
  try { beams = Beam.generateBeams(real); } catch { beams = []; }
  const tuplets: Tuplet[] = [];
  for (let i = 0; i < lane.notes.length;) {
    const t = lane.notes[i]!.tuplet;
    if (!t || lane.notes[i]!.kind === 'ghost') { i++; continue; }
    const grp: StaveNote[] = []; let j = i;
    while (j < lane.notes.length && grp.length < t.actual && lane.notes[j]!.tuplet?.actual === t.actual && lane.notes[j]!.tuplet?.normal === t.normal && notes[j] instanceof StaveNote) { grp.push(notes[j] as StaveNote); j++; }
    if (grp.length === t.actual) tuplets.push(new Tuplet(grp, { numNotes: t.actual, notesOccupied: t.normal }));
    i = Math.max(j, i + 1);
  }
  return { voice, notes, specs: lane.notes, beams, tuplets };
}

function drawTies(ctx: ReturnType<Renderer['getContext']>, notes: Tick[], specs: VexNoteSpec[], carryIn: boolean[] | undefined) {
  const idx = (flags: boolean[]) => flags.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  specs.forEach((s, i) => {
    const n = notes[i]; if (!(n instanceof StaveNote) || s.kind !== 'note') return;
    const fwd = idx(s.tieNext);
    if (fwd.length) {
      const nextIdx = specs.findIndex((x, k) => k > i && x.kind !== 'clef');
      const next = nextIdx >= 0 && specs[nextIdx]!.kind === 'note' ? notes[nextIdx] : undefined;
      new StaveTie({ firstNote: n, lastNote: next instanceof StaveNote ? next : null, firstIndexes: fwd, lastIndexes: fwd }).setContext(ctx).draw();
    }
    if (specs.findIndex((x) => x.kind === 'note') === i && carryIn?.some(Boolean) && s.tieFromPrev.some(Boolean)) {
      const bk = idx(s.tieFromPrev);
      new StaveTie({ firstNote: null, lastNote: n, firstIndexes: bk, lastIndexes: bk }).setContext(ctx).draw();
    }
  });
}

export interface VexScoreProps { song: Song; systemsPerPage?: number }

/** Partitura estática paginada (previsualización de importación). Los compases se reparten según la anchura disponible. */
export function VexScore({ song, systemsPerPage = 3 }: VexScoreProps) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const spec = useMemo(() => toVexSpec(song), [song]);
  const systems = useMemo(() => layoutSystems(spec, Math.max(320, width - 24)), [spec, width]);
  const pages = Math.max(1, Math.ceil(systems.length / systemsPerPage));
  useEffect(() => { setPage(0); }, [song]);
  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    setWidth(Math.round(el.clientWidth) || 900); ro.observe(el); return () => ro.disconnect();
  }, []);
  const safePage = Math.min(page, pages - 1);
  useEffect(() => {
    const el = host.current; if (!el) return;
    el.replaceChildren(); setError('');
    try {
      const shown = systems.slice(safePage * systemsPerPage, (safePage + 1) * systemsPerPage);
      const sysH = (spec.staves.length > 1 ? STAFF_GAP : 0) + SYSTEM_PAD + 70;
      const r = new Renderer(el, Renderer.Backends.SVG); r.resize(Math.max(320, width - 8), shown.length * sysH + 20);
      const ctx = r.getContext(); ctx.setFillStyle(INK); ctx.setStrokeStyle(INK);
      shown.forEach((s, i) => drawSystem(el, spec, s.measures, s.widths, 12 + i * sysH, ctx));
      el.querySelector('svg')?.setAttribute('role', 'img');
      el.querySelector('svg')?.setAttribute('aria-label', `Partitura, compases ${shown[0]!.measures[0]! + 1} a ${shown.at(-1)!.measures.at(-1)! + 1} de ${spec.measures.length}`);
    } catch (e) { setError(`No se pudo dibujar la partitura: ${(e as Error).message}`); }
  }, [spec, systems, safePage, systemsPerPage, width]);

  const first = systems[safePage * systemsPerPage]?.measures[0] ?? 0;
  const last = systems[Math.min(systems.length, (safePage + 1) * systemsPerPage) - 1]?.measures.at(-1) ?? 0;
  return (
    <div className="vexscore">
      <div className="paper" ref={host} />
      {error && <p className="notice bad" role="alert">{error}</p>}
      <div className="pager">
        <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>← Anterior</button>
        <span>Compases {first + 1}–{last + 1} de {spec.measures.length}</span>
        <button onClick={() => setPage(Math.min(pages - 1, safePage + 1))} disabled={safePage >= pages - 1}>Siguiente →</button>
      </div>
    </div>
  );
}
