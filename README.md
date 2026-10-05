# Amiga Bricks

A web-based Commodore Amiga emulator that runs in the browser, built on
[Databricks AppKit](https://developers.databricks.com/docs/appkit/v0/) and
powered by [EmulatorJS](https://emulatorjs.org/) (PUAE core). Kickstart ROMs and
game disk images are stored in a **Unity Catalog Volume** and streamed to the
emulator on behalf of the signed-in user.

## How it works

- **Storage** — ROMs live under `roms/`, disk images under `games/` and
  screenshots under `screenshots/<game>/` inside a Unity Catalog Volume. The
  volume is the app's `files` resource, set with the bundle's `volume` variable
  in `databricks.yml` and exposed to the app as `DATABRICKS_VOLUME_FILES`. For local development the same layout
  can live in a plain directory instead (see [Running locally](#running-locally)).
- **Access** — the AppKit **Files plugin** runs in `on-behalf-of-user` mode, so
  every read/write/upload executes as the signed-in user and is governed by
  that user's Unity Catalog grants on the volume (`READ_VOLUME` /
  `WRITE_VOLUME`). No files are bundled into the app source.
- **Emulator** — EmulatorJS v4.2.3 assets ([patched](#emulatorjs-patches)) are vendored under `client/public/emulatorjs/` (no runtime CDN
  dependency). The vendored core is the **non-threaded** WebGL2 PUAE build, so
  no `SharedArrayBuffer` or cross-origin isolation (COOP/COEP) is needed and the
  app also runs inside the App Builder preview iframe. In `local` asset mode the
  server sends a Content-Security-Policy restricting scripts to `'self'`.

## Features

- Game-library grid with search/filter and auto-generated cover tiles.
- Multi-disk games auto-grouped by filename; save disks detected and excluded
  from the playlist (a `#SAVEDISK` directive is added to the generated M3U).
- Multiple Kickstart ROMs with model detection (A500 / A600 / A1200 / CD32)
  and a ROM selector.
- In-app upload of ROMs and disk images straight to the volume.
- On-screen Amiga keyboard (PUAE's virtual keyboard) via the **Keyboard →
  Toggle** button or the **V** key, for keys a physical keyboard can't send —
  EmulatorJS binds several keys (X, S, V, Z, A, Q, E, R, Tab, Enter, arrows) to
  the joystick, so those don't reach the Amiga as key presses.
- Per-game screenshots (captured from the emulator canvas) stored in the
  volume, and a save-state activity log.

## Endpoints

| Endpoint                              | Description                                           |
| ------------------------------------- | ----------------------------------------------------- |
| `GET /api/config`                     | Runtime config (EmulatorJS asset source/path, volume) |
| `GET /api/games`                      | Games with multi-disk grouping                        |
| `GET /api/roms`                       | Discovered Kickstart ROMs + detected model            |
| `GET /api/games/:slug/bundle`         | ZIP (M3U + ADFs) for a multi-disk game                |
| `GET /api/content/:kind/:filename`    | Extension-preserving stream of a ROM/disk image       |
| `DELETE /api/games/:key`              | Delete a whole game (all disks + save disk)           |
| `DELETE /api/roms/:filename`          | Delete a Kickstart ROM                                |
| `GET /api/screenshots/:game`          | List a game's screenshots (newest first)              |
| `POST /api/screenshots/:game`         | Save a PNG screenshot (raw `image/png` body)          |
| `GET /api/screenshots/:game/:file`    | Fetch a screenshot PNG                                |
| `DELETE /api/screenshots/:game/:file` | Delete a screenshot                                   |
| `GET POST /api/files/files/*`         | Files plugin routes (list / upload / …)               |

Filenames and game keys in route params must be a single plain path segment
(no `/`, `\`, `..` or leading `.`); anything else is rejected with `400`.
Deleting a game attempts every file and returns `207` with `deleted` / `failed`
lists if only some could be removed.

> The dedicated `/api/content/...` route exists because EmulatorJS derives the
> file type from the URL's file extension; the Files plugin's `?path=` query URL
> would not expose one.

## Supported formats

- Disk images: `.adf`, `.adz`, `.dms`
- `.zip` uploads are unpacked in the browser and their disk images uploaded
  individually, so multi-disk games go through the M3U bundle like separate
  ADFs (a zip handed to the emulator directly only boots its first disk).
  Generic entry names (`disk1.adf`) are renamed after the zip
  (`<zip name> (Disk 1).adf`). Zips already in the volume still play, as a
  single file.
- Kickstart ROMs: `.rom`, `.bin` (or any filename containing `kick`)
- `.ipf` is **not** supported (needs the proprietary `capsimg` library).

## Multi-disk naming conventions

| Pattern                      | Example                    |
| ---------------------------- | -------------------------- |
| `_Disk N` / `_DiskN`         | `Monkey Island_Disk 1.adf` |
| `(Disk N)` / `(Disk N of M)` | `Game (Disk 2 of 3).adf`   |
| `_dN`                        | `Monkey Island_d1.adf`     |
| `_Disk A` / `(Disk A)`       | `Monkey Island_Disk A.adf` |
| Trailing letter A–F          | `Monkey Island A.adf`      |
| Save disk                    | `Game savedisk.adf`        |

Trailing scene/release tags (`[cr FLT]`, `[!]`, `[a]`, …) are stripped during
grouping. Grouping logic lives in `server/games.ts` and is covered by
`server/games.test.ts`.

## Configuration

| Variable                  | Default  | Description                                                                                        |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `DATABRICKS_VOLUME_FILES` | —        | Volume path, e.g. `/Volumes/<catalog>/<schema>/<volume>` (deployed: from the `files` app resource) |
| `EMULATORJS_SOURCE`       | `local`  | `local` (vendored assets) or `cdn`                                                                 |
| `STORAGE_MODE`            | `volume` | `volume` (UC Volume via Files plugin) or `local` (directory on disk)                               |
| `LOCAL_STORAGE_DIR`       | `./data` | Root directory for `STORAGE_MODE=local`                                                            |

## Requirements for use

You must supply (they are copyrighted and not included):

1. A **Kickstart ROM** uploaded to `roms/` — Kickstart 1.3 is recommended for
   most classic A500 games. Obtain legally, e.g. via
   [Amiga Forever](https://www.amigaforever.com/).
2. **Game disk images** uploaded to `games/`.

Use the in-app **Upload** button, or add files directly to the volume.

## Known limitations

- **Needs a WebGL2-capable browser.** The vendored PUAE core is the WebGL2 build
  (`client/public/emulatorjs/cores/puae-wasm.data`), and the core report sets
  `defaultWebGL2` so EmulatorJS loads that build. Virtually all current desktop
  browsers qualify. Open the app in its own browser tab — the emulator's render
  loop pauses whenever its page/iframe isn't visible (so it won't run inside an
  embedded preview pane).
- **Disk swapping does not work.** The PUAE WASM core in EmulatorJS v4.2.3
  crashes (`RuntimeError: unreachable`) in `set_current_disk`, so the vendored
  `emulator.min.js` is patched to make the in-emulator disk-swap a no-op with a
  console warning ([upstream issue](https://github.com/rommapp/romm/issues/2696)).
  Games that need a swap can't progress past it.
- **Multi-drive is not functional** in the current PUAE WASM build — only DF0:
  is loaded. The `(MD)` M3U infrastructure is in place for a future core that
  fixes it. Games that load everything from disk A work fine.
- **HDF / WHDLoad images are not supported** (the core crashes loading them).

## EmulatorJS patches

The vendored `emulator.min.js` carries patches for v4.2.3 bugs that affect
multi-disk games (re-apply them if you update EmulatorJS):

1. `this.allSettings=this.allSettings||{}` — `setupDisksMenu()` runs before
   the settings menu initialises `allSettings`.
2. `if(this.started)` around `setCurrentDisk()` — avoids calling into the core
   before its disk subsystem is ready.
3. Disk swap replaced with a console warning — the core's
   `set_current_disk` crashes (see Known limitations).
4. `[DISK]` console logging around `getDiskCount` / `getCurrentDisk` /
   `setCurrentDisk` for debugging.

`cores/reports/puae.json` is also edited to set `defaultWebGL2: true` so
EmulatorJS requests the vendored `puae-wasm.data` rather than the absent
`-legacy` build.

## Running locally

The app is a standard Node + Vite project, so it runs anywhere Node does
(Node.js 22+ and npm). There are two ways to run it.

### Option A: local files, no Databricks workspace

```bash
npm install
mkdir -p data/roms data/games
cp /path/to/kick13.rom data/roms/          # your Kickstart ROM
cp /path/to/*.adf data/games/              # your disk images
npm run dev:local                          # http://localhost:8000
```

`dev:local` sets `STORAGE_MODE=local`, which skips the Files plugin and reads
and writes `roms/`, `games/` and `screenshots/` under `LOCAL_STORAGE_DIR`
(`./data`, git-ignored). Uploads and deletes from the UI work against that
directory. This mirrors the original prototype, which served files from
`static/roms` and `static/games`.

In local mode the server binds to `127.0.0.1` only. Set `FLASK_RUN_HOST=0.0.0.0`
to reach it from other devices on your network. Deployed apps keep AppKit's
default `0.0.0.0`, which the Databricks Apps proxy needs.

### Option B: against your Unity Catalog Volume

**Prerequisites:** the
[Databricks CLI](https://docs.databricks.com/dev-tools/cli/) and
`READ_VOLUME`/`WRITE_VOLUME` on the volume that holds your ROMs/games.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Authenticate to your workspace (OAuth U2M):

   ```bash
   databricks auth login --host https://<your-workspace-host> --profile myws
   ```

3. Create a `.env` file (it is git-ignored):

   ```env
   DATABRICKS_CONFIG_PROFILE=myws
   DATABRICKS_HOST=https://<your-workspace-host>
   # UC Volume holding roms/ and games/
   DATABRICKS_VOLUME_FILES=/Volumes/<catalog>/<schema>/<volume>
   EMULATORJS_SOURCE=local
   DATABRICKS_APP_PORT=8000
   ```

   PAT alternative: instead of the profile, set `DATABRICKS_HOST` and
   `DATABRICKS_TOKEN=dapi…`.

4. Start the dev server (hot reload) and open <http://localhost:8000>:

   ```bash
   npm run dev
   ```

   Files are read/written **as your authenticated identity** (there's no
   Databricks Apps proxy locally, so the on-behalf-of-user calls fall back to
   your CLI session). Your existing library in the volume is available
   immediately — no need to copy ROMs/games locally.

Production-style run:

```bash
npm run build && npm start
```

Other useful scripts:

```bash
npm run dev:local   # dev server with local-directory storage (Option A)
npm run typecheck   # tsc for server + client
npm run lint        # eslint
npm run test        # vitest (game-grouping + filename-safety unit tests)
```

## Deploying to Databricks Apps

The repo is a [Declarative Automation Bundle](https://docs.databricks.com/dev-tools/bundles/)
(`databricks.yml`). It defines the app, binds the Unity Catalog volume as the
app's `files` resource (`WRITE_VOLUME`), requests the `files.files` user API
scope for on-behalf-of-user file access, grants `CAN_USE` to `users`, and has
`dev` / `prod` targets.

```bash
databricks bundle validate --strict -t dev --profile <profile>
databricks bundle deploy -t dev --profile <profile> --var volume=<catalog>.<schema>.<volume>
databricks bundle run amiga_bricks -t dev --profile <profile>
```

The `volume` variable defaults to `andrew.default.amiga`; override it with
`--var` or per target in `databricks.yml`. `app.yaml` reads the volume path from
the resource (`valueFrom: files`), so there's nothing to edit there. The `dev`
target runs in development mode (resources are prefixed with your username);
use `-t prod` for the shared deployment.

To bring an app that already exists (for example one created in App Builder)
under the bundle instead of creating a new one:

```bash
databricks bundle deployment bind amiga_bricks <existing-app-name> -t prod --profile <profile>
```

`databricks apps deploy` still works for a quick one-off deploy, but the app
must then have a volume resource named `files` configured in the UI.
