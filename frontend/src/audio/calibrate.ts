import type { Clock } from './clock';
import type { ClickSink } from './beats';
import type { InputHub } from '../input/hub';

export type CalibrationResult =
  | { ok: true; latencyMs: number; samples: number; spreadMs: number; unstable: boolean }
  | { ok: false; reason: string };
export interface CalibrationOptions { count?: number; intervalSec?: number; leadSec?: number; maxOffsetSec?: number; minSamples?: number }

/**
 * Calibración de latencia: suena una serie de clics programados sobre el reloj de audio y el usuario los sigue pulsando cualquier tecla
 * (teclado MIDI, piano en pantalla o teclado del ordenador; el micrófono no cuenta). La latencia estimada es la MEDIANA de
 * (instante de la pulsación − instante del clic), en ms. Es una estimación: incluye el sesgo humano al seguir el pulso (quien
 * anticipa o retrasa), por eso se recomienda repetirla y seguir el clic con la mayor precisión posible.
 */
export function calibrateLatency(d: { clock: Clock; hub: InputHub; sink: ClickSink }, o: CalibrationOptions = {}): Promise<CalibrationResult> {
  const { count = 8, intervalSec = 1, leadSec = 1.5, maxOffsetSec = 0.5, minSamples = 4 } = o;
  const t0 = d.clock.audioNow() + leadSec;
  const clicks = Array.from({ length: count }, (_, i) => t0 + i * intervalSec);
  clicks.forEach((t, i) => d.sink.click(t, i % 4 === 0));
  const used = new Set<number>(); const offsets: number[] = [];
  const off = d.hub.subscribe((e) => {
    if (e.kind !== 'on' || e.source === 'mic') return;
    const at = d.clock.perfToAudio(e.tMs);
    let best = -1, bd = Infinity;
    clicks.forEach((c, i) => { const dist = Math.abs(at - c); if (!used.has(i) && dist < bd) { bd = dist; best = i; } });
    if (best >= 0 && bd <= maxOffsetSec) { used.add(best); offsets.push(at - clicks[best]!); }
  });
  return new Promise((resolve) => {
    setTimeout(() => {
      off();
      if (offsets.length < minSamples) { resolve({ ok: false, reason: `Solo se registraron ${offsets.length} pulsaciones de ${count}; hacen falta al menos ${minSamples}. Pulsa una tecla con cada clic.` }); return; }
      const s = [...offsets].sort((a, b) => a - b), med = s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
      const spread = (s[Math.floor(s.length * 0.75)]! - s[Math.floor(s.length * 0.25)]!) * 1000;
      resolve({ ok: true, latencyMs: Math.max(-300, Math.min(300, Math.round(med * 1000))), samples: offsets.length, spreadMs: Math.round(spread), unstable: spread > 100 });
    }, (leadSec + count * intervalSec + 0.6) * 1000);
  });
}
