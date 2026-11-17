/**
 * Partitura de Playing (una mano, clave de Sol): port del dibujo del HTML original.
 * Geometría, colores y animación son idénticos. Cambios internos sin efecto visual:
 *  - el bucle rAF solo corre mientras hay animación pendiente (no 60 fps perpetuos) y se cancela en dispose();
 *  - el tamaño del canvas se compara con valores redondeados (el original lo reasignaba en cada fotograma con DPR fraccionario).
 * Limitación Fase 1: una altura por evento (los acordes y dos pentagramas llegan en la Fase 3).
 */
export interface ScoreNote { step: number; sharp: boolean }

const BASE = 150, GAP = 50;

export class ScrollScoreRenderer {
  private notes: ScoreNote[] = [];
  private pos = 0; private view = 0; private raf = 0;
  private g: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private onVisible = () => { if (!document.hidden) this.requestDraw(); };

  constructor(private cv: HTMLCanvasElement) {
    this.g = cv.getContext('2d')!;
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.requestDraw()); this.ro.observe(cv); }
    document.addEventListener('visibilitychange', this.onVisible);
    // La clave de Sol es un glifo Unicode: se redibuja cuando la fuente musical local termina de cargar.
    void document.fonts?.load('84px "Noto Music"', '𝄞').then(() => this.requestDraw()).catch(() => {});
    this.requestDraw();
  }

  setNotes(notes: ScoreNote[]) { this.notes = notes; this.pos = 0; this.view = 0; this.requestDraw(); }
  setPos(pos: number) { this.pos = pos; this.requestDraw(); }
  reset() { this.pos = 0; this.view = 0; this.requestDraw(); }
  dispose() { cancelAnimationFrame(this.raf); this.raf = 0; this.ro?.disconnect(); document.removeEventListener('visibilitychange', this.onVisible); }

  private requestDraw() {
    if (this.raf || document.hidden) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  private draw() {
    const { cv, g, notes, pos } = this;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    this.view += (pos - this.view) * 0.15;
    const view = this.view;
    const y = (s: number) => BASE - (s - 30) * 7;
    g.strokeStyle = '#2a2f3d'; g.lineWidth = 1.3;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(0, y(30 + k * 2)); g.lineTo(W, y(30 + k * 2)); g.stroke(); }
    g.fillStyle = '#2a2f3d'; g.font = '84px "Segoe UI Symbol","Noto Music","Apple Symbols",serif'; g.fillText('𝄞', 10, BASE - 4);
    const cx = 150;
    notes.forEach((n, i) => {
      const x = cx + (i - view) * GAP; if (x < 85 || x > W + 20) return;
      const col = i < pos ? '#2fa58a' : i === pos ? '#d98a12' : '#2a2f3d';
      g.strokeStyle = '#2a2f3d'; g.lineWidth = 1.3;
      for (let s = 28; s >= n.step; s -= 2) { g.beginPath(); g.moveTo(x - 13, y(s)); g.lineTo(x + 13, y(s)); g.stroke(); }
      for (let s = 40; s <= n.step; s += 2) { g.beginPath(); g.moveTo(x - 13, y(s)); g.lineTo(x + 13, y(s)); g.stroke(); }
      const ny = y(n.step), up = n.step < 34;
      g.fillStyle = g.strokeStyle = col;
      g.beginPath(); g.ellipse(x, ny, 8.5, 6, -0.35, 0, 7); g.fill();
      g.lineWidth = 1.8; g.beginPath();
      if (up) { g.moveTo(x + 8, ny - 1); g.lineTo(x + 8, ny - 38); } else { g.moveTo(x - 8, ny + 1); g.lineTo(x - 8, ny + 38); }
      g.stroke();
      if (n.sharp) { g.font = '22px serif'; g.fillText('♯', x - 30, ny + 7); }
      if (i === pos) { g.strokeStyle = 'rgba(217,138,18,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(x, ny, 17, 0, 7); g.stroke(); }
    });
    if (Math.abs(pos - this.view) > 0.002) this.requestDraw(); else this.view = pos;
  }
}
