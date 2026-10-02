# Amiga Bricks

A web-based Commodore Amiga emulator that runs in the browser, built on
[Databricks AppKit](https://developers.databricks.com/docs/appkit/v0/) and
powered by [EmulatorJS](https://emulatorjs.org/) (PUAE core). Kickstart ROMs and
game disk images are stored in a **Unity Catalog Volume** and streamed to the
emulator on behalf of the signed-in user.

This is an AppKit (TypeScript + React + Express) rebuild of an earlier
FastAPI/Python prototype. The game-grouping, M3U/ZIP bundling and security-header
logic were ported over; storage moved from bundled files to a UC Volume, and the
UI was rebuilt with AppKit components while keeping the retro Workbench look.

## How it works

- **Storage** — ROMs live under `roms/` and disk images under `games/` inside a
  Unity Catalog Volume. The volume path is set by the `DATABRICKS_VOLUME_FILES`
  env var in `app.yaml` and is fully configurable at deploy time.
- **Access** — the AppKit **Files plugin** runs in `on-behalf-of-user` mode, so
  every read/write/upload executes as the signed-in user and is governed by
  that user's Unity Catalog grants on the volume (`READ_VOLUME` /
  `WRITE_VOLUME`). No files are bundled into the app source.
- **Emulator** — EmulatorJS v4.2.3 assets are vendored under
  `client/public/emulatorjs/` (no runtime CDN dependency). The server sets
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` so the browser enables
  `SharedArrayBuffer`, which the threaded PUAE WASM core requires.

## Features

- Game-library grid with search/filter and auto-generated cover tiles.
- Multi-disk games auto-grouped by filename; save disks detected and excluded
  from the playlist (a `#SAVEDISK` directive is added to the generated M3U).
- Multiple Kickstart ROMs with model detection (A500 / A600 / A1200 / CD32)
  and a ROM selector.
- In-app upload of ROMs and disk images straight to the volume.
- Per-game screenshots (captured from the emulator canvas) and a save-state
  activity log.

## Endpoints

| Endpoint                           | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| `GET /api/config`                  | Runtime config (EmulatorJS asset source/path, volume) |
| `GET /api/games`                   | Games with multi-disk grouping                        |
| `GET /api/roms`                    | Discovered Kickstart ROMs + detected model            |
| `GET /api/games/:slug/bundle`      | ZIP (M3U + ADFs) for a multi-disk game                |
| `GET /api/content/:kind/:filename` | Extension-preserving stream of a ROM/disk image       |
| `DELETE /api/games/:key`           | Delete a whole game (all disks + save disk)           |
| `DELETE /api/roms/:filename`       | Delete a Kickstart ROM                                |
| `GET POST /api/files/files/*`      | Files plugin routes (list / upload / …)               |

> The dedicated `/api/content/...` route exists because EmulatorJS derives the
> file type from the URL's file extension; the Files plugin's `?path=` query URL
> would not expose one.

## Supported formats

- Disk images: `.adf`, `.adz`, `.dms`, `.zip`
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

| Variable                  | Default | Description                                              |
| ------------------------- | ------- | -------------------------------------------------------- |
| `DATABRICKS_VOLUME_FILES` | —       | Volume path, e.g. `/Volumes/<catalog>/<schema>/<volume>` |
| `EMULATORJS_SOURCE`       | `local` | `local` (vendored assets) or `cdn`                       |

## Requirements for use

You must supply (they are copyrighted and not included):

1. A **Kickstart ROM** uploaded to `roms/` — Kickstart 1.3 is recommended for
   most classic A500 games. Obtain legally, e.g. via
   [Amiga Forever](https://www.amigaforever.com/).
2. **Game disk images** uploaded to `games/`.

Use the in-app **Upload** button, or add files directly to the volume.

## Known limitations

- **Cross-origin isolation is required.** The threaded PUAE core needs
  `SharedArrayBuffer`, which browsers only grant to a cross-origin-isolated,
  top-level page. The emulator therefore runs when the deployed app is opened in
  its own tab, but **not** inside the App Builder preview iframe (which cannot be
  cross-origin isolated) — there EmulatorJS reports "EJS_Runtime is not defined".
- Multi-drive (loading all disks into DF0:–DF3: at once) is not functional in the
  current EmulatorJS PUAE WASM build; the `(MD)` M3U infrastructure is in place
  for a future core that fixes it. Disk swapping via the in-emulator menu works.

## Development

```bash
npm run dev        # dev server with hot reload (managed by App Builder)
npm run typecheck  # tsc for server + client
npm run lint       # eslint
npm run test       # vitest (game-grouping unit tests)
```
