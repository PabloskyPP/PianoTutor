import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { importFile, parseMusicXml, draftToSong, checkHands, songStats, toPerformance, validateSong, ImportError, PPQ } from '@pianotutor/shared';
import { note, rest, attrs, measure, score, part, mxl, enc } from '../helpers/builders';

const A4 = attrs('<divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>');
const meta = (hands: 1 | 2 = 1) => ({ id: 'imported-test-0001', title: 'T', genre: 'G', hands, difficulty: 3, now: '2026-11-18T00:00:00.000Z', fileName: 'x.musicxml', storedAs: 'imports/x' });
const song = (xml: string, hands: 1 | 2 = 1) => draftToSong(parseMusicXml(xml), meta(hands));
const codes = (xml: string) => parseMusicXml(xml).report.map((r) => r.code);

const MONO = score(part('P1', measure(1, A4 + '<direction><sound tempo="100"/></direction>' + note('C', 4, 1) + note('D', 4, 1) + note('E', 4, 1) + note('F', 4, 1))
  + measure(2, note('G', 4, 2) + note('A', 4, 1) + rest(1))), 'Mi canción');

describe('MusicXML monofónico', () => {
  const s = song(MONO);
  it('alturas, duraciones y silencios exactos', () => {
    const ev = s.parts[0]!.staves[0]!.events;
    expect(ev.map((e) => e.type === 'rest' ? 'r' : e.pitches[0]!.pitch.midi)).toEqual([60, 62, 64, 65, 67, 69, 'r']);
    expect(ev.map((e) => e.durationTicks)).toEqual([PPQ, PPQ, PPQ, PPQ, 2 * PPQ, PPQ, PPQ]);
    expect(ev.map((e) => e.tick)).toEqual([0, 960, 1920, 2880, 3840, 5760, 6720]);
  });
  it('metadatos: título, tempo, compás, armadura, compases', () => {
    const d = parseMusicXml(MONO);
    expect(d.suggestedTitle).toBe('Mi canción'); expect(d.tempoMap).toEqual([{ tick: 0, bpm: 100 }]);
    expect(d.timeSignatures).toEqual([{ tick: 0, num: 4, den: 4 }]); expect(d.keySignatures[0]).toMatchObject({ tick: 0, fifths: 0 });
    expect(d.measures).toHaveLength(2); expect(d.suggestedHands).toBe(1);
  });
  it('la canción resultante valida con el esquema y las estadísticas cuadran', () => {
    expect(validateSong(s).ok).toBe(true);
    expect(songStats(s)).toMatchObject({ measures: 2, notes: 6, staves: 1, lowMidi: 60, highMidi: 69, bpm: 100, timeSignature: '4/4', hasChords: false });
  });
  it('acepta DOCTYPE estándar y BOM', () => { expect(() => parseMusicXml('\uFEFF' + MONO)).not.toThrow(); });
  it('el metrónomo se convierte a negras por minuto (corchea=120 → 60 BPM)', () => {
    const x = score(part('P1', measure(1, A4 + '<direction><direction-type><metronome><beat-unit>eighth</beat-unit><per-minute>120</per-minute></metronome></direction-type></direction>' + note('C', 4, 4))));
    expect(parseMusicXml(x).tempoMap[0]!.bpm).toBe(60);
  });
  it('sin tempo/armadura/compás: valores por defecto y avisos informativos', () => {
    const d = parseMusicXml(score(part('P1', measure(1, '<attributes><divisions>1</divisions></attributes>' + note('C', 4, 4)))));
    expect(d.tempoMap).toEqual([{ tick: 0, bpm: 120 }]); expect(d.report.map((r) => r.code)).toEqual(expect.arrayContaining(['no-tempo', 'no-key', 'no-time']));
  });
});

describe('MusicXML: dos pentagramas, acordes, ligaduras, anacrusa, tresillos', () => {
  const TWO = score(part('P1', measure(1,
    attrs('<divisions>1</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time><clef number="1"><sign>G</sign></clef><clef number="2"><sign>F</sign><line>4</line></clef>')
    + note('C', 5, 4, '<voice>1</voice><staff>1</staff>') + '<backup><duration>4</duration></backup>'
    + note('C', 3, 2, '<voice>2</voice><staff>2</staff>') + note('G', 3, 2, '<voice>2</voice><staff>2</staff>'))));
  it('claves, manos, sincronía temporal', () => {
    const s = song(TWO, 2); const st = s.parts[0]!.staves;
    expect(st.map((x) => [x.index, x.clef, x.hand])).toEqual([[0, 'G', 'right'], [1, 'F', 'left']]);
    expect(st[1]!.events.map((e) => [e.tick, e.voice])).toEqual([[0, 2], [1920, 2]]);
    const perf = toPerformance(s); expect(perf[0]!.midis).toEqual([48, 72]);
  });
  it('desajuste de manos se detecta', () => { const d = parseMusicXml(TWO); expect(checkHands(d, 1)).toMatch(/2 pentagramas/); expect(checkHands(d, 2)).toBeNull(); expect(() => draftToSong(d, meta(1))).toThrow(ImportError); });

  const CH_E4 = '<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>';
  const TIES = score(part('P1', measure(1, A4 + note('C', 4, 2, '<tie type="start"/>') + CH_E4 + note('C', 4, 2, '<tie type="stop"/><tie type="start"/>'))
    + measure(2, note('C', 4, 4, '<tie type="stop"/>'))));
  it('acorde (nota + nota con <chord/>): un solo evento con las dos alturas', () => {
    const ev = song(TIES).parts[0]!.staves[0]!.events;
    expect(ev[0]!.type).toBe('chord'); expect(ev[0]!.pitches.map((p) => p.pitch.midi)).toEqual([60, 64]);
    expect(ev[0]!.pitches[0]!.tieNext).toBe(true); expect(ev[0]!.pitches[1]!.tieNext).toBeUndefined();
  });
  it('ligaduras en cadena (acorde → nota → siguiente compás) se fusionan en la proyección', () => {
    const perf = toPerformance(song(TIES)).flatMap((e) => e.notes);
    const c4 = perf.find((n) => n.pitch.midi === 60)!, e4 = perf.find((n) => n.pitch.midi === 64)!;
    expect([c4.tickStart, c4.tickEnd]).toEqual([0, 2 * 3840]); expect([e4.tickStart, e4.tickEnd]).toEqual([0, 2 * PPQ]);
    expect(perf).toHaveLength(2);
  });
  it('ligadura entre compases: duración total fusionada', () => {
    const x = score(part('P1', measure(1, A4 + note('C', 4, 4, '<tie type="start"/>')) + measure(2, note('C', 4, 4, '<tie type="stop"/>'))));
    const perf = toPerformance(song(x)); expect(perf).toHaveLength(1); expect(perf[0]!.tickEnd - perf[0]!.tickStart).toBe(2 * 3840);
  });
  it('ligadura rota (destino con otra altura) se quita con aviso, sin invalidar la canción', () => {
    const x = score(part('P1', measure(1, A4 + note('C', 4, 4, '<tie type="start"/>')) + measure(2, note('D', 4, 4))));
    const d = parseMusicXml(x); expect(d.report.map((r) => r.code)).toContain('tie-broken'); expect(() => draftToSong(d, meta())).not.toThrow();
  });
  it('anacrusa (compás implícito) conserva su longitud real', () => {
    const x = score(part('P1', measure(0, A4 + note('G', 4, 1), ' implicit="yes"') + measure(1, note('C', 5, 4))));
    const d = parseMusicXml(x); expect(d.measures[0]).toMatchObject({ lengthTicks: PPQ, incomplete: true }); expect(d.measures[1]!.startTick).toBe(PPQ);
  });
  it('tresillo de corcheas (time-modification 3:2) → 320 ticks con marca de tresillo', () => {
    const tm = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
    const x = score(part('P1', measure(1, '<attributes><divisions>6</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>'
      + note('C', 4, 2, tm) + note('D', 4, 2, tm) + note('E', 4, 2, tm) + note('F', 4, 18))));
    const ev = song(x).parts[0]!.staves[0]!.events; expect(ev.slice(0, 3).map((e) => e.durationTicks)).toEqual([320, 320, 320]); expect(ev[0]!.tuplet).toEqual({ actual: 3, normal: 2 });
  });
  it('alteraciones y bemoles', () => {
    const x = score(part('P1', measure(1, A4 + note('F', 4, 1, '', 1) + note('B', 4, 1, '', -1) + note('C', 4, 2))));
    expect(song(x).parts[0]!.staves[0]!.events.slice(0, 2).map((e) => e.pitches[0]!.pitch.midi)).toEqual([66, 70]);
  });
  it('cambio de compás a mitad de pieza', () => {
    const x = score(part('P1', measure(1, A4 + note('C', 4, 4)) + measure(2, attrs('<time><beats>3</beats><beat-type>4</beat-type></time>') + note('D', 4, 3))));
    const d = parseMusicXml(x); expect(d.timeSignatures).toEqual([{ tick: 0, num: 4, den: 4 }, { tick: 3840, num: 3, den: 4 }]); expect(d.measures[1]!.lengthTicks).toBe(2880);
  });
});

describe('MusicXML: lo no soportado se informa, no se oculta', () => {
  const X = score(part('P1', measure(1, A4 + '<note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>'
    + note('C', 4, 2, '<notations><slur type="start"/><ornaments><trill-mark/></ornaments></notations><lyric><text>la</text></lyric>')
    + note('E', 4, 2, '<notations><articulations><staccato/></articulations></notations>')
    + '<barline location="right"><repeat direction="backward"/></barline>')));
  it('adornos, ligaduras de expresión, ornamentos, articulaciones, letra y repeticiones aparecen en el informe', () => {
    const c = codes(X); for (const k of ['grace', 'nota-slur', 'nota-ornaments', 'nota-articulations', 'lyric', 'repeats']) expect(c).toContain(k);
  });
  it('la nota de adorno no se cuela como nota real', () => { expect(song(X).parts[0]!.staves[0]!.events).toHaveLength(2); });
  it('avisos repetidos se agrupan con recuento', () => {
    const g = '<note><grace/><pitch><step>D</step><octave>4</octave></pitch></note>';
    const r = parseMusicXml(score(part('P1', measure(1, A4 + g + g + g + note('C', 4, 4))))).report.find((x) => x.code === 'grace')!; expect(r.message).toMatch(/3 veces/);
  });
  it('transposición y claves distintas se avisan', () => {
    expect(codes(score(part('P1', measure(1, A4 + '<attributes><transpose><chromatic>-2</chromatic></transpose></attributes>' + note('C', 4, 4)))))).toContain('transpose');
  });
  it('más de 2 pentagramas se rechaza con explicación', () => {
    const p = (id: string) => part(id, measure(1, A4 + note('C', 4, 4)));
    expect(() => parseMusicXml(score(p('P1') + p('P2') + p('P3'), '', '<score-part id="P1"/><score-part id="P2"/><score-part id="P3"/>'))).toThrow(/3 pentagramas/);
  });
});

describe('MusicXML y .mxl: archivos inválidos y formatos', () => {
  const bad = (x: string, re: RegExp) => expect(() => parseMusicXml(x)).toThrow(re);
  it('XML mal formado, no-MusicXML, timewise, vacío, sin notas', () => {
    bad('<score-partwise><part></score-partwise>', /XML válido/); bad('<html><body/></html>', /no parece MusicXML/); bad('hola', /XML válido|no parece/);
    bad('<score-timewise version="3.1"/>', /timewise/); bad(score(part('P1', measure(1, A4 + rest(4)))), /no contiene notas/);
    bad('<score-partwise><part-list/></score-partwise>', /ninguna parte/);
  });
  it('entidades internas (billion laughs / XXE) se rechazan', () => {
    bad('<?xml version="1.0"?><!DOCTYPE score-partwise [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><score-partwise><part-list/></score-partwise>', /entidades/);
    bad('<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><score-partwise/>', /entidades/);
  });
  it('.mxl produce el mismo resultado que el XML plano', () => {
    const a = importFile('a.musicxml', enc(MONO)), b = importFile('a.mxl', mxl(MONO));
    expect(b.kind).toBe('mxl'); expect({ ...b, kind: 'x' }).toEqual({ ...a, kind: 'x' });
  });
  it('.mxl dañado, sin partitura, o zip bomb', () => {
    expect(() => importFile('a.mxl', Uint8Array.from([0x50, 0x4b, 1, 2, 3, 4]))).toThrow(/zip/);
    expect(() => importFile('a.mxl', zipSync({ 'otra.txt': strToU8('x') }))).toThrow(/ninguna partitura/);
    expect(() => importFile('a.mxl', zipSync({ 'score.xml': new Uint8Array(60 * 1024 * 1024) }))).toThrow(/demasiado grande/);
  });
  it('extensión que no coincide con el contenido / formato desconocido / vacío', () => {
    expect(() => importFile('a.musicxml', zipSync({ 'a.xml': strToU8('x') }))).toThrow(/no coincide/);
    expect(() => importFile('a.mid', enc(MONO))).toThrow(/MIDI válido/); expect(() => importFile('a.pdf', enc('x'))).toThrow(/no soportado/);
    expect(() => importFile('a.musicxml', new Uint8Array(0))).toThrow(/vacío/);
  });
});
