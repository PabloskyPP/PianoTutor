import { getAudioContext } from '../audio/engine';
import { pitchLegacy } from './pitchLegacy';

export interface MicOptions {
  /** Comportamiento heredado (Fase 1): solo se envía la nota si coincide con la esperada. */
  accept: (midi: number) => boolean;
  onNote: (midi: number) => void;
}

/**
 * Micrófono con ciclo de vida completo: start() / stop() idempotentes. stop() libera pista, nodos y temporizador,
 * incluso si se llama mientras el navegador aún pide permiso. El AudioContext es el compartido y NO se cierra.
 */
export class MicInput {
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private last = -1; private count = 0; private block = -1; private blockT = 0;

  constructor(private opts: MicOptions) {}
  get active() { return this.timer !== undefined; }

  async start(): Promise<void> {
    if (this.active) return;
    const token = ++this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (token !== this.generation) { stream.getTracks().forEach((t) => t.stop()); return; } // se canceló durante el permiso
    try {
      const ctx = getAudioContext();
      await ctx.resume();
      if (token !== this.generation) { stream.getTracks().forEach((t) => t.stop()); return; }
      this.stream = stream;
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 4096;
      this.source = ctx.createMediaStreamSource(stream); this.source.connect(this.analyser);
      const buf = new Float32Array(2048), sr = ctx.sampleRate, an = this.analyser;
      this.reset();
      this.timer = setInterval(() => this.tick(an, buf, sr), 40);
    } catch (e) { stream.getTracks().forEach((t) => t.stop()); this.cleanupNodes(); throw e; }
  }

  private tick(an: AnalyserNode, buf: Float32Array<ArrayBuffer>, sr: number) {
    an.getFloatTimeDomainData(buf);
    const m = pitchLegacy(buf, sr), now = performance.now();
    if (m < 0) { this.last = -1; this.count = 0; if (now - this.blockT > 150) this.block = -1; return; }
    this.count = m === this.last ? this.count + 1 : 1; this.last = m;
    if (this.count >= 2 && !(this.block === m % 12 && now - this.blockT < 600) && this.opts.accept(m)) {
      this.block = m % 12; this.blockT = now; this.opts.onNote(m);
    }
  }

  /** Reinicia la detección interna (al cambiar de canción o reiniciar). */
  reset() { this.last = -1; this.count = 0; this.block = -1; this.blockT = 0; }

  stop(): void {
    this.generation++;
    if (this.timer !== undefined) { clearInterval(this.timer); this.timer = undefined; }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.cleanupNodes();
  }

  private cleanupNodes() {
    this.source?.disconnect(); this.analyser?.disconnect();
    this.source = undefined; this.analyser = undefined; this.stream = undefined;
  }
}
