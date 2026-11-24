import type { Beat } from '@pianotutor/shared';
import type { Transport } from './transport';

export interface ClickSink { click(audioTime: number, accent: boolean): void }

/** Sonido de metrónomo con el AudioContext compartido (oscilador corto con envolvente). */
export function createClickSink(ctx: AudioContext, volume = 0.25): ClickSink {
  return {
    click(t, accent) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = accent ? 1500 : 1000; o.type = 'square';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g).connect(ctx.destination); o.onended = () => { o.disconnect(); g.disconnect(); };
      o.start(t); o.stop(t + 0.05);
    },
  };
}

/**
 * Programa los pulsos con anticipación sobre el reloj de audio (el temporizador solo decide CUÁNDO programar, no cuándo suena).
 * Cada pulso se programa una sola vez; tras pausar/reanudar se retoma desde el primer pulso futuro.
 */
export class BeatScheduler {
  private idx = 0; private timer?: ReturnType<typeof setInterval>;
  constructor(private tr: Transport, private beats: readonly Beat[], private sink: ClickSink, private audioNow: () => number, private lookaheadSec = 0.12, private pollMs = 25) {}

  start() { this.stop(); this.seek(); this.timer = setInterval(() => this.pump(), this.pollMs); this.pump(); }
  stop() { if (this.timer !== undefined) { clearInterval(this.timer); this.timer = undefined; } }
  /** Reposiciona el cursor en el primer pulso que aún no ha sonado (tras pausa/reanudar). */
  seek() { const now = this.tr.now(); this.idx = this.beats.findIndex((b) => b.t >= now - 1e-6); if (this.idx < 0) this.idx = this.beats.length; }
  private pump() {
    if (this.tr.state !== 'running') return;
    const horizon = this.audioNow() + this.lookaheadSec;
    while (this.idx < this.beats.length) {
      const b = this.beats[this.idx]!, at = this.tr.audioTimeOf(b.t);
      if (at > horizon) break;
      if (at >= this.audioNow() - 0.02) this.sink.click(at, b.accent);
      this.idx++;
    }
  }
}
