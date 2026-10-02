import { createApp, files, server } from '@databricks/appkit';
import type { Request, Response } from 'express';
import { strToU8, zipSync } from 'fflate';
import { detectModel, filesForGame, groupGames, listRoms, type GameEntry } from './games';

/**
 * Volume key for the Files plugin (its manifest-required default key). The
 * path comes from `DATABRICKS_VOLUME_FILES` in app.yaml and is configurable at
 * deploy time. ROMs live under `roms/` and disk images under `games/`.
 */
const VOLUME_KEY = 'files';
const GAMES_DIR = 'games';
const ROMS_DIR = 'roms';

const EMULATORJS_SOURCE = (process.env.EMULATORJS_SOURCE ?? 'local').toLowerCase();
const EMULATORJS_CDN_URL = 'https://cdn.emulatorjs.org/stable/data/';
const EMULATORJS_LOCAL_PATH = '/emulatorjs/';

await createApp({
  plugins: [
    server(),
    files({
      volumes: {
        files: {
          // Run every file operation as the signed-in user. Access is governed
          // by that user's Unity Catalog grants on the volume (READ/WRITE_VOLUME).
          auth: 'on-behalf-of-user',
          // UC enforces per-user access; this app-level gate simply permits the
          // read + write actions the emulator and uploader need.
          policy: files.policy.allowAll(),
          // Kickstart ROMs / disk images can be large; raise the upload ceiling.
          maxUploadSize: 500_000_000,
        },
      },
    }),
  ],
  onPluginsReady(appkit) {
    /** List non-directory filenames in a volume subdirectory; [] on any error. */
    const listFilenames = async (req: Request, dir: string): Promise<string[]> => {
      try {
        const entries = await appkit.files(VOLUME_KEY).asUser(req).list(dir);
        return entries.filter((e) => !e.is_directory && typeof e.name === 'string').map((e) => e.name as string);
      } catch {
        // Volume unset, empty, or the user lacks READ_VOLUME — treat as "no files".
        return [];
      }
    };

    /** Read a disk image from the volume as raw bytes (for ZIP bundling). */
    const downloadBytes = async (req: Request, path: string): Promise<Uint8Array> => {
      const res = await appkit.files(VOLUME_KEY).asUser(req).download(path);
      if (!res.contents) throw new Error(`Empty download for ${path}`);
      const buf = await new Response(res.contents).arrayBuffer();
      return new Uint8Array(buf);
    };

    appkit.server.extend((app) => {
      // --- Cross-origin isolation --------------------------------------
      // COOP + COEP make SharedArrayBuffer available so EmulatorJS can run the
      // threaded PUAE WASM core. Registered before the frontend handler so it
      // applies to the HTML document and all same-origin assets.
      app.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        next();
      });

      // Runtime config for the frontend (which EmulatorJS assets to load).
      app.get('/api/config', (_req, res) => {
        res.json({
          emulatorjs_source: EMULATORJS_SOURCE,
          emulatorjs_path: EMULATORJS_SOURCE === 'cdn' ? EMULATORJS_CDN_URL : EMULATORJS_LOCAL_PATH,
          volume: process.env[`DATABRICKS_VOLUME_${VOLUME_KEY.toUpperCase()}`] ?? null,
        });
      });

      // Discovered Kickstart ROMs with detected Amiga model.
      app.get('/api/roms', async (req, res) => {
        const roms = listRoms(await listFilenames(req, ROMS_DIR));
        res.json({ roms });
      });

      // Discovered games with multi-disk grouping.
      app.get('/api/games', async (req, res) => {
        const games = groupGames(await listFilenames(req, GAMES_DIR));
        res.json({ games });
      });

      // Generate a ZIP (M3U playlist + ADFs) for a multi-disk game so the PUAE
      // core can swap disks via the EmulatorJS menu.
      app.get('/api/games/:slug/bundle', async (req, res) => {
        try {
          const games = groupGames(await listFilenames(req, GAMES_DIR));
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
            bundle[disk.filename] = await downloadBytes(req, `${GAMES_DIR}/${disk.filename}`);
          }

          const safeName = game.name.replace(/[^a-zA-Z0-9_ -]/g, '');
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `inline; filename="${safeName}.zip"`);
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
      // still go through the Files plugin.
      app.get('/api/content/:kind/:filename', async (req, res) => {
        const { kind, filename } = req.params;
        if (kind !== GAMES_DIR && kind !== ROMS_DIR) {
          res.status(400).json({ error: 'Invalid content kind' });
          return;
        }
        try {
          const bytes = await downloadBytes(req, `${kind}/${filename}`);
          res.setHeader('Content-Type', 'application/octet-stream');
          res.send(Buffer.from(bytes));
        } catch (err) {
          console.error('[amiga] content stream failed', err);
          res.status(404).json({ error: 'File not found' });
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

      // Delete a whole game — all of its disks and its save disk — as the
      // signed-in user. The save disk is hidden from the grouped game entry, so
      // this resolves the full file set server-side rather than trusting the
      // client. Runs under OBO, gated by the user's WRITE_VOLUME grant.
      app.delete('/api/games/:key', async (req, res) => {
        try {
          const names = await listFilenames(req, GAMES_DIR);
          const targets = filesForGame(names, decodeURIComponent(req.params.key));
          if (targets.length === 0) {
            res.status(404).json({ error: 'Game not found' });
            return;
          }
          for (const name of targets) {
            await appkit.files(VOLUME_KEY).asUser(req).delete(`${GAMES_DIR}/${name}`);
          }
          res.json({ success: true, deleted: targets });
        } catch (err) {
          console.error('[amiga] delete game failed', err);
          sendDeleteError(res, 'game', err);
        }
      });

      // Delete a single Kickstart ROM as the signed-in user.
      app.delete('/api/roms/:filename', async (req, res) => {
        try {
          await appkit
            .files(VOLUME_KEY)
            .asUser(req)
            .delete(`${ROMS_DIR}/${decodeURIComponent(req.params.filename)}`);
          res.json({ success: true });
        } catch (err) {
          console.error('[amiga] delete rom failed', err);
          sendDeleteError(res, 'ROM', err);
        }
      });

      // Report the detected Amiga model for a ROM filename.
      app.get('/api/model/:filename', (req, res) => {
        res.json({ model: detectModel(req.params.filename) });
      });
    });
  },
}).catch(console.error);
