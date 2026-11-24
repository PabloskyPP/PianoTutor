import { describe, it, expect, vi, afterEach } from 'vitest';
import { calibrateLatency } from '../../frontend/src/audio/calibrate';
import { InputHub } from '../../frontend/src/input/hub';
import type { Clock } from '../../frontend/src/audio/clock';

class FakeClock implements Clock {
  audio = 50; perf = 2000;
  advance(s: number) { this.audio += s; this.perf += s * 1000; }
  audioNow() { return this.audio; } perfNow() { return this.perf; } perfToAudio(p: number) { return this.audio + (p - this.perf) / 1000; }
}
afterEach(() => { vi.useRealTimers(); });

/** Simula a un usuario que pulsa `delayMs[i]` después de cada clic (null = se salta ese clic). */
const run = async (delays: (number | null)[], opts: { source?: 'midi' | 'mic' | 'virtual'; extra?: { atSec: number; source?: any }[] } = {}) => {
  vi.useFakeTimers(); const c = new FakeClock(), hub = new InputHub(); const times: number[] = [];
  const p = calibrateLatency({ clock: c, hub, sink: { click: (t) => times.push(t) } });
  const base = c.audio; const evs: { at: number; src: string }[] = [];
  delays.forEach((d, i) => { if (d !== null) evs.push({ at: times[i]! + d / 1000, src: opts.source ?? 'midi' }); });
  (opts.extra ?? []).forEach((x) => evs.push({ at: base + x.atSec, src: x.source ?? 'midi' })); evs.sort((a, b) => a.at - b.at);
  for (const e of evs) { const dt = e.at - c.audio; if (dt > 0) { c.advance(dt); await vi.advanceTimersByTimeAsync(dt * 1000); } hub.emit({ kind: 'on', midi: 60, tMs: c.perf, source: e.src as any }); }
  await vi.advanceTimersByTimeAsync(20000); return { r: await p, times };
};

describe('calibración de latencia', () => {
  it('programa 8 clics separados 1 s sobre el reloj de audio', async () => { const { times } = await run([0, 0, 0, 0, 0, 0, 0, 0]); expect(times).toHaveLength(8); times.forEach((t, i) => expect(t).toBeCloseTo(51.5 + i, 9)); });
  it('estima la latencia como la mediana (resistente a una pulsación atípica)', async () => {
    const { r } = await run([82, 78, 80, 81, 79, 400, 80, 83]); expect(r).toMatchObject({ ok: true, latencyMs: 81, samples: 8, unstable: false });
  });
  it('latencia negativa (quien anticipa): se devuelve con signo', async () => { const { r } = await run([-40, -45, -38, -42, -41, -40, -39, -44]); expect(r.ok && r.latencyMs).toBe(-40); });   // mediana = -40,5 → -40
  it('con pocas pulsaciones falla con un mensaje útil y no inventa un valor', async () => {
    const { r } = await run([80, null, 80, null, null, null, null, 80]); expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/3 pulsaciones de 8.*al menos 4/) });
  });
  it('ignora el micrófono y las pulsaciones lejos de cualquier clic', async () => {
    expect((await run([80, 80, 80, 80, 80, 80, 80, 80], { source: 'mic' })).r.ok).toBe(false);
    const { r } = await run([60, 60, 60, 60, null, null, null, null], { extra: [{ atSec: 0.2 }, { atSec: 9.9 }] }); expect(r).toMatchObject({ ok: true, samples: 4, latencyMs: 60 });
  });
  it('cada clic se asocia a una sola pulsación (una doble pulsación no cuenta dos veces)', async () => {
    const { r } = await run([80, 80, 80, 80, null, null, null, null], { extra: [{ atSec: 1.58 }] }); expect(r.ok && r.samples).toBeLessThanOrEqual(5);
  });
  it('avisa si las pulsaciones son muy irregulares', async () => { expect((await run([-150, 200, -100, 250, -120, 220, -90, 260])).r).toMatchObject({ ok: true, unstable: true }); });
  it('se da de baja del hub al terminar (sin escuchas colgadas)', async () => {
    vi.useFakeTimers(); const hub = new InputHub(); const c = new FakeClock(); const p = calibrateLatency({ clock: c, hub, sink: { click: () => {} } }); expect(hub.listenerCount).toBe(1); await vi.advanceTimersByTimeAsync(20000); await p; expect(hub.listenerCount).toBe(0);
  });
});
