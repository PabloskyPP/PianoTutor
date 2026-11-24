/**
 * Partitura de Playing: port del dibujo del HTML original, ampliado (Fase 3) con acordes, colores por resultado,
 * desplazamiento continuo y dos pentagramas (clave de Sol arriba, de Fa abajo, notas simultáneas alineadas).
 * Una nota simple en el diseño de una mano se dibuja EXACTAMENTE igual que en el original (tests/regression/score-parity.test.ts
 * compara píxel a píxel con el draw() original). Cambios internos sin efecto visual: el bucle rAF solo corre mientras hay animación
 * pendiente y se cancela en dispose(); el tamaño del canvas se compara redondeado.
 */
import type { ScoreEvent, ScoreHead } from './scoreEvents';

export type EventStatus = 'pending' | 'hit' | 'timing' | 'omit' | 'partial' | 'unverified';
export type Layout = 'single' | 'grand';

export const INK = '#2a2f3d', GREEN = '#2fa58a', ORANGE = '#d98a12', RED = '#d9534f', GOLD = '#c9a227', GREY = '#7f93a8';
const STATUS_COLOR: Record<EventStatus, string> = { pending: INK, hit: GREEN, timing: GOLD, omit: RED, partial: GOLD, unverified: GREY };
const BASE = 150, GAP = 50, STEP_PX = 7, BASS_BASE = 270;          // BASE: línea inferior de la clave de Sol (original); BASS_BASE: línea inferior de la de Fa
const SHIFT = 15;                                                     // desplazamiento horizontal de las notas en segunda

interface Staff { yOf: (step: number) => number; lines: number[]; below: number; above: number; mid: number }
const TREBLE: Staff = { yOf: (s) => BASE - (s - 30) * STEP_PX, lines: [30, 32, 34, 36, 38], below: 28, above: 40, mid: 34 };
const BASS: Staff = { yOf: (s) => BASS_BASE - (s - 18) * STEP_PX, lines: [18, 20, 22, 24, 26], below: 16, above: 28, mid: 22 };

export class ScrollScoreRenderer {
  private events: ScoreEvent[] = [];
  private pos = 0; private view = 0; private raf = 0; private follow = false;
  private statuses: readonly EventStatus[] | null = null;
  private covered: ReadonlySet<number> = new Set();
  private g: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private onVisible = () => { if (!document.hidden) this.requestDraw(); };

  constructor(private cv: HTMLCanvasElement, private layout: Layout = 'single') {
    this.g = cv.getContext('2d')!;
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.requestDraw()); this.ro.observe(cv); }
    document.addEventListener('visibilitychange', this.onVisible);
    // Las claves son glifos Unicode: se redibuja cuando la fuente musical local termina de cargar.
    void document.fonts?.load('84px "Noto Music"', '𝄞𝄢').then(() => this.requestDraw()).catch(() => {});
    this.requestDraw();
  }

  setLayout(l: Layout) { this.layout = l; this.requestDraw(); }
  setEvents(events: ScoreEvent[]) { this.events = events; this.pos = 0; this.view = 0; this.statuses = null; this.covered = new Set(); this.requestDraw(); }
  /** Evento «actual» (naranja). En modo normal la vista se acerca a él con suavizado. */
  setPos(pos: number) { this.pos = pos; this.requestDraw(); }
  /** Modo continuo (Ritmo): la vista la fija quien llama, sin suavizado. */
  setFollow(on: boolean) { this.follow = on; this.requestDraw(); }
  setView(v: number) { this.view = v; this.requestDraw(); }
  /** Colores por resultado (Ritmo). null = comportamiento del original: verde lo ya tocado, naranja lo actual. */
  setStatuses(s: readonly EventStatus[] | null) { this.statuses = s; this.requestDraw(); }
  /** Notas (MIDI) del evento actual que ya se tocaron: se pintan en verde mientras faltan las demás. */
  setCovered(c: ReadonlySet<number>) { this.covered = c; this.requestDraw(); }
  reset() { this.pos = 0; this.view = 0; this.statuses = null; this.covered = new Set(); this.requestDraw(); }
  dispose() { cancelAnimationFrame(this.raf); this.raf = 0; this.ro?.disconnect(); document.removeEventListener('visibilitychange', this.onVisible); }

  private requestDraw() {
    if (this.raf || document.hidden) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.drawNow(); });
  }

  /** Dibuja un fotograma de inmediato (lo usa el bucle y las pruebas). */
  drawNow() {
    const { cv, g, events, pos } = this;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!this.follow) this.view += (pos - this.view) * 0.15;
    const view = this.view, grand = this.layout === 'grand';
    const staves = grand ? [TREBLE, BASS] : [TREBLE];
    g.strokeStyle = INK; g.lineWidth = 1.3;
    for (const st of staves) for (const s of st.lines) { g.beginPath(); g.moveTo(0, st.yOf(s)); g.lineTo(W, st.yOf(s)); g.stroke(); }
    g.fillStyle = INK; g.font = '84px "Segoe UI Symbol","Noto Music","Apple Symbols",serif'; g.fillText('𝄞', 10, BASE - 4);
    if (grand) {
      g.font = '84px "Noto Music","Segoe UI Symbol","Apple Symbols",serif'; g.fillText('𝄢', 10, BASS.yOf(24) + 54);
      g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath(); g.moveTo(5, TREBLE.yOf(38)); g.lineTo(5, BASS.yOf(18)); g.stroke();
    }
    const cx = 150;
    events.forEach((ev, i) => {
      const x = cx + (i - view) * GAP; if (x < 85 || x > W + 20) return;
      const status = this.statuses?.[i];
      const baseCol = status ? (i === pos && status === 'pending' ? ORANGE : STATUS_COLOR[status]) : (i < pos ? GREEN : i === pos ? ORANGE : INK);
      for (const [si, st] of staves.entries()) {
        const heads = ev.heads.filter((h) => (grand ? h.staff : 0) === si).sort((a, b) => a.step - b.step);
        if (heads.length) this.drawGroup(x, st, heads, baseCol, i === pos);
      }
    });
    if (!this.follow && Math.abs(pos - this.view) > 0.002) this.requestDraw(); else if (!this.follow) this.view = pos;
  }

  private colorOf(h: ScoreHead, base: string, current: boolean): string {
    return current && !this.statuses && this.covered.has(h.midi) ? GREEN : base;
  }

  private drawGroup(x: number, st: Staff, heads: ScoreHead[], base: string, current: boolean) {
    const g = this.g;
    const mean = heads.reduce((a, h) => a + h.step, 0) / heads.length;
    const up = mean < st.mid;
    // Notas en segunda: la que choca se desplaza al otro lado de la plica.
    const shifted = new Set<ScoreHead>();
    if (heads.length > 1) {
      if (up) heads.forEach((h, k) => { const p = heads[k - 1]; if (p && h.step - p.step === 1 && !shifted.has(p)) shifted.add(h); });
      else [...heads].reverse().forEach((h, k, arr) => { const n = arr[k - 1]; if (n && n.step - h.step === 1 && !shifted.has(n)) shifted.add(h); });
    }
    // Secuencia idéntica a la del original para cada cabeza: líneas adicionales, cabeza, (plica), alteración, aro.
    for (const h of heads) {
      const hx = x + (shifted.has(h) ? (up ? SHIFT : -SHIFT) : 0);
      g.strokeStyle = INK; g.lineWidth = 1.3;
      for (let s = st.below; s >= h.step; s -= 2) { g.beginPath(); g.moveTo(hx - 13, st.yOf(s)); g.lineTo(hx + 13, st.yOf(s)); g.stroke(); }
      for (let s = st.above; s <= h.step; s += 2) { g.beginPath(); g.moveTo(hx - 13, st.yOf(s)); g.lineTo(hx + 13, st.yOf(s)); g.stroke(); }
    }
    const lowY = st.yOf(heads[0]!.step), highY = st.yOf(heads[heads.length - 1]!.step);
    const stemCol = base;
    for (const h of heads) {
      const ny = st.yOf(h.step), hx = x + (shifted.has(h) ? (up ? SHIFT : -SHIFT) : 0), col = this.colorOf(h, base, current);
      g.fillStyle = g.strokeStyle = col;
      g.beginPath(); g.ellipse(hx, ny, 8.5, 6, -0.35, 0, 7); g.fill();
    }
    g.fillStyle = g.strokeStyle = stemCol; g.lineWidth = 1.8; g.beginPath();
    if (up) { g.moveTo(x + 8, lowY - 1); g.lineTo(x + 8, highY - 38); } else { g.moveTo(x - 8, highY + 1); g.lineTo(x - 8, lowY + 38); }
    g.stroke();
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
      const hx = x + (shifted.has(h) ? (up ? SHIFT : -SHIFT) : 0);
      g.strokeStyle = 'rgba(217,138,18,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(hx, st.yOf(h.step), 17, 0, 7); g.stroke();
    }
  }
}
