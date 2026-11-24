import { getAudioContext } from './engine';

/** Relojes que necesita el transporte. Separado para poder simularlo en pruebas. */
export interface Clock {
  audioNow(): number;                       // segundos del reloj de audio (currentTime)
  perfNow(): number;                        // ms (performance.now)
  /** Convierte una marca de tiempo de entrada (base performance.now: MIDI, teclado, micrófono) a tiempo del reloj de audio. */
  perfToAudio(perfMs: number): number;
}

/**
 * Se usa getOutputTimestamp() (contextTime, performanceTime), que relaciona el reloj de audio con el de rendimiento en el mismo instante
 * y descuenta la latencia de salida: lo que se OYE en el instante t corresponde a contextTime(t). Así las pulsaciones de quien sigue
 * el metrónomo que oye quedan alineadas sin acumular deriva (la correspondencia se recalcula en cada llamada).
 * Si el navegador no la ofrece, se usa currentTime (sin descontar la latencia de salida: la calibración manual la absorbe).
 */
export function createAudioClock(ctx: AudioContext = getAudioContext()): Clock {
  return {
    audioNow: () => ctx.currentTime,
    perfNow: () => performance.now(),
    perfToAudio(perfMs: number) {
      const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : undefined;
      if (ts && ts.performanceTime && ts.contextTime !== undefined) return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
      return ctx.currentTime + (perfMs - performance.now()) / 1000;
    },
  };
}

let factory: () => Clock = () => createAudioClock();
/** Reloj que usa la aplicación (sustituible en pruebas). */
export const newClock = (): Clock => factory();
export function setClockFactory(f: (() => Clock) | null) { factory = f ?? (() => createAudioClock()); }
