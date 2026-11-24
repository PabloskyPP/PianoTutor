/**
 * Partitura de Playing: port del dibujo del HTML original, ampliado con acordes, colores por resultado, desplazamiento continuo,
 * dos pentagramas, y (desde la Fase 3b) FIGURAS (cabeza hueca o rellena, plica, corchetes, puntillos), CLAVES (incluidos los cambios de
 * clave), espaciado según la duración y barras de compás. Una nota negra simple sigue dibujándose EXACTAMENTE igual que en el original
 * (tests/regression/score-parity.test.ts compara píxel a píxel con el draw() original, con las barras de compás desactivadas).
 * Cambios internos sin efecto visual: el bucle rAF solo corre mientras hay animación pendiente y se cancela en dispose().
 */
import type { ClefId } from '@pianotutor/shared';
import type { Fig, ScoreEvent, ScoreHead } from './scoreEvents';
import { BASE, BASS_BASE, GAP, STEP_PX, geom, type StaffGeom } from './geometry';

export type EventStatus = 'pending' | 'hit' | 'timing' | 'omit' | 'partial' | 'unverified';
export type Layout = 'single' | 'grand';

export const INK = '#2a2f3d', GREEN = '#2fa58a', ORANGE = '#d98a12', RED = '#d9534f', GOLD = '#c9a227', GREY = '#7f93a8';
const STATUS_COLOR: Record<EventStatus, string> = { pending: INK, hit: GREEN, timing: GOLD, omit: RED, partial: GOLD, unverified: GREY };
const SHIFT = 15;                                                     // desplazamiento horizontal de las notas en segunda
const FLAGS: Record<string, number> = { '8': 1, '16': 2, '32': 3, '64': 4 };
const RANK = ['64', '32', '16', '8', 'q', 'h', 'w'];                  // de la más corta a la más larga
const CLEF_EXTRA = 30;
const STEM = 38;                                                      // longitud de la plica (la del original)
interface BeamGroup { slot: 0 | 1; idx: number[]; up: boolean; levels: number[] }                                                // espacio extra antes de un evento con cambio de clave (cabe la clave pequeña)

/** Distancia horizontal tras un evento: 50 px para una negra (como el original), menos para figuras cortas y más para largas. */
export const advanceFor = (gapTicks: number | undefined) => (gapTicks === undefined ? GAP : Math.max(30, Math.min(100, GAP * Math.sqrt(gapTicks / 960))));

export class ScrollScoreRenderer {
  private events: ScoreEvent[] = [];
  private X: number[] = [];                                           // posición horizontal acumulada de cada evento
  private slotClef: ClefId[][] = [[], []];                            // clave de cada pentagrama en cada evento (rellenada hacia delante)
  private clefChange: boolean[][] = [[], []];
  private beams: BeamGroup[] = [];
  private beamOf: (BeamGroup | undefined)[][] = [[], []];
  private pos = 0; private view = 0; private raf = 0; private follow = false;
  private bars = true;
  private statuses: readonly EventStatus[] | null = null;
  private covered: ReadonlySet<number> = new Set();
  private g: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private onVisible = () => { if (!document.hidden) this.requestDraw(); };

  constructor(private cv: HTMLCanvasElement, private layout: Layout = 'single') {
    this.g = cv.getContext('2d')!;
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.requestDraw()); this.ro.observe(cv); }
    document.addEventListener('visibilitychange', this.onVisible);
    void document.fonts?.load('84px "Noto Music"', '𝄞𝄢𝄡').then(() => this.requestDraw()).catch(() => {});
    this.requestDraw();
  }

  setLayout(l: Layout) { this.layout = l; this.requestDraw(); }
  setEvents(events: ScoreEvent[]) { this.events = events; this.layoutEvents(); this.pos = 0; this.view = 0; this.statuses = null; this.covered = new Set(); this.requestDraw(); }
  /** Barras de compás y cifra de compás (por defecto activadas). Desactivarlas devuelve el aspecto exacto del original. */
  setNotation(o: { bars: boolean }) { this.bars = o.bars; this.requestDraw(); }
  setPos(pos: number) { this.pos = pos; this.requestDraw(); }
  setFollow(on: boolean) { this.follow = on; this.requestDraw(); }
  setView(v: number) { this.view = v; this.requestDraw(); }
  setStatuses(s: readonly EventStatus[] | null) { this.statuses = s; this.requestDraw(); }
  setCovered(c: ReadonlySet<number>) { this.covered = c; this.requestDraw(); }
  reset() { this.pos = 0; this.view = 0; this.statuses = null; this.covered = new Set(); this.requestDraw(); }
  dispose() { cancelAnimationFrame(this.raf); this.raf = 0; this.ro?.disconnect(); document.removeEventListener('visibilitychange', this.onVisible); }
  /** Posiciones horizontales de los eventos (px desde el primero). Para pruebas. */
  positions(): readonly number[] { return this.X; }

  private layoutEvents() {
    const ev = this.events; this.X = []; this.slotClef = [[], []]; this.clefChange = [[], []];
    const last: (ClefId | null)[] = [null, null];
    ev.forEach((e, i) => {
      for (const slot of [0, 1] as const) {
        const h = e.heads.find((x) => x.staff === slot);
        const changed = !!h && last[slot] !== null && last[slot] !== h.clef;
        if (h) last[slot] = h.clef;
        this.clefChange[slot]![i] = changed; this.slotClef[slot]![i] = last[slot] ?? (slot === 0 ? 'G' : 'F');
      }
    });
    for (const slot of [0, 1] as const) { // las posiciones anteriores a la primera nota de un pentagrama usan su primera clave
      const first = ev.findIndex((e) => e.heads.some((x) => x.staff === slot));
      if (first > 0) { const c = this.slotClef[slot]![first]!; for (let i = 0; i < first; i++) this.slotClef[slot]![i] = c; }
    }
    this.buildBeams();
    let x = 0;
    ev.forEach((e, i) => { this.X[i] = x; x += advanceFor(e.gapTicks) + (this.clefChange[0]![i + 1] || this.clefChange[1]![i + 1] ? CLEF_EXTRA : 0); });
  }

  /** Agrupa con barras los eventos consecutivos con corchete (8.ª o más cortas) de un mismo pulso en un mismo pentagrama. */
  private buildBeams() {
    this.beams = []; this.beamOf = [[], []];
    const ev = this.events, grand = this.layout === 'grand';
    const flagsOf = (i: number, slot: 0 | 1): number => {
      const hs = ev[i]!.heads.filter((h) => (grand ? h.staff : 0) === slot); if (!hs.length) return 0;
      return Math.max(...hs.map((h) => FLAGS[h.fig.base] ?? 0));
    };
    for (const slot of grand ? ([0, 1] as const) : ([0] as const)) {
      let cur: number[] = [];
      const flush = () => {
        if (cur.length > 1) {
          const heads = cur.flatMap((i) => ev[i]!.heads.filter((h) => (grand ? h.staff : 0) === slot));
          const g0 = geom(slot, heads[0]!.clef), mean = heads.reduce((a, h) => a + h.step, 0) / heads.length;
          const bg: BeamGroup = { slot, idx: cur, up: mean < g0.mid, levels: cur.map((i) => flagsOf(i, slot)) };
          this.beams.push(bg); cur.forEach((i) => { this.beamOf[slot]![i] = bg; });
        }
        cur = [];
      };
      ev.forEach((e, i) => {
        const f = flagsOf(i, slot);
        if (f === 0) { flush(); return; }                                  // sin notas con corchete en este pentagrama: rompe la barra
        if (cur.length && ev[cur[cur.length - 1]!]!.bg !== e.bg) flush();
        if (e.bg === undefined) { flush(); return; }                        // sin compás conocido no se agrupa
        cur.push(i);
      });
      flush();
    }
  }
  /** Extremos de las plicas de un grupo con barras: línea inclinada (la mitad de la pendiente natural) que ninguna plica sobrepasa. */
  private beamTips(bg: BeamGroup, cx: number, xv: number): number[] {
    const grand = this.layout === 'grand', ev = this.events;
    const nat = bg.idx.map((i) => {
      const hs = ev[i]!.heads.filter((h) => (grand ? h.staff : 0) === bg.slot), st = geom(bg.slot, hs[0]!.clef);
      const ys = hs.map((h) => st.yOf(h.step));
      return bg.up ? Math.min(...ys) - STEM : Math.max(...ys) + STEM;
    });
    const xs = bg.idx.map((i) => cx + this.X[i]! - xv + (bg.up ? 8 : -8));
    const slope = Math.max(-0.35, Math.min(0.35, ((nat[nat.length - 1]! - nat[0]!) / Math.max(1, xs[xs.length - 1]! - xs[0]!)) * 0.5));
    const base = bg.up ? Math.min(...nat.map((y, k) => y - slope * (xs[k]! - xs[0]!))) : Math.max(...nat.map((y, k) => y - slope * (xs[k]! - xs[0]!)));
    return xs.map((x) => base + slope * (x - xs[0]!));
  }

  private requestDraw() {
    if (this.raf || document.hidden) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.drawNow(); });
  }
  private xView(view: number): number {
    const X = this.X; if (!X.length) return view * GAP;
    const f = Math.max(0, Math.min(X.length - 1, Math.floor(view))), a = X[f]!, b = X[f + 1] ?? a + GAP;
    return view < 0 ? view * GAP : a + (view - f) * (b - a);
  }

  /** Dibuja un fotograma de inmediato (lo usa el bucle y las pruebas). */
  drawNow() {
    const { cv, g, events, pos, X } = this;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!this.follow) this.view += (pos - this.view) * 0.15;
    const view = this.view, grand = this.layout === 'grand', slots: (0 | 1)[] = grand ? [0, 1] : [0];
    const xv = this.xView(view), cx = 150;
    // índice del primer evento visible: da la clave y la métrica que se muestran al principio del pentagrama
    let i0 = 0; while (i0 < events.length - 1 && cx + X[i0]! - xv < 85) i0++;
    g.strokeStyle = INK; g.lineWidth = 1.3;
    for (const slot of slots) { const bottomY = geom(slot, 'G').bottomY; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(0, bottomY - k * 2 * STEP_PX); g.lineTo(W, bottomY - k * 2 * STEP_PX); g.stroke(); } }
    for (const slot of slots) this.drawClef(slot, this.slotClef[slot]![i0] ?? (slot === 0 ? 'G' : 'F'), 10, false);
    if (grand) { g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(5, geom(0, 'G').yOf(38)); g.lineTo(5, geom(1, 'F').yOf(18)); g.stroke(); }
    if (this.bars && events[i0]?.ts) for (const slot of slots) this.drawTimeSig(slot, events[i0]!.ts!);
    const tipCache = new Map<BeamGroup, number[]>();
    events.forEach((ev, i) => {
      const x = cx + X[i]! - xv; if (x < 85 || x > W + 20) return;
      if (this.bars && ev.bar) {
        const bx = x - Math.min(0.5 * (X[i]! - (X[i - 1] ?? X[i]! - GAP)), 38);
        g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(bx, geom(0, 'G').yOf(38)); g.lineTo(bx, grand ? geom(1, 'F').yOf(18) : geom(0, 'G').yOf(30)); g.stroke();
      }
      for (const slot of slots) if (this.clefChange[slot]![i]) this.drawClef(slot, this.slotClef[slot]![i]!, x - 58, true);
      const status = this.statuses?.[i];
      const baseCol = status ? (i === pos && status === 'pending' ? ORANGE : STATUS_COLOR[status]) : (i < pos ? GREEN : i === pos ? ORANGE : INK);
      for (const slot of slots) {
        const heads = ev.heads.filter((h) => (grand ? h.staff : 0) === slot).sort((a, b) => a.step - b.step);
        if (!heads.length) continue;
        const bg = this.beamOf[slot]![i]; let tip: number | undefined;
        if (bg) { let tips = tipCache.get(bg); if (!tips) { tips = this.beamTips(bg, cx, xv); tipCache.set(bg, tips); } tip = tips[bg.idx.indexOf(i)]; }
        this.drawGroup(x, geom(slot, heads[0]!.clef), heads, baseCol, i === pos, tip);
      }
    });
    for (const [bg, tips] of tipCache) this.drawBeams(bg, tips, cx, xv, pos);
    if (!this.follow && Math.abs(pos - this.view) > 0.002) this.requestDraw(); else if (!this.follow) this.view = pos;
  }

  /**
   * Clave al principio del pentagrama (grande) o a mitad (pequeña). Desplazamiento de la línea base del glifo respecto a la línea inferior
   * del pentagrama (px): la de Sol es la del original; Fa y Do se calibraron mirando el resultado (ver tests/unit/score-figures.test.ts).
   */
  private drawClef(slot: 0 | 1, clef: ClefId, x: number, small: boolean) {
    const g = this.g, bottomY = geom(slot, 'G').bottomY;
    const OFF: Record<ClefId, [number, number]> = { G: [-4, -8.8], F: [12, -13.7], C: [14, -6] };   // [grande, pequeña]
    g.fillStyle = INK;
    g.font = `${small ? 44 : 84}px ${clef === 'G' ? '"Segoe UI Symbol","Noto Music","Apple Symbols"' : '"Noto Music","Segoe UI Symbol","Apple Symbols"'},serif`;
    g.fillText(clef === 'G' ? '𝄞' : clef === 'F' ? '𝄢' : '𝄡', x, bottomY + OFF[clef][small ? 1 : 0]);
  }

  private drawTimeSig(slot: 0 | 1, ts: string) {
    const g = this.g, [n, d] = ts.split('/'), bottomY = geom(slot, 'G').bottomY;
    g.fillStyle = INK; g.font = 'bold 22px serif'; g.textAlign = 'center'; g.fillText(n!, 76, bottomY - 35); g.fillText(d!, 76, bottomY - 7); g.textAlign = 'start';
  }

  private colorOf(h: ScoreHead, base: string, current: boolean): string { return current && !this.statuses && this.covered.has(h.midi) ? GREEN : base; }

  /** Barras de un grupo: una por cada nivel de corchete; las notas aisladas de un nivel llevan un trazo corto hacia su vecina. */
  private drawBeams(bg: BeamGroup, tips: number[], cx: number, xv: number, pos: number) {
    const g = this.g, sx = (k: number) => cx + this.X[bg.idx[k]!]! - xv + (bg.up ? 8 : -8), dir = bg.up ? 1 : -1;
    const status = this.statuses?.[bg.idx[0]!];
    g.strokeStyle = g.fillStyle = status ? (bg.idx[0] === pos && status === 'pending' ? ORANGE : STATUS_COLOR[status]) : (bg.idx.every((i) => i < pos) ? GREEN : bg.idx.includes(pos) ? ORANGE : INK);
    g.lineWidth = 4;
    const maxLevel = Math.max(...bg.levels);
    for (let L = 1; L <= maxLevel; L++) {
      let k = 0;
      while (k < bg.idx.length) {
        if (bg.levels[k]! < L) { k++; continue; }
        let e = k; while (e + 1 < bg.idx.length && bg.levels[e + 1]! >= L) e++;
        const off = (L - 1) * 6 * dir;
        let x0 = sx(k), x1 = sx(e), y0 = tips[k]! + off, y1 = tips[e]! + off;
        if (e === k) {   // nota aislada en este nivel: trazo corto hacia la vecina más cercana
          const toRight = k + 1 < bg.idx.length || k === 0, len = 10, slope = (tips[Math.min(bg.idx.length - 1, k + 1)]! - tips[Math.max(0, k - 1)]!) / Math.max(1, sx(Math.min(bg.idx.length - 1, k + 1)) - sx(Math.max(0, k - 1)));
          x1 = x0 + (toRight ? len : -len); y1 = y0 + slope * (x1 - x0);
        }
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        k = e + 1;
      }
    }
  }

  private drawGroup(x: number, st: StaffGeom, heads: ScoreHead[], base: string, current: boolean, beamTip?: number) {
    const g = this.g;
    const mean = heads.reduce((a, h) => a + h.step, 0) / heads.length;
    const up = mean < st.mid;
    const shortest = heads.reduce((a, h) => (RANK.indexOf(h.fig.base) < RANK.indexOf(a.base) ? h.fig : a), heads[0]!.fig);   // la figura más corta del grupo decide plica y corchetes
    const stem = shortest.base !== 'w';
    // Notas en segunda: la que choca se desplaza al otro lado de la plica.
    const shifted = new Set<ScoreHead>();
    if (heads.length > 1) {
      if (up) heads.forEach((h, k) => { const p = heads[k - 1]; if (p && h.step - p.step === 1 && !shifted.has(p)) shifted.add(h); });
      else [...heads].reverse().forEach((h, k, arr) => { const n = arr[k - 1]; if (n && n.step - h.step === 1 && !shifted.has(n)) shifted.add(h); });
    }
    const hx = (h: ScoreHead) => x + (shifted.has(h) ? (up ? SHIFT : -SHIFT) : 0);
    for (const h of heads) {                                           // líneas adicionales
      g.strokeStyle = INK; g.lineWidth = 1.3;
      for (let s = st.below; s >= h.step; s -= 2) { g.beginPath(); g.moveTo(hx(h) - 13, st.yOf(s)); g.lineTo(hx(h) + 13, st.yOf(s)); g.stroke(); }
      for (let s = st.above; s <= h.step; s += 2) { g.beginPath(); g.moveTo(hx(h) - 13, st.yOf(s)); g.lineTo(hx(h) + 13, st.yOf(s)); g.stroke(); }
    }
    const lowY = st.yOf(heads[0]!.step), highY = st.yOf(heads[heads.length - 1]!.step);
    for (const h of heads) {                                           // cabezas: huecas para redonda y blanca, rellenas para el resto
      const ny = st.yOf(h.step), col = this.colorOf(h, base, current), hollow = h.fig.base === 'w' || h.fig.base === 'h';
      g.fillStyle = g.strokeStyle = col;
      g.beginPath(); g.ellipse(hx(h), ny, 8.5, 6, -0.35, 0, 7);
      if (hollow) { g.lineWidth = 1.8; g.stroke(); } else g.fill();
    }
    g.fillStyle = g.strokeStyle = base; g.lineWidth = 1.8;
    if (stem) {
      const tipY = beamTip ?? (up ? highY - STEM : lowY + STEM), sx = up ? x + 8 : x - 8;
      g.beginPath();
      if (up) { g.moveTo(sx, lowY - 1); g.lineTo(sx, tipY); } else { g.moveTo(sx, highY + 1); g.lineTo(sx, tipY); }
      g.stroke();
      for (let k = 0; k < (beamTip === undefined ? FLAGS[shortest.base] ?? 0 : 0); k++) {   // corchetes (los grupos con barra no los llevan)
        const y0 = up ? tipY + k * 7 : tipY - k * 7, dir = up ? 1 : -1;
        g.beginPath(); g.moveTo(sx, y0); g.bezierCurveTo(sx + 2, y0 + dir * 8, sx + 14, y0 + dir * 10, sx + 10, y0 + dir * 24); g.stroke();
      }
    }
    for (const h of heads) {                                           // puntillos
      if (!h.fig.dots) continue;
      const onLine = (h.step - st.bottomStep) % 2 === 0;
      g.fillStyle = this.colorOf(h, base, current); g.beginPath(); g.arc(hx(h) + 14, st.yOf(h.step) - (onLine ? 3.5 : 0), 2, 0, 7); g.fill();
    }
    // Alteraciones, de la más aguda a la más grave, en columnas para que no se pisen.
    const placed: { step: number; col: number }[] = [];
    for (const h of [...heads].reverse()) {
      if (!h.acc) continue;
      let col = 0; while (placed.some((p) => p.col === col && Math.abs(p.step - h.step) < 6)) col++;
      placed.push({ step: h.step, col });
      g.fillStyle = g.strokeStyle = this.colorOf(h, base, current);
      g.font = '22px serif'; g.fillText(h.acc === '#' ? '♯' : h.acc === 'b' ? '♭' : h.acc === '##' ? '♯♯' : '♭♭', x - 30 - col * 13 - (h.acc.length > 1 ? 8 : 0), st.yOf(h.step) + 7);
    }
    if (current) for (const h of heads) {
      if (this.covered.has(h.midi) && !this.statuses) continue;
      g.strokeStyle = 'rgba(217,138,18,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(hx(h), st.yOf(h.step), 17, 0, 7); g.stroke();
    }
  }
}
export type { Fig };
export { BASE, BASS_BASE };
