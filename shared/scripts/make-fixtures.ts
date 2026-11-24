/** Genera los ficheros de ejemplo de tests/fixtures (SINTÉTICOS: sirven para probar la importación, no son partituras reales). Uso: npx tsx scripts/make-fixtures.ts */
import { writeFileSync } from 'node:fs';
import { buildMidi, seq, note, rest, attrs, measure, score, part, mxl, enc } from '../tests/helpers/builders';

const dir = new URL('../tests/fixtures/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = (name: string, data: string | Uint8Array) => { writeFileSync(dir + name, data); console.log('escrito', name); };
const A = (extra = '') => attrs(`<divisions>2</divisions>${extra}<time><beats>4</beats><beat-type>4</beat-type></time>`);
const ch = (step: string, oct: number, dur: number, alter?: number) => `<note><chord/><pitch><step>${step}</step>${alter !== undefined ? `<alter>${alter}</alter>` : ''}<octave>${oct}</octave></pitch><duration>${dur}</duration></note>`;

// 1) MusicXML monofónico con silencios (escala de Do mayor + frase)
out('escala-do-mayor.musicxml', score(part('P1',
  measure(1, A('<key><fifths>0</fifths></key><clef><sign>G</sign><line>2</line></clef>') + '<direction><sound tempo="96"/></direction>' + ['C', 'D', 'E', 'F'].map((s) => note(s, 4, 2)).join(''))
  + measure(2, ['G', 'A', 'B'].map((s) => note(s, 4, 2)).join('') + note('C', 5, 2))
  + measure(3, note('C', 5, 4) + rest(2) + note('G', 4, 2))
  + measure(4, note('C', 4, 8))), 'Escala de Do mayor (ejemplo sintético)'));

// 2) MusicXML a dos manos con acordes, ligadura entre compases, alteraciones y silencios
const rh = [
  measure(1, A('<staves>2</staves><clef number="1"><sign>G</sign></clef><clef number="2"><sign>F</sign><line>4</line></clef>') + '<direction><sound tempo="80"/></direction>'
    + note('C', 5, 4, '<voice>1</voice><staff>1</staff>') + ch('E', 5, 4) + ch('G', 5, 4).replace('</note>', '<staff>1</staff></note>')
    + note('D', 5, 2, '<voice>1</voice><staff>1</staff>') + rest(2, '<voice>1</voice><staff>1</staff>')
    + '<backup><duration>8</duration></backup>' + note('C', 3, 2, '<voice>2</voice><staff>2</staff>') + note('G', 3, 2, '<voice>2</voice><staff>2</staff>') + note('C', 4, 4, '<voice>2</voice><staff>2</staff>')),
  measure(2, note('F', 4, 2, '<voice>1</voice><staff>1</staff>', 1) + note('G', 4, 2, '<voice>1</voice><staff>1</staff>') + note('A', 4, 4, '<voice>1</voice><staff>1</staff><tie type="start"/>')
    + '<backup><duration>8</duration></backup>' + note('D', 3, 4, '<voice>2</voice><staff>2</staff>') + note('G', 2, 4, '<voice>2</voice><staff>2</staff>')),
  measure(3, note('A', 4, 4, '<voice>1</voice><staff>1</staff><tie type="stop"/>') + note('C', 5, 4, '<voice>1</voice><staff>1</staff>')
    + '<backup><duration>8</duration></backup>' + note('C', 3, 8, '<voice>2</voice><staff>2</staff>')),
].join('');
out('estudio-dos-manos.musicxml', score(part('P1', rh), 'Estudio a dos manos (ejemplo sintético)'));
out('escala-do-mayor.mxl', mxl(score(part('P1', measure(1, A() + ['C', 'D', 'E', 'F'].map((s) => note(s, 4, 2)).join('')) + measure(2, note('G', 4, 8))), 'Escala comprimida (ejemplo sintético)')));

// 3) MIDI: monofónico, con notas simultáneas/duraciones/tempo, y a dos pistas
out('melodia-monofonica.mid', buildMidi([[{ dt: 0, kind: 'tempo', bpm: 100 }, ...seq([[60, 480], [62, 480], [64, 480], [65, 480], [67, 960], [null, 480], [65, 480], [64, 960], [60, 1920]])]]));
out('dos-manos.mid', buildMidi([
  [{ dt: 0, kind: 'tempo', bpm: 90 }, ...seq([[72, 480], [74, 480], [76, 960], [77, 480], [76, 480], [74, 960], [72, 1920]])],
  [...seq([[48, 960], [55, 960], [48, 960], [55, 960], [43, 1920], [48, 1920]])],
]));
out('acordes-duraciones.mid', buildMidi([[{ dt: 0, kind: 'tempo', bpm: 120 },
  { dt: 0, kind: 'on', note: 60 }, { dt: 0, kind: 'on', note: 64 }, { dt: 0, kind: 'on', note: 67 }, { dt: 1920, kind: 'off', note: 60 }, { dt: 0, kind: 'off', note: 64 }, { dt: 0, kind: 'off', note: 67 },
  ...seq([[72, 240], [71, 240], [69, 480], [67, 960], [null, 480], [65, 1440]])]]));

// 4) Inválidos
out('invalido-truncado.musicxml', score(part('P1', measure(1, A() + note('C', 4, 8)))).slice(0, 220));
out('no-es-midi.mid', enc('esto no es un archivo MIDI'));

// 5) Ritmos, métricas y cambios de clave (SINTÉTICO, no es una obra real). divisions = 24: corchea 12, semicorchea 6, fusa 3, negra 24,
//    negra con puntillo 36, blanca 48, blanca con puntillo 72, corchea de tresillo 8. 6/8 = 72, 9/8 = 108, 3/8 = 36 unidades.
//    Pentagrama superior: clave de Fa → Sol (a mitad del compás 1) → Fa (inicio del 3) → Do (a mitad del 4) → Sol (inicio del 5).
{
  const E = 12, S = 6, T = 3, Q = 24, DQ = 36, H = 48, DH = 72, TRI = 8;
  const n = (s: string, o: number, d: number, type: string, extra = '', alter?: number, staff = 1, voice = 1) => note(s, o, d, `<voice>${voice}</voice><type>${type}</type>${extra}<staff>${staff}</staff>`, alter);
  const lh = (s: string, o: number, d: number, type: string, extra = '') => n(s, o, d, type, extra, undefined, 2, 2);
  const clef = (sign: string, line: number) => `<attributes><clef number="1"><sign>${sign}</sign><line>${line}</line></clef></attributes>`;
  const back = (d: number) => `<backup><duration>${d}</duration></backup>`;
  const tri = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
  const DOT = '<dot/>';
  const m1 = measure(1, `<attributes><divisions>24</divisions><key><fifths>1</fifths></key><time><beats>6</beats><beat-type>8</beat-type></time><staves>2</staves><clef number="1"><sign>F</sign><line>4</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction><sound tempo="76"/></direction>`
    + n('G', 3, E, 'eighth') + n('B', 3, E, 'eighth') + n('D', 4, E, 'eighth') + clef('G', 2) + n('G', 4, E, 'eighth') + n('F', 4, E, 'eighth', '', 1) + n('E', 4, E, 'eighth')
    + back(DH) + lh('G', 2, DH, 'half', DOT));
  const m2 = measure(2, n('D', 4, DQ, 'quarter', DOT) + n('G', 3, S, '16th') + n('A', 3, S, '16th') + n('B', 3, S, '16th') + n('C', 4, S, '16th') + n('D', 4, E, 'eighth')
    + back(DH) + lh('D', 3, DQ, 'quarter', DOT) + lh('A', 2, DQ, 'quarter', DOT));
  const m3 = measure(3, `<attributes><time><beats>9</beats><beat-type>8</beat-type></time></attributes>` + clef('F', 4)
    + n('E', 3, TRI, 'eighth', tri) + n('F', 3, TRI, 'eighth', tri, 1) + n('G', 3, TRI, 'eighth', tri) + n('B', 3, E, 'eighth') + n('C', 4, DQ, 'quarter', DOT) + n('B', 3, Q, 'quarter') + n('A', 3, E, 'eighth', '<tie type="start"/>')
    + back(3 * E * 3) + lh('E', 2, DH, 'half', DOT) + lh('A', 2, DQ, 'quarter', DOT));
  const m4 = measure(4, n('A', 3, E, 'eighth', '<tie type="stop"/>') + rest(E, '<voice>1</voice><type>eighth</type><staff>1</staff>') + n('C', 4, T, '32nd') + n('D', 4, T, '32nd') + n('E', 4, S, '16th')
    + clef('C', 3) + n('F', 4, E, 'eighth') + n('E', 4, E, 'eighth') + n('D', 4, E, 'eighth') + n('C', 4, E, 'eighth') + n('A', 3, Q, 'quarter')
    + back(9 * E) + lh('A', 2, DQ, 'quarter', DOT) + lh('E', 2, DH, 'half', DOT));
  const m5 = measure(5, `<attributes><time><beats>3</beats><beat-type>8</beat-type></time></attributes>` + clef('G', 2)
    + n('B', 4, E, 'eighth') + n('A', 4, E, 'eighth') + n('G', 4, E, 'eighth') + back(DQ) + lh('G', 2, DQ, 'quarter', DOT));
  const m6 = measure(6, n('G', 4, DQ, 'quarter', DOT) + back(DQ) + lh('G', 2, DQ, 'quarter', DOT));
  out('ritmos-y-claves.musicxml', score(part('P1', m1 + m2 + m3 + m4 + m5 + m6), 'Ritmos y claves (ejemplo sintético)'));
}
