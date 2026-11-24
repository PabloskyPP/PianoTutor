import { useEffect, useRef } from 'react';
import { NOTE_NAMES_ES } from '@pianotutor/shared';

const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);

export type KeyFlash = 'ok' | 'bad' | 'warn';
export const WIDE_WHITE_KEYS = 35;          // a partir de aquí el piano se desplaza horizontalmente en vez de estrecharse
const MIN_WHITE_PX = 26;
export interface PianoKeyboardProps {
  lo?: number; hi?: number;             // por defecto Do4 (60) a Do6 (84), igual que el original
  next: ReadonlySet<number>;            // teclas a tocar (naranja)
  flashes: Readonly<Record<number, KeyFlash>>;
  kbRef?: React.Ref<HTMLDivElement>;
}
export const whiteKeys = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((m) => !isBlack(m)).length;

/**
 * Piano virtual. Misma estructura DOM y clases (.kb > .w/.b) que el original. Con un rango muy amplio (más de 35 teclas blancas)
 * el teclado se envuelve en un contenedor con desplazamiento horizontal y se centra solo en las teclas a tocar.
 */
export function PianoKeyboard({ lo = 60, hi = 84, next, flashes, kbRef }: PianoKeyboardProps) {
  const total = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const nWhite = whiteKeys(lo, hi), ww = 100 / nWhite, wide = nWhite > WIDE_WHITE_KEYS;
  let wi = 0;
  const keys = total.map((m) => {
    const cls = (next.has(m) ? ' next' : '') + (flashes[m] ? ' ' + flashes[m] : '');
    if (isBlack(m)) return <div key={m} className={'b' + cls} data-m={m} data-n={NOTE_NAMES_ES[m % 12]} style={{ left: wi * ww - ww * 0.3 + '%', width: ww * 0.6 + '%' }} />;
    const el = <div key={m} className={'w' + cls} data-m={m} data-n={NOTE_NAMES_ES[m % 12]} style={{ left: wi * ww + '%', width: ww + '%' }} />;
    wi++; return el;
  });
  const wrap = useRef<HTMLDivElement>(null);
  const nextKey = [...next].join(',');
  useEffect(() => {   // centra las teclas pendientes cuando el piano es más ancho que la pantalla
    const box = wrap.current; if (!wide || !box || !next.size) return;
    const els = [...next].map((m) => box.querySelector<HTMLElement>(`[data-m="${m}"]`)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const left = Math.min(...els.map((e) => e.offsetLeft)), right = Math.max(...els.map((e) => e.offsetLeft + e.offsetWidth));
    if (left >= box.scrollLeft + 20 && right <= box.scrollLeft + box.clientWidth - 20) return;      // ya se ven
    box.scrollTo?.({ left: Math.max(0, (left + right) / 2 - box.clientWidth / 2), behavior: 'smooth' });
  }, [wide, nextKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const kb = <div className="kb" id="kb" ref={kbRef} style={wide ? { minWidth: nWhite * MIN_WHITE_PX } : undefined}>{keys}</div>;
  return wide ? <div className="kbscroll" ref={wrap} data-added="true">{kb}</div> : kb;
}
