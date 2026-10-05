import { createApp, files, server } from '@databricks/appkit';
import type { Request, Response } from 'express';
import { strToU8, zipSync } from 'fflate';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { filesForGame, groupGames, isSafeFilename, listRoms, type GameEntry } from './games';
import { localDirStorage, readAll, volumeStorage, type Storage, type StoredFile } from './storage';

/**
 * Volume key for the Files plugin (its manifest-required default key). The
 * path comes from `DATABRICKS_VOLUME_FILES` in app.yaml and is configurable at
 * deploy time. ROMs live under `roms/`, disk images under `games/` and
 * screenshots under `screenshots/<game key>/`.
 */
const VOLUME_KEY = 'files';
const GAMES_DIR = 'games';
const ROMS_DIR = 'roms';
const SHOTS_DIR = 'screenshots';

/** Matches the Files plugin's `maxUploadSize` so both modes accept the same files. */
const MAX_UPLOAD_SIZE = 500_000_000;
const MAX_SCREENSHOT_SIZE = 10_000_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * `volume` (default): files live in the UC Volume, accessed as the signed-in
 * user. `local`: files live in LOCAL_STORAGE_DIR on disk and the app runs with
 * no Databricks workspace at all — for development on a laptop.
 */
const STORAGE_MODE = (process.env.STORAGE_MODE ?? 'volume').toLowerCase();
const LOCAL_MODE = STORAGE_MODE === 'local';
const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR ?? './data';

const EMULATORJS_SOURCE = (process.env.EMULATORJS_SOURCE ?? 'local').toLowerCase();
const EMULATORJS_CDN_URL = 'https://cdn.emulatorjs.org/stable/data/';
const EMULATORJS_LOCAL_PATH = '/emulatorjs/';

/**
 * Content-Security-Policy for local EmulatorJS assets (ported from the original
 * app): scripts only from 'self' (EmulatorJS needs eval + blob: workers), and
 * the network only to 'self' plus the CDN's harmless version check. Not sent in
 * CDN mode, where scripts come from cdn.emulatorjs.org. Dev mode also allows
 * the Vite HMR websocket.
 */
const CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
  `connect-src 'self' blob: data: https://cdn.emulatorjs.org${process.env.NODE_ENV === 'development' ? ' ws: wss:' : ''}`,
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
].join('; ');

type AppConfig = NonNullable<Parameters<typeof createApp>[0]>;

/**
 * Local mode has no workspace, but AppKit resolves the current user and
 * workspace ID once at startup. Hand it a stub client that answers that one
 * call; nothing else touches it because the Files plugin isn't registered.
 */
function localModeClient(): AppConfig['client'] {
  process.env.DATABRICKS_WORKSPACE_ID ??= 'local';
  return { currentUser: { me: () => Promise.resolve({ id: 'local-dev' }) } } as unknown as AppConfig['client'];
}

/** Read a request body into memory, failing once it exceeds `limit` bytes. */
async function readBody(req: Request, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new Error(`Body exceeds ${limit} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Stream a stored file to the client. */
async function sendFile(res: Response, file: StoredFile, contentType: string, maxAge: number): Promise<void> {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
  if (file.size !== undefined) res.setHeader('Content-Length', String(file.size));
  await pipeline(Readable.fromWeb(file.stream), res);
}

// Deployed apps must bind 0.0.0.0 (AppKit's default) so the Databricks Apps
// proxy can reach them. Local mode runs on a laptop, so bind loopback only
// unless FLASK_RUN_HOST (AppKit's host override) says otherwise.
const serverPlugin = server(LOCAL_MODE ? { host: process.env.FLASK_RUN_HOST ?? '127.0.0.1' } : undefined);
const filesPlugin = files({
  volumes: {
    files: {
      // Run every file operation as the signed-in user. Access is governed
      // by that user's Unity Catalog grants on the volume (READ/WRITE_VOLUME).
      auth: 'on-behalf-of-user',
      // UC enforces per-user access; this app-level gate simply permits the
      // read + write actions the emulator and uploader need.
      policy: files.policy.allowAll(),
      // Kickstart ROMs / disk images can be large; raise the upload ceiling.
      maxUploadSize: MAX_UPLOAD_SIZE,
    },
  },
});
type VolumePlugins = [typeof serverPlugin, typeof filesPlugin];
// Local mode drops the Files plugin (it needs a real volume). The cast keeps the
// typed `appkit.files` accessor; it is only ever called in volume mode.
const plugins: VolumePlugins = LOCAL_MODE ? ([serverPlugin] as unknown as VolumePlugins) : [serverPlugin, filesPlugin];

await createApp({
  plugins,
  client: LOCAL_MODE ? localModeClient() : undefined,
  disableInternalTelemetry: LOCAL_MODE,
  onPluginsReady(appkit) {
    const storage: Storage = LOCAL_MODE
      ? localDirStorage(LOCAL_STORAGE_DIR)
      : volumeStorage((req) => appkit.files(VOLUME_KEY).asUser(req));
    if (LOCAL_MODE) console.log(`[amiga] local storage mode: ${LOCAL_STORAGE_DIR}`);

    appkit.server.extend((app) => {
      // --- Security headers --------------------------------------------
      // No COOP/COEP: the vendored PUAE core is the non-threaded build, so it
      // needs no SharedArrayBuffer / cross-origin isolation. Leaving them off
      // keeps CDN mode and the App Builder preview iframe working.
      app.use((_req, res, next) => {
        if (EMULATORJS_SOURCE === 'local') res.setHeader('Content-Security-Policy', CSP);
        next();
      });

      // Runtime config for the frontend (which EmulatorJS assets to load).
      app.get('/api/config', (_req, res) => {
        res.json({
          emulatorjs_source: EMULATORJS_SOURCE,
          emulatorjs_path: EMULATORJS_SOURCE === 'cdn' ? EMULATORJS_CDN_URL : EMULATORJS_LOCAL_PATH,
          storage: LOCAL_MODE ? 'local' : 'volume',
          volume: LOCAL_MODE ? null : (process.env[`DATABRICKS_VOLUME_${VOLUME_KEY.toUpperCase()}`] ?? null),
        });
      });

      // Discovered Kickstart ROMs with detected Amiga model.
      app.get('/api/roms', async (req, res) => {
        const roms = listRoms(await storage.list(req, ROMS_DIR));
        res.json({ roms });
      });

      // Discovered games with multi-disk grouping.
      app.get('/api/games', async (req, res) => {
        const games = groupGames(await storage.list(req, GAMES_DIR));
        res.json({ games });
      });

      // Generate a ZIP (M3U playlist + ADFs) for a multi-disk game so the PUAE
      // core can swap disks via the EmulatorJS menu.
      app.get('/api/games/:slug/bundle', async (req, res) => {
        try {
          const games = groupGames(await storage.list(req, GAMES_DIR));
          const game = games.find((g: GameEntry) => g.slug === req.params.slug);
          if (!game || !game.disks) {
            res.status(404).json({ error: 'Game not found' });
            return;
          }

          const m3uLines = game.disks.map((d) => d.filename);
          if (game.hasSaveDisk) m3uLines.push('#SAVEDISK:SaveDisk');

          const bundle: Record<string, Uint8Array> = {
            [`${game.name} (MD).m3u`]: strToU8(m3uLines.join('\n') + '\n'),
          };
          for (const disk of game.disks) {
            bundle[disk.filename] = await readAll(await storage.download(req, `${GAMES_DIR}/${disk.filename}`));
          }

          const safeName = game.name.replace(/[^a-zA-Z0-9_ -]/g, '');
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `inline; filename="${safeName}.zip"`);
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.send(Buffer.from(zipSync(bundle)));
        } catch (err) {
          console.error('[amiga] bundle failed', err);
          res.status(500).json({ error: 'Failed to build game bundle' });
        }
      });

      // Stream a single ROM / disk image with the real filename (and thus the
      // extension) preserved in the URL path. EmulatorJS derives the file type
      // from `gameUrl.split('/').pop()`, so the Files plugin's `?path=` query
      // URL (which ends in "raw") would break floppy-image detection. This
      // route gives the emulator an extension-correct URL. Uploads/listing
      // still go through the Files plugin (or the local equivalent below).
      app.get('/api/content/:kind/:filename', async (req, res) => {
        const { kind, filename } = req.params;
        if ((kind !== GAMES_DIR && kind !== ROMS_DIR) || !isSafeFilename(filename)) {
          res.status(400).json({ error: 'Invalid content path' });
          return;
        }
        let file: StoredFile;
        try {
          file = await storage.download(req, `${kind}/${filename}`);
        } catch (err) {
          console.error('[amiga] content lookup failed', err);
          res.status(404).json({ error: 'File not found' });
          return;
        }
        try {
          await sendFile(res, file, 'application/octet-stream', 300);
        } catch (err) {
          // Headers are already sent once streaming starts; just drop the socket.
          console.error('[amiga] content stream failed', err);
          res.destroy();
        }
      });

      // Local-mode stand-in for the Files plugin's upload route, at the same
      // URL so the client is identical in both modes.
      if (LOCAL_MODE) {
        app.post(`/api/files/${VOLUME_KEY}/upload`, async (req, res) => {
          const target = typeof req.query.path === 'string' ? req.query.path : '';
          const [dir, name, ...rest] = target.split('/');
          if ((dir !== GAMES_DIR && dir !== ROMS_DIR) || !name || rest.length > 0 || !isSafeFilename(name)) {
            res.status(400).json({ error: 'Invalid upload path' });
            return;
          }
          if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD_SIZE) {
            res.status(413).json({ error: `File exceeds ${MAX_UPLOAD_SIZE} bytes` });
            return;
          }
          try {
            await storage.upload(req, target, Readable.toWeb(req) as WebReadableStream<Uint8Array>);
            res.json({ success: true });
          } catch (err) {
            console.error('[amiga] local upload failed', err);
            res.status(500).json({ error: 'Upload failed' });
          }
        });
      }

      // --- Screenshots ---------------------------------------------------
      // PNGs captured from the emulator canvas, stored per game under
      // screenshots/<game key>/<epoch ms>.png (as the signed-in user).
      const shotDir = (game: string) => `${SHOTS_DIR}/${game}`;

      app.get('/api/screenshots/:game', async (req, res) => {
        const { game } = req.params;
        if (!isSafeFilename(game)) {
          res.status(400).json({ error: 'Invalid game key' });
          return;
        }
        const names = (await storage.list(req, shotDir(game))).filter((n) => n.endsWith('.png'));
        // Newest first; names are epoch-ms so a numeric sort orders them.
        names.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
        res.json({ screenshots: names });
      });

      app.get('/api/screenshots/:game/:file', async (req, res) => {
        const { game, file } = req.params;
        if (!isSafeFilename(game) || !isSafeFilename(file) || !file.endsWith('.png')) {
          res.status(400).json({ error: 'Invalid screenshot path' });
          return;
        }
        let stored: StoredFile;
        try {
          stored = await storage.download(req, `${shotDir(game)}/${file}`);
        } catch {
          res.status(404).json({ error: 'Screenshot not found' });
          return;
        }
        try {
          // Screenshot names are never reused, so they can be cached for long.
          await sendFile(res, stored, 'image/png', 86_400);
        } catch (err) {
          console.error('[amiga] screenshot stream failed', err);
          res.destroy();
        }
      });

      app.post('/api/screenshots/:game', async (req, res) => {
        const { game } = req.params;
        if (!isSafeFilename(game)) {
          res.status(400).json({ error: 'Invalid game key' });
          return;
        }
        let body: Buffer;
        try {
          body = await readBody(req, MAX_SCREENSHOT_SIZE);
        } catch {
          res.status(413).json({ error: 'Screenshot too large' });
          return;
        }
        if (!body.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
          res.status(400).json({ error: 'Screenshot must be a PNG' });
          return;
        }
        const name = `${Date.now()}.png`;
        try {
          await storage.upload(req, `${shotDir(game)}/${name}`, body);
          res.json({ name });
        } catch (err) {
          console.error('[amiga] screenshot save failed', err);
          res.status(500).json({ error: 'Failed to save screenshot' });
        }
      });

      // Map a delete error to a client response. The App Builder *preview*
      // sandbox blocks the Unity Catalog file-delete endpoint, so surface that
      // clearly rather than as a generic failure — it works once deployed.
      const sendDeleteError = (res: Response, label: string, err: unknown) => {
        const code = (err as { errorCode?: unknown } | null)?.errorCode;
        if (code === 'BLOCKED_BY_APP_BUILDER_SANDBOX') {
          res.status(403).json({
            error:
              'Deleting files is blocked in the App Builder preview sandbox. This works once the app is deployed (it then runs as you against the volume).',
          });
          return;
        }
        res.status(500).json({ error: `Failed to delete ${label}` });
      };

      app.delete('/api/screenshots/:game/:file', async (req, res) => {
        const { game, file } = req.params;
        if (!isSafeFilename(game) || !isSafeFilename(file) || !file.endsWith('.png')) {
          res.status(400).json({ error: 'Invalid screenshot path' });
          return;
        }
        try {
          await storage.delete(req, `${shotDir(game)}/${file}`);
          res.json({ success: true });
        } catch (err) {
          console.error('[amiga] delete screenshot failed', err);
          sendDeleteError(res, 'screenshot', err);
        }
      });

      // Delete a whole game — all of its disks and its save disk — as the
      // signed-in user. The save disk is hidden from the grouped game entry, so
      // this resolves the full file set server-side rather than trusting the
      // client. Every file is attempted; a partial failure returns 207 with
      // the files that were and weren't deleted.
      app.delete('/api/games/:key', async (req, res) => {
        const targets = filesForGame(await storage.list(req, GAMES_DIR), req.params.key);
        if (targets.length === 0) {
          res.status(404).json({ error: 'Game not found' });
          return;
        }
        const deleted: string[] = [];
        const failed: string[] = [];
        let lastError: unknown;
        for (const name of targets) {
          try {
            await storage.delete(req, `${GAMES_DIR}/${name}`);
            deleted.push(name);
          } catch (err) {
            console.error(`[amiga] delete ${name} failed`, err);
            failed.push(name);
            lastError = err;
          }
        }
        if (failed.length === 0) {
          res.json({ success: true, deleted });
        } else if (deleted.length === 0) {
          sendDeleteError(res, 'game', lastError);
        } else {
          res.status(207).json({
            success: false,
            deleted,
            failed,
            error: `Deleted ${deleted.length} of ${targets.length} files; could not delete: ${failed.join(', ')}`,
          });
        }
      });

      // Delete a single Kickstart ROM as the signed-in user.
      app.delete('/api/roms/:filename', async (req, res) => {
        const { filename } = req.params;
        if (!isSafeFilename(filename)) {
          res.status(400).json({ error: 'Invalid ROM filename' });
          return;
        }
        try {
          await storage.delete(req, `${ROMS_DIR}/${filename}`);
          res.json({ success: true });
        } catch (err) {
          console.error('[amiga] delete rom failed', err);
          sendDeleteError(res, 'ROM', err);
        }
      });
    });
  },
}).catch(console.error);
