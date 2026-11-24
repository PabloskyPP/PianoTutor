/** Evento musical normalizado: toda fuente de entrada se convierte a esto antes de llegar al evaluador. */
export type InputSource = 'midi' | 'mic' | 'virtual' | 'computer-keyboard';
export interface NoteInputEvent {
  /** 'sustain' = pedal (CC64): `down` indica si está pulsado; `midi` no se usa. */
  kind: 'on' | 'off' | 'sustain';
  midi: number;
  tMs: number;            // misma base que performance.now()
  source: InputSource;
  velocity?: number;      // MIDI
  confidence?: number;    // micrófono
  channel?: number;       // MIDI
  down?: boolean;         // solo kind 'sustain'
}
export type InputListener = (e: NoteInputEvent) => void;

export class InputHub {
  private listeners = new Set<InputListener>();
  /** Devuelve la función de baja. */
  subscribe(fn: InputListener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit(e: NoteInputEvent): void { for (const fn of [...this.listeners]) fn(e); }
  get listenerCount() { return this.listeners.size; }
}
