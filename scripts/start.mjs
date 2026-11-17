// Arranque de Piano Tutor: comprueba Node, compila si hace falta, inicia el servidor local y abre el navegador.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT ?? '4173';
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) { console.error(`Piano Tutor necesita Node 20 o superior (tienes ${process.versions.node}).`); process.exit(1); }
if (!fs.existsSync(path.join(root, 'node_modules'))) { console.error('Faltan las dependencias. Ejecuta primero: npm install'); process.exit(1); }

const newest = (dir) => {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
};
const dist = path.join(root, 'frontend', 'dist', 'index.html');
const srcTime = Math.max(newest(path.join(root, 'frontend', 'src')), newest(path.join(root, 'shared', 'src')), fs.statSync(path.join(root, 'frontend', 'index.html')).mtimeMs);
if (!fs.existsSync(dist) || fs.statSync(dist).mtimeMs < srcTime) {
  console.log('Compilando la interfaz…');
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', 'frontend'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error('La compilación falló.'); process.exit(1); }
}

const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const server = spawn(process.execPath, [tsx, path.join(root, 'backend', 'src', 'main.ts')], { cwd: root, stdio: 'inherit', env: { ...process.env, PORT: port } });
server.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));

const url = `http://127.0.0.1:${port}/`;
const open = () => {
  if (process.env.PIANOTUTOR_NO_OPEN === '1') return;
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => console.log(`Abre ${url} en Chrome o Edge.`)).unref();
};
for (let i = 0; i < 50; i++) {
  try { const r = await fetch(`${url}api/health`); if (r.ok) { open(); break; } } catch { /* aún arrancando */ }
  await new Promise((r) => setTimeout(r, 200));
}
