import type { InputHub } from './hub';

/** Do central (60) a Re♯5 (75). Se usa e.code (posición física), así no depende de la distribución del teclado. */
export const KEY_CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP'];
const isTextTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
};

export function attachComputerKeyboard(hub: InputHub): () => void {
  const held = new Map<string, number>(); // code -> midi
  const down = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTextTarget(e.target)) return;
    const i = KEY_CODES.indexOf(e.code);
    if (i < 0 || held.has(e.code)) return;
    const midi = 60 + i; held.set(e.code, midi);
    hub.emit({ kind: 'on', midi, tMs: performance.now(), source: 'computer-keyboard' });
  };
  const up = (e: KeyboardEvent) => {
    const midi = held.get(e.code);
    if (midi === undefined) return;
    held.delete(e.code);
    hub.emit({ kind: 'off', midi, tMs: performance.now(), source: 'computer-keyboard' });
  };
  const releaseAll = () => { for (const [c, midi] of held) { held.delete(c); hub.emit({ kind: 'off', midi, tMs: performance.now(), source: 'computer-keyboard' }); } };
  addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', releaseAll);
  return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', releaseAll); releaseAll(); };
}

/** Piano virtual: pointerdown = Note On; pointerup/cancel (en window) = Note Off. */
export function attachVirtualKeyboard(el: HTMLElement, hub: InputHub): () => void {
  const held = new Map<number, number>(); // pointerId -> midi
  const down = (e: PointerEvent) => {
    const midi = Number((e.target as HTMLElement).dataset.m);
    if (!midi) return;
    held.set(e.pointerId, midi);
    hub.emit({ kind: 'on', midi, tMs: performance.now(), source: 'virtual' });
  };
  const up = (e: PointerEvent) => {
    const midi = held.get(e.pointerId);
    if (midi === undefined) return;
    held.delete(e.pointerId);
    hub.emit({ kind: 'off', midi, tMs: performance.now(), source: 'virtual' });
  };
  el.addEventListener('pointerdown', down); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  return () => { el.removeEventListener('pointerdown', down); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
}
