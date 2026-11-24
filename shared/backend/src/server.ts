import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { LibraryRepository } from './library/repository';
import { LibraryError } from './library/errors';
import { writeFileAtomic } from './library/atomic';
import { MAX_BODY_BYTES, readSettings, type Settings } from './config';
import { DEFAULT_PREFERENCES, mergePreferences, sanitizePreferences } from '@pianotutor/shared';
import { previewImport, prepareImport } from './library/importService';

export interface AppDeps {
  repo: LibraryRepository;
  port: number;
  roots: string[];
  settingsFile: string;
  staticDir?: string;
  /** Orígenes extra permitidos (solo desarrollo: servidor de Vite). */
  extraOrigins?: string[];
  rootWarning?: string;
}

export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: MAX_BODY_BYTES });
  const hosts = new Set([`127.0.0.1:${deps.port}`, `localhost:${deps.port}`]);
  const origins = new Set([`http://127.0.0.1:${deps.port}`, `http://localhost:${deps.port}`, ...(deps.extraOrigins ?? [])]);
  for (const o of deps.extraOrigins ?? []) hosts.add(new URL(o).host);

  // Protección frente a DNS rebinding y peticiones desde otras webs.
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    const origin = req.headers.origin;
    if (!hosts.has(host) || (origin !== undefined && !origins.has(origin))) {
      return reply.code(403).send({ error: 'Petición no permitida.' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof LibraryError) return reply.code(err.status).send({ error: err.message, code: err.code, details: err.details });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: status === 413 ? 'Archivo demasiado grande.' : status < 500 ? 'Petición no válida.' : 'Error interno del servidor.' });
  });

  app.get('/api/health', async () => ({ ok: true, root: deps.repo.root, warning: deps.rootWarning ?? null }));

  app.get('/api/songs', async () => deps.repo.list());
  app.get<{ Params: { id: string } }>('/api/songs/:id', async (req) => deps.repo.get(req.params.id));
  const revisionOf = (raw: unknown) => (typeof raw === 'string' && /^"?\d+"?$/.test(raw) ? Number(raw.replace(/"/g, '')) : undefined);
  app.put<{ Params: { id: string } }>('/api/songs/:id', async (req) => deps.repo.update(req.params.id, req.body, revisionOf(req.headers['if-match'])));
  app.patch<{ Params: { id: string } }>('/api/songs/:id/metadata', async (req) => deps.repo.updateMetadata(req.params.id, req.body, revisionOf(req.headers['if-match'])));
  app.delete<{ Params: { id: string } }>('/api/songs/:id', async (req) => deps.repo.delete(req.params.id, revisionOf(req.headers['if-match'])));
  app.post<{ Params: { id: string }; Body: { title?: unknown } }>('/api/songs/:id/save-as', async (req, reply) => {
    const song = await deps.repo.saveAs(req.params.id, (req.body as { title?: unknown } | undefined)?.title);
    return reply.code(201).send(song);
  });

  // Importación: el cuerpo es el archivo en bruto; el servidor lo analiza (la misma ruta de código en previsualizar y guardar).
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_BODY_BYTES }, (_req, body, done) => done(null, body));
  const fileBody = (b: unknown): Uint8Array => { if (!(b instanceof Uint8Array) || b.length === 0) throw new LibraryError('INVALID', 'No se recibió ningún archivo (el cuerpo debe enviarse como application/octet-stream).'); return b; };
  app.post('/api/import/preview', async (req) => previewImport(fileBody(req.body), req.query));
  app.post('/api/import', async (req, reply) => {
    const bytes = fileBody(req.body);
    const { song, ext } = prepareImport(bytes, req.query);
    return reply.code(201).send(await deps.repo.createImported(song, bytes, ext));
  });

  // settings.json: lectura-modificación-escritura serializada (así un cambio no borra otras claves ni dos peticiones se pisan).
  let queue: Promise<unknown> = Promise.resolve();
  const updateSettings = <T>(fn: (s: Settings) => { next: Settings; result: T }): Promise<T> => {
    const run = queue.then(async () => {
      const { next, result } = fn(readSettings(deps.settingsFile));
      await fs.promises.mkdir(path.dirname(deps.settingsFile), { recursive: true });
      await writeFileAtomic(deps.settingsFile, JSON.stringify(next, null, 2) + '\n');
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  };

  // Ajustes de biblioteca: el navegador solo elige entre raíces ya autorizadas, por índice; nunca envía rutas.
  app.get('/api/settings', async () => ({
    roots: deps.roots.map((p, index) => ({ index, path: p, active: p === deps.repo.root })),
  }));
  app.put<{ Body: { rootIndex?: unknown } }>('/api/settings', async (req) => {
    const i = (req.body as { rootIndex?: unknown } | undefined)?.rootIndex;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= deps.roots.length) throw new LibraryError('INVALID', 'Biblioteca no autorizada.');
    return updateSettings((cur) => ({ next: { ...cur, libraryRoot: deps.roots[i]! }, result: { restartRequired: deps.roots[i] !== deps.repo.root } }));
  });

  // Preferencias de interpretación (tolerancias, latencia, micrófono…). Un archivo dañado o antiguo vuelve a los valores por defecto campo a campo.
  app.get('/api/preferences', async () => ({ preferences: sanitizePreferences(readSettings(deps.settingsFile).preferences ?? DEFAULT_PREFERENCES) }));
  app.put('/api/preferences', async (req) => {
    const patch = req.body;
    // Se valida contra las preferencias actuales ANTES de escribir; si falla, no se toca el archivo.
    return updateSettings((cur) => {
      const m = mergePreferences(sanitizePreferences(cur.preferences), patch);
      if (!m.ok) throw new LibraryError('INVALID', 'Preferencias no válidas.', m.errors);
      return { next: { ...cur, preferences: m.value }, result: { preferences: m.value } };
    });
  });

  if (deps.staticDir && fs.existsSync(path.join(deps.staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: deps.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado.' });
      return reply.type('text/html').sendFile('index.html');
    });
  }
  return app;
}
