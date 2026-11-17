import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(__dirname, '../../frontend/dist');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

describe.skipIf(!fs.existsSync(path.join(dist, 'index.html')))('build sin dependencias externas', () => {
  it('index.html y CSS no referencian recursos remotos (CDN, fuentes, @import)', () => {
    const files = walk(dist).filter((f) => /\.(html|css)$/.test(f));
    for (const f of files) {
      const t = fs.readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/(src|href)=["']https?:\/\//i); expect(t, f).not.toMatch(/url\(\s*["']?(https?:)?\/\//i); expect(t, f).not.toMatch(/@import\s+(url\()?["']?https?:/i);
    }
  });
  it('la fuente musical y los demás recursos están empaquetados localmente', () => {
    expect(walk(dist).some((f) => /noto-music.*\.woff2$/.test(f))).toBe(true);
  });
});
