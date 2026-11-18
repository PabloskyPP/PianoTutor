import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { LibraryRepository } from './library/repository';
import { LibraryError } from './library/errors';
import { writeFileAtomic } from './library/atomic';
import { MAX_BODY_BYTES, type Settings } from './config';
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
  app.put<{ Params: { id: string } }>('/api/songs/:id', async (req) => {
    const raw = req.headers['if-match'];
    const rev = typeof raw === 'string' && /^"?\d+"?$/.test(raw) ? Number(raw.replace(/"/g, '')) : undefined;
    return deps.repo.update(req.params.id, req.body, rev);
  });
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

  // Ajustes: el navegador solo elige entre raíces ya autorizadas, por índice; nunca envía rutas.
  app.get('/api/settings', async () => ({
    roots: deps.roots.map((p, index) => ({ index, path: p, active: p === deps.repo.root })),
  }));
  app.put<{ Body: { rootIndex?: unknown } }>('/api/settings', async (req) => {
    const i = (req.body as { rootIndex?: unknown } | undefined)?.rootIndex;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= deps.roots.length) throw new LibraryError('INVALID', 'Biblioteca no autorizada.');
    const s: Settings = { libraryRoot: deps.roots[i]! };
    await fs.promises.mkdir(path.dirname(deps.settingsFile), { recursive: true });
    await writeFileAtomic(deps.settingsFile, JSON.stringify(s, null, 2) + '\n');
    return { restartRequired: s.libraryRoot !== deps.repo.root };
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
