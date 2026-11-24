// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addNote, noise, PIANO, reseed } from '../helpers/audio';

/** Mocks de getUserMedia y Web Audio: comprueban el CICLO DE VIDA y la integración con el analizador (no la precisión acústica real). */
let tracks: { stop: ReturnType<typeof vi.fn> }[]; let nodes: { disconnect: ReturnType<typeof vi.fn> }[]; let ctxCount: number;
let gum: ReturnType<typeof vi.fn>; let recording: Float32Array | null;
const SR = 44100;

class FakeCtx {
  sampleRate = SR; state = 'running'; constructor() { ctxCount++; }
  resume = vi.fn(async () => {});
  createAnalyser() {
    const n: any = { fftSize: 0, disconnect: vi.fn(), getFloatTimeDomainData: (b: Float32Array) => {   // la «señal» depende del tiempo virtual
      if (!recording) { b.fill(0); return; }
      const end = Math.floor((performance.now() / 1000) * SR); b.fill(0); const from = Math.max(0, end - b.length);
      b.set(recording.subarray(from, Math.min(end, recording.length)), b.length - (end - from));
    } }; nodes.push(n); return n;
  }
  createMediaStreamSource() { const n: any = { connect: vi.fn(), disconnect: vi.fn() }; nodes.push(n); return n; }
}
const newStream = () => { const t = [{ stop: vi.fn() }]; tracks.push(...t); return { getTracks: () => t } as any; };

beforeEach(() => {
  vi.useFakeTimers(); tracks = []; nodes = []; ctxCount = 0; recording = null;
  (globalThis as any).AudioContext = FakeCtx; vi.resetModules();
  gum = vi.fn(async () => newStream()); Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true });
});
afterEach(() => { vi.useRealTimers(); });
const make = async () => {
  const { MicInput } = await import('../../frontend/src/input/mic'); const onNote = vi.fn(), onStatus = vi.fn();
  return { mic: new MicInput({ sensitivity: 1, onNote, onStatus }), onNote, onStatus };
};

describe('micrófono: ciclo de vida', () => {
  it('start crea temporizador; stop libera pista, nodos y temporizador (nada queda escuchando)', async () => {
    const { mic, onNote } = await make(); await mic.start();
    expect(mic.active).toBe(true); expect(vi.getTimerCount()).toBe(1);
    mic.stop();
    expect(mic.active).toBe(false); expect(vi.getTimerCount()).toBe(0); expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    expect(nodes.every((n) => n.disconnect.mock.calls.length >= 1)).toBe(true);
    reseed(1); const b = new Float32Array(SR * 4); addNote(b, SR, 60, 1, 0.9, PIANO); recording = b; vi.advanceTimersByTime(3000); expect(onNote).not.toHaveBeenCalled();
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

describe('micrófono: integración con el analizador', () => {
  it('calibra, detecta una nota sintética con el instante del ataque y NO filtra: una nota distinta de la esperada también se entrega', async () => {
    const { mic, onNote, onStatus } = await make(); reseed(3);
    const b = new Float32Array(SR * 4); noise(b, 0.003); addNote(b, SR, 60, 1.2, 0.9, PIANO); addNote(b, SR, 67, 2.4, 0.9, PIANO); recording = b;
    await mic.start(); expect(onStatus).toHaveBeenCalledWith('calibrating'); expect(mic.calibrating).toBe(true);
    vi.advanceTimersByTime(3600);
    expect(onStatus).toHaveBeenCalledWith('listening'); expect(onNote.mock.calls.map((c) => c[0].midi)).toEqual([60, 67]);
    expect(Math.abs(onNote.mock.calls[0]![0].tMs - 1200)).toBeLessThan(40); mic.stop();
  });
  it('setSensitivity y recalibrate no rompen una sesión activa', async () => {
    const { mic } = await make(); await mic.start(); mic.setSensitivity(2); mic.recalibrate(); mic.reset(); expect(mic.calibrating).toBe(true); mic.stop();
  });
});
