import type { Clock } from './clock';

export type TransportState = 'stopped' | 'running' | 'paused';

/**
 * Transporte musical sobre el reloj de audio. El tiempo de canción son SEGUNDOS REALES de la línea temporal (la velocidad ya está aplicada
 * en ella). Se guarda un ancla (tiempo de audio, tiempo de canción) y el tiempo actual es ancla + transcurrido: pausar/reanudar rehace
 * el ancla, así no se acumulan errores. `start(-2)` empieza con una cuenta previa de 2 s.
 */
export class Transport {
  private anchorAudio = 0; private anchorSong = 0; private paused = 0;
  state: TransportState = 'stopped';
  private latencySec = 0;
  constructor(private clock: Clock) {}

  /** + = las pulsaciones llegan tarde: se restan al convertir su marca de tiempo. */
  setLatencyMs(ms: number) { this.latencySec = ms / 1000; }
  start(songStartSec: number) { this.anchorAudio = this.clock.audioNow(); this.anchorSong = songStartSec; this.state = 'running'; }
  now(): number { return this.state === 'running' ? this.anchorSong + (this.clock.audioNow() - this.anchorAudio) : this.state === 'paused' ? this.paused : this.anchorSong; }
  pause() { if (this.state !== 'running') return; this.paused = this.now(); this.state = 'paused'; }
  resume() { if (this.state !== 'paused') return; this.anchorAudio = this.clock.audioNow(); this.anchorSong = this.paused; this.state = 'running'; }
  stop() { this.state = 'stopped'; this.anchorSong = 0; }
  /** Tiempo de canción de una entrada (marca performance.now), con la latencia calibrada ya descontada. */
  atPerf(perfMs: number): number { return this.anchorSong + (this.clock.perfToAudio(perfMs) - this.anchorAudio) - this.latencySec; }
  /** Instante del reloj de audio al que corresponde un tiempo de canción (para programar sonidos con exactitud). */
  audioTimeOf(songSec: number): number { return this.anchorAudio + (songSec - this.anchorSong); }
}
