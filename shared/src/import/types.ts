import type { Song, ImportIssue } from '../model/schema';

export type ImportKind = 'musicxml' | 'mxl' | 'midi';
export type QuantGrid = 'quarter' | 'eighth' | 'sixteenth' | 'thirtysecond';
export type HandMode = 'auto' | 'byTrack' | 'bySplit';

export interface MidiImportOptions {
  grid: QuantGrid;          // rejilla de cuantización (por defecto semicorchea)
  handMode: HandMode;       // 'auto': 2 pistas con notas → por pista; si no → por altura
  splitMidi: number;        // punto de división por altura (por defecto 60 = Do4); ≥ va a la mano derecha
  legatoTrim: boolean;      // recorta solapes de ≤ 1 casilla de rejilla entre notas consecutivas
}
export interface ImportOptions { hands?: 1 | 2; midi?: Partial<MidiImportOptions> }
export const DEFAULT_MIDI_OPTIONS: MidiImportOptions = { grid: 'sixteenth', handMode: 'auto', splitMidi: 60, legatoTrim: true };
export const GRID_TICKS: Record<QuantGrid, number> = { quarter: 960, eighth: 480, sixteenth: 240, thirtysecond: 120 };

/** Resultado del análisis de un archivo: todo lo musical, sin los metadatos que da el usuario. */
export interface ImportDraft {
  kind: ImportKind;
  suggestedTitle: string;
  suggestedHands: 1 | 2;
  originalPpq?: number;
  tempoMap: Song['tempoMap'];
  timeSignatures: Song['timeSignatures'];
  keySignatures: Song['keySignatures'];
  measures: Song['measures'];
  parts: Song['parts'];
  report: ImportIssue[];
  options: Record<string, string | number | boolean>;
}

/** Error de importación con mensaje apto para mostrar al usuario. */
export class ImportError extends Error {
  constructor(message: string, readonly details?: string[]) { super(message); this.name = 'ImportError'; }
}

/** Acumula avisos agrupados: un mismo código se cuenta en vez de repetirse miles de veces. */
export class Report {
  private items: ImportIssue[] = [];
  private counts = new Map<string, { idx: number; n: number; base: string }>();
  add(level: ImportIssue['level'], code: string, message: string) { this.items.push({ level, code, message }); }
  /** Registra un aviso repetible: se muestra una vez con el total («… (N veces)»). */
  count(level: ImportIssue['level'], code: string, message: string) {
    const c = this.counts.get(code);
    if (!c) { this.counts.set(code, { idx: this.items.length, n: 1, base: message }); this.items.push({ level, code, message }); }
    else { c.n++; this.items[c.idx]!.message = `${c.base} (${c.n} veces)`; }
  }
  get list(): ImportIssue[] { return this.items; }
  get hasErrors() { return this.items.some((i) => i.level === 'error'); }
}
