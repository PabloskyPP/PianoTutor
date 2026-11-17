// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Mocks de getUserMedia y Web Audio: comprueban el CICLO DE VIDA (no la precisión acústica). */
let tracks: { stop: ReturnType<typeof vi.fn> }[]; let nodes: { disconnect: ReturnType<typeof vi.fn> }[]; let ctxCount: number;
let gum: ReturnType<typeof vi.fn>; let signal: Float32Array | null;

class FakeCtx {
  sampleRate = 44100; state = 'running'; constructor() { ctxCount++; }
  resume = vi.fn(async () => {});
  createAnalyser() { const n: any = { fftSize: 0, disconnect: vi.fn(), getFloatTimeDomainData: (b: Float32Array) => { if (signal) b.set(signal.subarray(0, b.length)); else b.fill(0); } }; nodes.push(n); return n; }
  createMediaStreamSource() { const n: any = { connect: vi.fn(), disconnect: vi.fn() }; nodes.push(n); return n; }
}
const sine = (hz: number, n = 2048) => Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / 44100));
const newStream = () => { const t = [{ stop: vi.fn() }]; tracks.push(...t); return { getTracks: () => t } as any; };

beforeEach(async () => {
  vi.useFakeTimers(); tracks = []; nodes = []; ctxCount = 0; signal = null;
  (globalThis as any).AudioContext = FakeCtx; vi.resetModules();
  gum = vi.fn(async () => newStream()); Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
});
afterEach(() => { vi.useRealTimers(); });
const make = async (accept = (_m: number) => true) => {
  const { MicInput } = await import('../../frontend/src/input/mic'); const onNote = vi.fn();
  return { mic: new MicInput({ accept, onNote }), onNote };
};

describe('micrófono: ciclo de vida', () => {
  it('start crea temporizador; stop libera pista, nodos y temporizador (nada queda escuchando)', async () => {
    const { mic, onNote } = await make(); await mic.start();
    expect(mic.active).toBe(true); expect(vi.getTimerCount()).toBe(1);
    mic.stop();
    expect(mic.active).toBe(false); expect(vi.getTimerCount()).toBe(0); expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    expect(nodes.every((n) => n.disconnect.mock.calls.length >= 1)).toBe(true);
    signal = sine(440); vi.advanceTimersByTime(1000); expect(onNote).not.toHaveBeenCalled();
  });
  it('stop es idempotente y start repetido no duplica temporizadores ni streams', async () => {
    const { mic } = await make(); await mic.start(); await mic.start(); expect(vi.getTimerCount()).toBe(1); expect(gum).toHaveBeenCalledTimes(1);
    mic.stop(); mic.stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it('se puede reactivar tras desactivar, reutilizando el mismo AudioContext', async () => {
    const { mic } = await make(); await mic.start(); mic.stop(); await mic.start(); expect(vi.getTimerCount()).toBe(1); expect(ctxCount).toBe(1); mic.stop();
    expect(tracks).toHaveLength(2); expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
  });
  it('stop() mientras el navegador aún pide permiso: al llegar el stream se detiene y no queda temporizador', async () => {
    let release!: (s: any) => void; gum.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const { mic } = await make(); const p = mic.start(); mic.stop(); const late = newStream(); release(late); await p;
    expect(late.getTracks()[0].stop).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0); expect(mic.active).toBe(false);
  });
  it('permiso denegado: start lanza y no deja recursos', async () => {
    gum.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    const { mic } = await make(); await expect(mic.start()).rejects.toThrow(); expect(mic.active).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it('si falla tras obtener el stream (p. ej. resume), se libera la pista', async () => {
    const { mic } = await make(); const { getAudioContext } = await import('../../frontend/src/audio/engine');
    (getAudioContext() as any).resume = vi.fn(async () => { throw new Error('suspendido'); });
    await expect(mic.start()).rejects.toThrow(); expect(tracks[0]!.stop).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('micrófono: detección heredada', () => {
  it('con señal estable y nota aceptada, emite una vez (bloqueo anti-repetición), y reset() reinicia', async () => {
    const { mic, onNote } = await make(); await mic.start(); signal = sine(440);
    vi.advanceTimersByTime(40 * 6); expect(onNote).toHaveBeenCalledTimes(1); expect(onNote).toHaveBeenCalledWith(69); mic.stop();
  });
  it('si el filtro de aceptación rechaza la nota (comportamiento heredado), no se emite', async () => {
    const { mic, onNote } = await make(() => false); await mic.start(); signal = sine(440); vi.advanceTimersByTime(400); expect(onNote).not.toHaveBeenCalled(); mic.stop();
  });
});
