/**
 * Importador MusicXML (score-partwise). Soporta: alturas con alteración, duraciones, silencios, compases (incl. anacrusa),
 * tempo, compás, armadura, acordes, voces, pentagramas, ligaduras de prolongación, tresillos y similares (time-modification).
 * Todo lo demás se registra en el informe (no se descarta en silencio). Ver docs/IMPORT.md.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { PPQ, type MusicEvent, type Song } from '../model/schema';
import { makePitch, type Alter, type Pitch, type Step } from '../model/pitch';
import { ImportError, Report, type ImportDraft } from './types';

type N = Record<string, any>;
const tagOf = (n: N): string => Object.keys(n).find((k) => k !== ':@') ?? '';
const kids = (n: N | undefined): N[] => (n ? ((n[tagOf(n)] as N[] | undefined) ?? []) : []);
const attr = (n: N | undefined, name: string): string | undefined => n?.[':@']?.['@_' + name];
const kid = (n: N | undefined, tag: string): N | undefined => kids(n).find((k) => tagOf(k) === tag);
const kidsOf = (n: N | undefined, tag: string): N[] => kids(n).filter((k) => tagOf(k) === tag);
const text = (n: N | undefined): string => kids(n).map((k) => k['#text']).filter((x) => x !== undefined).join('').trim();
const int = (s: string | undefined, d = NaN) => { const v = parseInt(s ?? '', 10); return Number.isFinite(v) ? v : d; };

interface RawNote { pitch: Pitch; tieNext: boolean; tiePrev: boolean }
interface RawEv { staff: number; voice: number; rel: number; ticks: number; rest: boolean; notes: RawNote[]; tuplet?: { actual: number; normal: number }; dots: number }
interface RawMeasure { implicit: boolean; contentEnd: number; events: RawEv[] }
interface PartRaw {
  id: string; name: string; measures: RawMeasure[]; staffCount: number; clefs: Map<number, string>;
  times: { m: number; num: number; den: number }[]; keys: { m: number; rel: number; fifths: number; mode?: 'major' | 'minor' }[];
  tempos: { m: number; rel: number; bpm: number }[];
}

const UNIT_QUARTERS: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125 };
const NOTATION_NAMES: Record<string, string> = {
  slur: 'ligaduras de expresión', articulations: 'articulaciones', ornaments: 'ornamentos', fermata: 'fermatas', arpeggiate: 'arpegios',
  technical: 'indicaciones técnicas (digitación, etc.)', dynamics: 'dinámicas', 'non-arpeggiate': 'signos de no arpegio', glissando: 'glissandos', slide: 'deslizamientos',
};

export function parseMusicXml(input: string): ImportDraft {
  const report = new Report();
  let xml = input.replace(/^\uFEFF/, '');
  if (/<!ENTITY/i.test(xml) || /<!DOCTYPE[^>]*\[/i.test(xml)) throw new ImportError('El archivo declara entidades XML internas, que no se aceptan por seguridad.');
  xml = xml.replace(/<!DOCTYPE[^>]*>/i, '');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new ImportError(`El archivo no es un XML válido (línea ${valid.err.line}): ${valid.err.msg}`);
  let tree: N[];
  try {
    tree = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, parseAttributeValue: false, trimValues: true, ignoreDeclaration: true }).parse(xml) as N[];
  } catch { throw new ImportError('No se pudo leer el archivo XML.'); }
  const root = tree.find((n) => ['score-partwise', 'score-timewise'].includes(tagOf(n)));
  if (!root) throw new ImportError('El archivo no parece MusicXML (no contiene «score-partwise»).');
  if (tagOf(root) === 'score-timewise') throw new ImportError('El archivo usa el formato «score-timewise», que no está soportado. Expórtalo como «partwise» desde tu editor de partituras.');

  const title = text(kid(kid(root, 'work'), 'work-title')) || text(kid(root, 'movement-title'));
  const names = new Map<string, string>();
  for (const sp of kidsOf(kid(root, 'part-list'), 'score-part')) names.set(attr(sp, 'id') ?? '', text(kid(sp, 'part-name')));

  const partNodes = kidsOf(root, 'part');
  if (!partNodes.length) throw new ImportError('El archivo no contiene ninguna parte musical.');
  const parts = partNodes.map((p, i) => parsePart(p, attr(p, 'id') ?? `P${i + 1}`, names.get(attr(p, 'id') ?? '') ?? '', report));
  return assemble(parts, title, report);
}

function parsePart(node: N, id: string, name: string, report: Report): PartRaw {
  const part: PartRaw = { id, name, measures: [], staffCount: 1, clefs: new Map(), times: [], keys: [], tempos: [] };
  let divisions = NaN, nominal = 4 * PPQ;
  const toTicks = (d: number): number => {
    if (!Number.isFinite(divisions)) { divisions = 1; report.add('warning', 'no-divisions', 'El archivo no declara «divisions» antes de las notas; se asume 1.'); }
    const t = (d * PPQ) / divisions;
    if (!Number.isInteger(t)) { report.count('warning', 'rounded', 'Algunas duraciones no son exactas en el modelo interno y se redondearon'); return Math.round(t); }
    return t;
  };
  let clefWarned = false, repeatWarned = false;
  kidsOf(node, 'measure').forEach((m, mi) => {
    const rm: RawMeasure = { implicit: attr(m, 'implicit') === 'yes', contentEnd: 0, events: [] };
    let cursor = 0, lastStart = 0, maxCursor = 0, last: RawEv | undefined;
    for (const c of kids(m)) {
      const t = tagOf(c);
      if (t === 'attributes') {
        for (const a of kids(c)) {
          const at = tagOf(a);
          if (at === 'divisions') divisions = int(text(a), divisions);
          else if (at === 'staves') part.staffCount = Math.max(1, int(text(a), 1));
          else if (at === 'key') {
            const f = int(text(kid(a, 'fifths')), 0); const mode = text(kid(a, 'mode'));
            part.keys.push({ m: mi, rel: cursor, fifths: Math.max(-7, Math.min(7, f)), ...(mode === 'minor' ? { mode: 'minor' as const } : mode === 'major' ? { mode: 'major' as const } : {}) });
          } else if (at === 'time') {
            if (kid(a, 'senza-misura')) report.add('warning', 'senza-misura', 'El compás «senza misura» no está soportado; se usa 4/4.');
            else { const num = int(text(kid(a, 'beats'))), den = int(text(kid(a, 'beat-type'))); if (num > 0 && den > 0) { part.times.push({ m: mi, num, den }); nominal = (num * 4 * PPQ) / den; } else report.add('warning', 'bad-time', 'Compás no interpretable en el archivo; se ignora.'); }
          } else if (at === 'clef') {
            const n = int(attr(a, 'number'), 1), sign = text(kid(a, 'sign'));
            const prev = part.clefs.get(n);
            if (prev === undefined) part.clefs.set(n, sign);
            else if (prev !== sign && !clefWarned) { clefWarned = true; report.add('warning', 'clef-change', 'Hay cambios de clave a mitad de pieza; solo se conserva la clave inicial de cada pentagrama (las alturas son correctas).'); }
          } else if (at === 'transpose') report.add('warning', 'transpose', 'El archivo indica transposición; las alturas se importan tal como están escritas (sin transponer).');
          else if (at === 'measure-style') report.count('info', 'measure-style', 'Se ignoraron indicaciones de estilo de compás (compases de espera, ritmo con barras)');
        }
      } else if (t === 'note') {
        const kn = kids(c); const has = (x: string) => kn.some((k) => tagOf(k) === x);
        if (has('grace')) { report.count('warning', 'grace', 'Se omitieron notas de adorno (apoyaturas/acciaccaturas)'); continue; }
        if (has('cue')) { report.count('warning', 'cue', 'Se omitieron notas de guía («cue»)'); continue; }
        const isChord = has('chord'), isRest = has('rest');
        const staff = int(text(kid(c, 'staff')), 1), voice = int(text(kid(c, 'voice')), 1);
        const dText = text(kid(c, 'duration'));
        const ticks = dText ? toTicks(int(dText, 0)) : (isRest && attr(kid(c, 'rest'), 'measure') === 'yes' ? nominal : 0);
        if (ticks <= 0) { report.count('warning', 'zero-duration', 'Se omitieron notas sin duración'); continue; }
        const start = isChord && last ? lastStart : cursor;
        if (!(isChord && last)) { lastStart = cursor; cursor += ticks; maxCursor = Math.max(maxCursor, cursor); }
        const tm = kid(c, 'time-modification');
        const tuplet = tm ? { actual: int(text(kid(tm, 'actual-notes')), 0), normal: int(text(kid(tm, 'normal-notes')), 0) } : undefined;
        const dots = Math.min(2, kidsOf(c, 'dot').length);
        for (const nn of kids(kid(c, 'notations'))) {
          const nt = tagOf(nn);
          if (NOTATION_NAMES[nt]) report.count('warning', `nota-${nt}`, `Se ignoraron ${NOTATION_NAMES[nt]}`);
        }
        if (has('lyric')) report.count('info', 'lyric', 'Se ignoró la letra de la canción');
        if (has('unpitched')) { report.count('warning', 'unpitched', 'Se omitieron notas de percusión sin altura'); continue; }
        if (isRest) { if (!(isChord && last)) { last = { staff, voice, rel: start, ticks, rest: true, notes: [], dots, ...(tuplet ? { tuplet } : {}) }; rm.events.push(last); } continue; }
        const px = kid(c, 'pitch'); if (!px) continue;
        const step = text(kid(px, 'step')) as Step; const oct = int(text(kid(px, 'octave')));
        if (!'CDEFGAB'.includes(step) || step.length !== 1 || !Number.isFinite(oct)) { report.count('warning', 'bad-pitch', 'Se omitieron notas con altura no válida'); continue; }
        const rawAlter = parseFloat(text(kid(px, 'alter')) || '0');
        let alter = Math.round(rawAlter);
        if (!Number.isInteger(rawAlter)) report.count('warning', 'microtone', 'Se redondearon alteraciones microtonales al semitono más cercano');
        alter = Math.max(-2, Math.min(2, alter));
        const ties = kidsOf(c, 'tie').map((t2) => attr(t2, 'type'));
        const tied = kidsOf(kid(c, 'notations'), 'tied').map((t2) => attr(t2, 'type'));
        const src = ties.length ? ties : tied;
        const note: RawNote = { pitch: makePitch(step, alter as Alter, oct), tieNext: src.includes('start'), tiePrev: src.includes('stop') };
        if (isChord && last && !last.rest) { if (!last.notes.some((x) => x.pitch.midi === note.pitch.midi)) last.notes.push(note); if (last.ticks !== ticks) report.count('warning', 'chord-dur', 'Notas de un acorde con duraciones distintas: se usó la de la primera'); }
        else { last = { staff, voice, rel: start, ticks, rest: false, notes: [note], dots, ...(tuplet?.actual && tuplet.normal ? { tuplet } : {}) }; rm.events.push(last); }
      } else if (t === 'backup' || t === 'forward') {
        const d = toTicks(int(text(kid(c, 'duration')), 0));
        cursor += t === 'backup' ? -d : d;
        if (cursor < 0) { cursor = 0; report.count('warning', 'neg-cursor', 'Un «backup» retrocedía antes del inicio del compás; se corrigió'); }
        maxCursor = Math.max(maxCursor, cursor); last = undefined;
      } else if (t === 'direction' || t === 'sound') {
        const snd = t === 'sound' ? c : kid(c, 'sound');
        const tempo = parseFloat(attr(snd, 'tempo') ?? '');
        if (Number.isFinite(tempo) && tempo > 0) part.tempos.push({ m: mi, rel: cursor, bpm: tempo });
        else if (t === 'direction') {
          const dts = kidsOf(c, 'direction-type');
          const met = dts.map((d) => kid(d, 'metronome')).find(Boolean);
          if (dts.some((d) => kid(d, 'dynamics') || kid(d, 'wedge') || kid(d, 'pedal'))) report.count('info', 'dir-expr', 'Se ignoraron dinámicas, reguladores y pedal');
          if (met) {
            const unit = UNIT_QUARTERS[text(kid(met, 'beat-unit'))], pm = parseFloat(text(kid(met, 'per-minute')));
            if (unit && Number.isFinite(pm) && pm > 0) part.tempos.push({ m: mi, rel: cursor, bpm: pm * unit * (kid(met, 'beat-unit-dot') ? 1.5 : 1) });
          }
        }
      } else if (t === 'barline') {
        if ((kid(c, 'repeat') || kid(c, 'ending')) && !repeatWarned) { repeatWarned = true; report.add('warning', 'repeats', 'El archivo tiene repeticiones o finales de 1.ª/2.ª vez; se importan SIN expandir (cada compás aparece una sola vez).'); }
      }
    }
    rm.contentEnd = Math.max(maxCursor, ...rm.events.map((e) => e.rel + e.ticks), 0);
    part.measures.push(rm);
  });
  return part;
}

function assemble(parts: PartRaw[], title: string, report: Report): ImportDraft {
  const staffTotal = parts.reduce((n, p) => n + Math.max(p.staffCount, ...p.measures.flatMap((m) => m.events.map((e) => e.staff))), 0);
  if (staffTotal > 2) throw new ImportError(`El archivo tiene ${staffTotal} pentagramas; Piano Tutor admite 1 o 2 (una o dos manos). Elimina las demás partes en tu editor de partituras y vuelve a exportar.`);
  const count = Math.max(...parts.map((p) => p.measures.length));
  if (!count) throw new ImportError('El archivo no contiene compases.');

  // Compases globales: compás nominal según la métrica vigente.
  const timeChanges = parts.flatMap((p) => p.times).sort((a, b) => a.m - b.m);
  if (!timeChanges.length) report.add('info', 'no-time', 'El archivo no indica compás; se asume 4/4.');
  const measures: Song['measures'] = []; const timeSignatures: Song['timeSignatures'] = [];
  let start = 0, num = 4, den = 4;
  for (let i = 0; i < count; i++) {
    const tc = timeChanges.filter((t) => t.m === i).pop();
    if (tc && (tc.num !== num || tc.den !== den || i === 0)) { num = tc.num; den = tc.den; timeSignatures.push({ tick: start, num, den }); }
    else if (i === 0) timeSignatures.push({ tick: 0, num, den });
    const nominal = (num * 4 * PPQ) / den;
    const content = Math.max(0, ...parts.map((p) => p.measures[i]?.contentEnd ?? 0));
    const implicit = parts.some((p) => p.measures[i]?.implicit);
    if (content > nominal && !implicit) report.count('warning', 'overfull', 'Hay compases con más contenido del que cabe en el compás; se ampliaron');
    const length = implicit || content > nominal ? Math.max(content, 1) : nominal;
    measures.push({ index: i, startTick: start, lengthTicks: length, ...(content > 0 && content < nominal ? { incomplete: true } : {}) });
    start += length;
  }
  const keySignatures: Song['keySignatures'] = parts.flatMap((p) => p.keys).sort((a, b) => a.m - b.m || a.rel - b.rel)
    .map((k) => ({ tick: measures[k.m]!.startTick + k.rel, fifths: k.fifths, ...(k.mode ? { mode: k.mode } : {}) }));
  if (!keySignatures.length || keySignatures[0]!.tick !== 0) { keySignatures.unshift({ tick: 0, fifths: 0, mode: 'major' }); report.add('info', 'no-key', 'El archivo no indica armadura inicial; se asume Do mayor.'); }
  const tempoRaw = parts.flatMap((p) => p.tempos).sort((a, b) => a.m - b.m || a.rel - b.rel).map((t) => ({ tick: measures[t.m]!.startTick + t.rel, bpm: Math.min(400, t.bpm) }));
  const tempoMap: Song['tempoMap'] = [];
  for (const t of tempoRaw) { const l = tempoMap[tempoMap.length - 1]; if (l && l.tick === t.tick) l.bpm = t.bpm; else if (!l || l.bpm !== t.bpm) tempoMap.push({ ...t }); }
  if (!tempoMap.length) { tempoMap.push({ tick: 0, bpm: 120 }); report.add('info', 'no-tempo', 'El archivo no indica tempo; se asumen 120 BPM.'); }
  else if (tempoMap[0]!.tick !== 0) { tempoMap.unshift({ tick: 0, bpm: tempoMap[0]!.bpm }); }

  // Pentagramas y eventos.
  const outParts: Song['parts'] = []; let evId = 0; let staffIndex = 0;
  for (const p of parts) {
    const nStaves = Math.max(p.staffCount, ...p.measures.flatMap((m) => m.events.map((e) => e.staff)));
    const staves: Song['parts'][number]['staves'] = [];
    for (let s = 1; s <= nStaves; s++) {
      const all: MusicEvent[] = [];
      p.measures.forEach((m, mi) => m.events.filter((e) => e.staff === s).forEach((e) => all.push({
        id: `e${evId++}`, type: e.rest ? 'rest' : e.notes.length > 1 ? 'chord' : 'note',
        pitches: e.notes.map((n) => ({ pitch: n.pitch, ...(n.tieNext ? { tieNext: true } : {}), ...(n.tiePrev ? { tiePrev: true } : {}) })),
        tick: measures[mi]!.startTick + e.rel, durationTicks: e.ticks, voice: e.voice, measure: mi,
        ...(e.dots ? { dots: e.dots as 1 | 2 } : {}), ...(e.tuplet?.actual && e.tuplet.normal ? { tuplet: e.tuplet } : {}),
      })));
      all.sort((a, b) => a.tick - b.tick || a.voice - b.voice);
      fixOverlaps(all, report); fixTies(all, report);
      const sign = p.clefs.get(s);
      const clef = sign === 'G' || sign === 'F' || sign === 'C' ? sign : (sign ? (report.add('warning', 'clef-unknown', `Clave «${sign}» no soportada; se usa clave de Sol.`), 'G') : (nStaves === 2 && s === 2 ? 'F' : 'G'));
      staves.push({ index: staffIndex++, clef, events: all });
    }
    outParts.push({ id: p.id, name: p.name || 'Piano', staves });
  }
  const allStaves = outParts.flatMap((p) => p.staves);
  if (!allStaves.some((s) => s.events.some((e) => e.type !== 'rest'))) throw new ImportError('El archivo no contiene notas.');
  if (allStaves.length === 1) allStaves[0]!.hand = 'right';
  else { allStaves[0]!.hand = 'right'; allStaves[1]!.hand = 'left'; report.add('info', 'hands', 'Manos asignadas por el orden de los pentagramas: superior = derecha, inferior = izquierda.'); }
  return {
    kind: 'musicxml', suggestedTitle: title, suggestedHands: allStaves.length === 2 ? 2 : 1,
    tempoMap, timeSignatures, keySignatures, measures, parts: outParts, report: report.list, options: {},
  };
}

/** Si dos eventos de una misma voz se solapan (XML mal formado), el segundo pasa a otra voz y se avisa. */
function fixOverlaps(events: MusicEvent[], report: Report) {
  const ends = new Map<number, number>();
  for (const e of events) {
    let v = e.voice;
    while ((ends.get(v) ?? 0) > e.tick) v++;
    if (v !== e.voice) { report.count('warning', 'overlap', 'Eventos solapados en la misma voz: se movieron a otra voz'); e.voice = v; }
    ends.set(v, e.tick + e.durationTicks);
  }
}

/** Una ligadura solo es válida si la nota siguiente (misma voz, justo al terminar) repite la altura. Las rotas se quitan con aviso. */
function fixTies(events: MusicEvent[], report: Report) {
  const at = new Map<string, MusicEvent>();
  for (const e of events) at.set(`${e.voice}|${e.tick}`, e);
  for (const e of events) for (const cn of e.pitches) if (cn.tieNext) {
    const next = at.get(`${e.voice}|${e.tick + e.durationTicks}`);
    const target = next?.pitches.find((p) => p.pitch.midi === cn.pitch.midi);
    if (target) target.tiePrev = true;
    else { delete cn.tieNext; report.count('warning', 'tie-broken', 'Se quitaron ligaduras sin nota de destino'); }
  }
  const ends = new Map<string, MusicEvent>();
  for (const e of events) ends.set(`${e.voice}|${e.tick + e.durationTicks}`, e);
  for (const e of events) for (const cn of e.pitches) if (cn.tiePrev) {
    const prev = ends.get(`${e.voice}|${e.tick}`);
    if (!prev?.pitches.some((p) => p.pitch.midi === cn.pitch.midi && p.tieNext)) { delete cn.tiePrev; report.count('warning', 'tie-broken', 'Se quitaron ligaduras sin nota de destino'); }
  }
}
