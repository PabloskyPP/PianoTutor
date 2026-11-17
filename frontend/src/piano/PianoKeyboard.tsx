import { NOTE_NAMES_ES } from '@pianotutor/shared';

const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);

export type KeyFlash = 'ok' | 'bad';
export interface PianoKeyboardProps {
  lo?: number; hi?: number;             // por defecto Do4 (60) a Do6 (84), igual que el original
  next: ReadonlySet<number>;            // teclas a tocar (naranja)
  flashes: Readonly<Record<number, KeyFlash>>;
  kbRef?: React.Ref<HTMLDivElement>;
}

/** Piano virtual. Misma estructura DOM y clases (.kb > .w/.b) que el original. */
export function PianoKeyboard({ lo = 60, hi = 84, next, flashes, kbRef }: PianoKeyboardProps) {
  const total = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const nWhite = total.filter((m) => !isBlack(m)).length, ww = 100 / nWhite;
  let wi = 0;
  const keys = total.map((m) => {
    const cls = (next.has(m) ? ' next' : '') + (flashes[m] ? ' ' + flashes[m] : '');
    if (isBlack(m)) return <div key={m} className={'b' + cls} data-m={m} data-n={NOTE_NAMES_ES[m % 12]} style={{ left: wi * ww - ww * 0.3 + '%', width: ww * 0.6 + '%' }} />;
    const el = <div key={m} className={'w' + cls} data-m={m} data-n={NOTE_NAMES_ES[m % 12]} style={{ left: wi * ww + '%', width: ww + '%' }} />;
    wi++; return el;
  });
  return <div className="kb" id="kb" ref={kbRef}>{keys}</div>;
}
