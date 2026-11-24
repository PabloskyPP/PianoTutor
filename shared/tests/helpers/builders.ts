import { writeMidi } from 'midi-file';
import { zipSync, strToU8 } from 'fflate';

export type MEv = { dt: number; kind: 'on' | 'off' | 'on0'; note: number; ch?: number; vel?: number }
  | { dt: number; kind: 'tempo'; bpm: number } | { dt: number; kind: 'ts'; num: number; den: number } | { dt: number; kind: 'key'; fifths: number; minor?: boolean } | { dt: number; kind: 'cc'; cc: number };

/** Construye un MIDI formato 1 con las pistas dadas (eventos con deltaTime). */
export function buildMidi(tracks: MEv[][], ppq = 480, format: 0 | 1 | 2 = 1): Uint8Array {
  const conv = tracks.map((tr) => [...tr.map((e): any => {
    const base = { deltaTime: e.dt };
    switch (e.kind) {
      case 'on': return { ...base, type: 'noteOn', channel: e.ch ?? 0, noteNumber: e.note, velocity: e.vel ?? 90 };
      case 'off': return { ...base, type: 'noteOff', channel: e.ch ?? 0, noteNumber: e.note, velocity: 0 };
      case 'on0': return { ...base, type: 'noteOn', channel: e.ch ?? 0, noteNumber: e.note, velocity: 0 };
      case 'tempo': return { ...base, meta: true, type: 'setTempo', microsecondsPerBeat: Math.round(60_000_000 / e.bpm) };
      case 'ts': return { ...base, meta: true, type: 'timeSignature', numerator: e.num, denominator: e.den, metronome: 24, thirtyseconds: 8 };
      case 'key': return { ...base, meta: true, type: 'keySignature', key: e.fifths, scale: e.minor ? 1 : 0 };
      case 'cc': return { ...base, type: 'controller', channel: 0, controllerType: e.cc, value: 127 };
    }
  }), { deltaTime: 0, meta: true, type: 'endOfTrack' }]);
  return Uint8Array.from(writeMidi({ header: { format, numTracks: conv.length, ticksPerBeat: ppq }, tracks: conv } as any));
}
/** Secuencia de notas consecutivas [midi, duraciónEnTicks | null(silencio)] a partir de dt=0. */
export function seq(items: [number | null, number][], ch = 0): MEv[] {
  const out: MEv[] = []; let gap = 0;
  for (const [n, d] of items) { if (n === null) { gap += d; continue; } out.push({ dt: gap, kind: 'on', note: n, ch }, { dt: d, kind: 'off', note: n, ch }); gap = 0; }
  return out;
}

const hdr = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
export const note = (step: string, oct: number, dur: number, extra = '', alter?: number) =>
  `<note><pitch><step>${step}</step>${alter !== undefined ? `<alter>${alter}</alter>` : ''}<octave>${oct}</octave></pitch><duration>${dur}</duration>${extra}</note>`;
export const rest = (dur: number, extra = '') => `<note><rest/><duration>${dur}</duration>${extra}</note>`;
export const attrs = (inner: string) => `<attributes>${inner}</attributes>`;
export const measure = (n: number, body: string, att = '') => `<measure number="${n}"${att}>${body}</measure>`;
export const score = (parts: string, title = '', partList = '<score-part id="P1"><part-name>Piano</part-name></score-part>') =>
  `${hdr}<score-partwise version="3.1">${title ? `<work><work-title>${title}</work-title></work>` : ''}<part-list>${partList}</part-list>${parts}</score-partwise>`;
export const part = (id: string, measures: string) => `<part id="${id}">${measures}</part>`;
export const mxl = (xml: string) => zipSync({
  'META-INF/container.xml': strToU8('<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'),
  'score.xml': strToU8(xml),
});
export const enc = (s: string) => new TextEncoder().encode(s);
