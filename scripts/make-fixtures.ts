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
