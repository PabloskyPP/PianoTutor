// Desarrollo: backend (con orígenes de Vite permitidos) + servidor de Vite con recarga.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (args, env = {}) => spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
const a = run([path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'backend/src/main.ts'], { PIANOTUTOR_DEV: '1' });
const b = run([path.join(root, 'node_modules/vite/bin/vite.js'), 'frontend']);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { a.kill(s); b.kill(s); });
a.on('exit', () => b.kill()); b.on('exit', () => a.kill());
