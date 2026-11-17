import path from 'node:path';
import { REPO_ROOT, BACKUPS_TO_KEEP, loadAuthorizedRoots, readSettings, resolveActiveRoot, settingsPath } from './config';
import { LibraryRepository } from './library/repository';
import { LibraryError } from './library/errors';
import { createApp } from './server';

const port = Number(process.env.PORT ?? 4173);
const dev = process.env.PIANOTUTOR_DEV === '1';

async function main() {
  const roots = loadAuthorizedRoots();
  const { root, warning } = resolveActiveRoot(roots, readSettings(settingsPath()));
  const repo = new LibraryRepository(root, { seedDir: path.join(REPO_ROOT, 'backend', 'seed'), backupsToKeep: BACKUPS_TO_KEEP });
  await repo.init();
  const app = await createApp({
    repo, port, roots, settingsFile: settingsPath(), rootWarning: warning,
    staticDir: path.join(REPO_ROOT, 'frontend', 'dist'),
    extraOrigins: dev ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [],
  });
  const shutdown = async () => { await app.close(); await repo.dispose(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  await app.listen({ host: '127.0.0.1', port });
  console.log(`Piano Tutor en http://127.0.0.1:${port}  (biblioteca: ${root})`);
  if (warning) console.warn(warning);
}

main().catch((e) => {
  console.error(e instanceof LibraryError ? `Error: ${e.message}` : e);
  process.exit(1);
});
