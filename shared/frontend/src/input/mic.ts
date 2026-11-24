import { getAudioContext } from '../audio/engine';
import { MicAnalyzer, type MicEvent, type MicStatus } from './audio/analyzer';

export interface MicOptions { sensitivity: number; onNote: (e: MicEvent) => void; onStatus?: (s: MicStatus) => void }
const POLL_MS = 20, WINDOW = 4096;

/**
 * Micrófono con ciclo de vida completo: start() / stop() idempotentes. stop() libera pista, nodos y temporizador, incluso si se llama
 * mientras el navegador aún pide permiso. El AudioContext es el compartido y NO se cierra.
 * Captura con un AnalyserNode sondeado cada 20 ms; el análisis (ataques, altura) está en input/audio y solo calcula la altura tras un ataque.
 * Posible mejora (no hecha, sin hardware para validarla): AudioWorklet para marcas de tiempo exactas por muestra.
 */
export class MicInput {
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private timer?: ReturnType<typeof setInterval>;
  private analyzer?: MicAnalyzer;
  private generation = 0;
  constructor(private opts: MicOptions) {}
  get active() { return this.timer !== undefined; }
  get calibrating() { return this.analyzer?.isCalibrating ?? false; }

  async start(): Promise<void> {
    if (this.active) return;
    const token = ++this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (token !== this.generation) { stream.getTracks().forEach((t) => t.stop()); return; }   // se canceló durante el permiso
    try {
      const ctx = getAudioContext();
      await ctx.resume();
      if (token !== this.generation) { stream.getTracks().forEach((t) => t.stop()); return; }
      this.stream = stream;
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = WINDOW;
      this.source = ctx.createMediaStreamSource(stream); this.source.connect(this.analyser);
      this.analyzer = new MicAnalyzer({ sampleRate: ctx.sampleRate, sensitivity: this.opts.sensitivity, onNote: this.opts.onNote, ...(this.opts.onStatus ? { onStatus: this.opts.onStatus } : {}) });
      this.opts.onStatus?.('calibrating');
      const buf = new Float32Array(WINDOW), an = this.analyser, az = this.analyzer;
      this.timer = setInterval(() => { an.getFloatTimeDomainData(buf); az.process(buf, performance.now()); }, POLL_MS);
    } catch (e) { stream.getTracks().forEach((t) => t.stop()); this.cleanupNodes(); throw e; }
  }

  setSensitivity(s: number) { this.opts.sensitivity = s; this.analyzer?.setSensitivity(s); }
  recalibrate() { this.analyzer?.recalibrate(); }
  /** Descarta cualquier ataque en curso (al cambiar de canción o reiniciar). */
  reset() { this.analyzer?.reset(); }

  stop(): void {
    this.generation++;
    if (this.timer !== undefined) { clearInterval(this.timer); this.timer = undefined; }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.cleanupNodes();
  }
  private cleanupNodes() {
    this.source?.disconnect(); this.analyser?.disconnect();
    this.source = undefined; this.analyser = undefined; this.stream = undefined; this.analyzer = undefined;
  }
}
