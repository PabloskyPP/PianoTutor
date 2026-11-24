// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderOriginal, fakeCanvasEl, diffCount, fontOk } from '../helpers/canvasHarness';
import { ScrollScoreRenderer } from '../../frontend/src/score/ScrollScoreRenderer';
import { buildScoreEvents } from '../../frontend/src/score/scoreEvents';
import { LEGACY_SONGS, buildLegacySong, LEGACY_META, toPerformance } from '@pianotutor/shared';

/**
 * REGRESIÓN VISUAL de Playing a una mano: el renderer actual debe producir EXACTAMENTE los mismos píxeles que el draw() ORIGINAL
 * del HTML (ejecutado sobre un canvas real con la fuente musical local). Cierra la comparación de capturas pendiente de la Fase 1.
 * Limitación: la clave de Sol del original usa «Segoe UI Symbol» primero; aquí ambos usan la misma fuente disponible (Noto Music).
 */
describe('paridad píxel a píxel con el draw() original (Playing, una mano)', () => {
  it('la fuente musical está disponible en el arnés', () => expect(fontOk).toBe(true));
  for (const [title, notation] of Object.entries(LEGACY_SONGS)) {
    const song = buildLegacySong(title, notation, LEGACY_META[title]!);
    const events = buildScoreEvents(toPerformance(song), false), n = events.length;
    it(`«${title}»: 0 píxeles de diferencia en inicio, medio y final`, () => {
      for (const pos of [0, 1, 3, Math.floor(n / 2), n - 1]) {
        const { el, canvas } = fakeCanvasEl(900, 210); const r = new ScrollScoreRenderer(el);
        r.setEvents(events); r.setFollow(true); r.setView(pos); r.setPos(pos); r.drawNow(); r.dispose();
        expect(diffCount(renderOriginal(title, pos), canvas), `pos ${pos}`).toBe(0);
      }
    });
  }
  it('también con otras anchuras (el original dibuja solo lo visible)', () => {
    const [title, notation] = Object.entries(LEGACY_SONGS)[2]!; const song = buildLegacySong(title, notation, LEGACY_META[title]!);
    for (const W of [480, 700, 1300]) { const { el, canvas } = fakeCanvasEl(W, 210); const r = new ScrollScoreRenderer(el); r.setEvents(buildScoreEvents(toPerformance(song), false)); r.setFollow(true); r.setView(7); r.setPos(7); r.drawNow(); r.dispose(); expect(diffCount(renderOriginal(title, 7, W), canvas), `W ${W}`).toBe(0); }
  });
  it('con suavizado (modo original): converge a la misma imagen tras varios fotogramas', () => {
    const [title, notation] = Object.entries(LEGACY_SONGS)[0]!; const song = buildLegacySong(title, notation, LEGACY_META[title]!);
    const { el, canvas } = fakeCanvasEl(900, 210); const r = new ScrollScoreRenderer(el); r.setEvents(buildScoreEvents(toPerformance(song), false)); r.setPos(4);
    for (let i = 0; i < 80; i++) r.drawNow(); r.dispose(); expect(diffCount(renderOriginal(title, 4), canvas)).toBeLessThan(50);   // el original converge igual (asíntota): solo resta sub-píxel
  });
});
