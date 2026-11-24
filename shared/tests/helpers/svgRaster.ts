/** Rasteriza el SVG de VexFlow con @napi-rs/canvas registrando la fuente Bravura incrustada en el propio paquete (solo para inspección visual en desarrollo). */
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';

let ready = false;
export function registerBravura(): boolean {
  if (ready) return true;
  const src = fs.readFileSync(path.resolve(__dirname, '../../node_modules/vexflow/build/esm/src/fonts/bravura.js'), 'utf8');
  const m = /data:font\/woff2;base64,([A-Za-z0-9+/=]+)/.exec(src) ?? /data:application\/font-woff2;base64,([A-Za-z0-9+/=]+)/.exec(src) ?? /base64,([A-Za-z0-9+/=]{2000,})/.exec(src);
  if (!m) return false;
  try { GlobalFonts.register(Buffer.from(m[1]!, 'base64'), 'Bravura'); ready = GlobalFonts.families.some((f) => f.family === 'Bravura'); } catch { ready = false; }
  return ready;
}
export async function svgToPng(svg: string, w: number, h: number, file: string, bg = '#f4efe4') {
  const withNs = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = await loadImage(Buffer.from(withNs));
  const c = createCanvas(w, h), g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0); fs.writeFileSync(file, c.toBuffer('image/png'));
}
