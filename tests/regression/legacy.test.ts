import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_SONGS, parseLegacy, validateSong, toPerformance } from '@pianotutor/shared';

const html = fs.readFileSync(path.resolve(__dirname, 'original/piano-tutor.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
/** Ejecuta las definiciones reales del HTML original (LET, SEMI, SONGS, parse). */
const orig = new Function(`${script.slice(script.indexOf('const LET'), script.indexOf('const $='))}; return { SONGS, parse };`)() as {
  SONGS: Record<string, string>; parse: (s: string) => { midi: number; step: number; sharp: boolean }[];
};
const seedDir = path.resolve(__dirname, '../../backend/seed');
const seeds = fs.readdirSync(seedDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(seedDir, f), 'utf8')));
const NAME = (p: { step: string; alter: number; octave: number }) => `${p.step}${p.alter === 1 ? '#' : ''}${p.octave}`;

describe('regresión: las 4 canciones originales', () => {
  it('el HTML original contiene exactamente 4 canciones', () => expect(Object.keys(orig.SONGS)).toHaveLength(4));
  it('LEGACY_SONGS es idéntico al objeto SONGS del HTML original', () => expect(LEGACY_SONGS).toEqual(orig.SONGS));
  it('parseLegacy da los mismos números MIDI y sostenidos que parse() original', () => {
    for (const [title, s] of Object.entries(orig.SONGS)) {
      expect(parseLegacy(LEGACY_SONGS[title]!).map((n) => [n.midi, n.sharp])).toEqual(orig.parse(s).map((n) => [n.midi, n.sharp]));
    }
  });
  for (const [title, notation] of Object.entries(orig.SONGS)) {
    it(`semilla «${title}»: secuencia carácter por carácter`, () => {
      const seed = seeds.find((s) => s.title === title);
      expect(seed, 'existe un archivo de semilla con ese título').toBeTruthy();
      expect(validateSong(seed).ok).toBe(true);
      const evs = seed.parts[0].staves[0].events;
      expect(evs.map((e: any) => NAME(e.pitches[0].pitch)).join(' ')).toBe(notation);
      expect(evs.map((e: any) => e.pitches[0].pitch.midi)).toEqual(orig.parse(notation).map((n) => n.midi));
      expect(toPerformance(seed).map((e) => e.midis[0])).toEqual(orig.parse(notation).map((n) => n.midi));
    });
    it(`semilla «${title}»: datos provisionales marcados`, () => {
      const seed = seeds.find((s) => s.title === title);
      expect(seed.provisional).toMatchObject({ metadata: true, rhythm: true });
      expect(seed.origin).toBe('preloaded'); expect(seed.hands).toBe(1);
      expect(seed.parts[0].staves[0].events.every((e: any) => e.durationTicks === 960)).toBe(true);
    });
  }
  it('no se inventan silencios de relleno en el último compás', () => {
    for (const s of seeds) expect(s.parts[0].staves[0].events.some((e: any) => e.type === 'rest')).toBe(false);
  });
});
