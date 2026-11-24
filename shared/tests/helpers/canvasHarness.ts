/** Arnés visual: canvas real (@napi-rs/canvas) con la fuente musical local, y ejecución del draw() ORIGINAL del HTML de referencia. */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts, type Canvas } from '@napi-rs/canvas';

const root = path.resolve(__dirname, '../..');
export const fontOk = (() => { try { return !!GlobalFonts.registerFromPath(path.join(root, 'node_modules/@fontsource/noto-music/files/noto-music-music-400-normal.woff'), 'Noto Music'); } catch { return false; } })();

const html = fs.readFileSync(path.join(root, 'tests/regression/original/piano-tutor.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
const defs = script.slice(script.indexOf('const LET'), script.indexOf('const $='));
const drawSrc = script.slice(script.indexOf("const cv=$('cv')"), script.indexOf('// Arranque'));

/** Dibuja con el código ORIGINAL (tal cual está en el HTML) la canción `title` con la nota `pos` seleccionada. */
export function renderOriginal(title: string, pos: number, W = 900, H = 210): Canvas {
  const canvas = createCanvas(W, H); const g = canvas.getContext('2d');
  const fakeCv = { getContext: () => g, clientWidth: W, clientHeight: H, width: W, height: H };
  const fn = new Function('$', 'devicePixelRatio', 'requestAnimationFrame', 'title', 'P', `${defs}\nlet notes=parse(SONGS[title]),pos=P,view=P;\n${drawSrc}\ndraw();`);
  fn(() => fakeCv, 1, () => 0, title, pos);
  return canvas;
}
export const pixels = (c: Canvas): Buffer => c.getContext('2d').getImageData(0, 0, c.width, c.height).data as unknown as Buffer;
export const diffCount = (a: Canvas, b: Canvas): number => { const x = pixels(a), y = pixels(b); let n = 0; for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2] || x[i + 3] !== y[i + 3]) n++; return n; };
/** Un canvas «falso» con la forma que usa el renderer (clientWidth/Height, width/height, getContext) respaldado por uno real. */
export function fakeCanvasEl(W: number, H: number) {
  const c = createCanvas(W, H); const el: any = { clientWidth: W, clientHeight: H, get width() { return c.width; }, set width(v: number) { c.width = v; }, get height() { return c.height; }, set height(v: number) { c.height = v; }, getContext: () => c.getContext('2d') };
  return { el: el as HTMLCanvasElement, canvas: c };
}
export const savePng = (c: Canvas, file: string) => fs.writeFileSync(file, c.toBuffer('image/png'));
