import type { InputHub } from './hub';

export interface MidiStatus { supported: boolean; denied: boolean; devices: string[] }

/** Entrada MIDI: Note On/Off (Note On con velocidad 0 = Off), canal y velocidad. Devuelve la función de baja. */
export function connectMidi(hub: InputHub, onStatus: (s: MidiStatus) => void): () => void {
  let disposed = false;
  let access: MIDIAccess | undefined;
  const handler = (e: MIDIMessageEvent) => {
    const d = e.data; if (!d || d.length < 2) return;
    const status = d[0]! & 0xf0, channel = d[0]! & 0x0f, midi = d[1]!, vel = d[2] ?? 0;
    const tMs = e.timeStamp || performance.now();
    if (status === 0x90 && vel > 0) hub.emit({ kind: 'on', midi, tMs, source: 'midi', velocity: vel, channel });
    else if (status === 0x80 || (status === 0x90 && vel === 0)) hub.emit({ kind: 'off', midi, tMs, source: 'midi', channel });
  };
  const bind = (a: MIDIAccess) => {
    const ins = [...a.inputs.values()];
    ins.forEach((i) => { i.onmidimessage = handler; }); // asignación (no addEventListener): no se duplican escuchas al rebindear
    onStatus({ supported: true, denied: false, devices: ins.map((i) => i.name ?? 'Dispositivo MIDI') });
  };
  if (!navigator.requestMIDIAccess) { onStatus({ supported: false, denied: false, devices: [] }); return () => {}; }
  navigator.requestMIDIAccess().then((a) => {
    if (disposed) return;
    access = a; bind(a); a.onstatechange = () => { if (!disposed) bind(a); };
  }).catch(() => { if (!disposed) onStatus({ supported: true, denied: true, devices: [] }); });
  return () => {
    disposed = true;
    if (access) { access.onstatechange = null; access.inputs.forEach((i) => { i.onmidimessage = null; }); }
  };
}

export function midiStatusText(s: MidiStatus): string {
  if (!s.supported) return 'Este navegador no admite MIDI (usa Chrome o Edge). Puedes usar el micrófono.';
  if (s.denied) return 'Acceso MIDI denegado. Usa el micrófono o el teclado del ordenador.';
  return s.devices.length ? 'Teclado MIDI conectado: ' + s.devices.join(', ') : 'No se detecta ningún teclado MIDI. Conéctalo por USB o usa el micrófono.';
}
