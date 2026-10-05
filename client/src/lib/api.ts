/** Client-side mirror of the server game/rom contracts (see server/games.ts). */

export interface DiskRef {
  filename: string;
  disk: number;
}

export interface GameEntry {
  name: string;
  slug: string | null;
  filename: string | null;
  disks: DiskRef[] | null;
  hasSaveDisk: boolean;
  type: string;
}

export interface RomEntry {
  name: string;
  filename: string;
  model: string;
}

export interface AppConfig {
  emulatorjs_source: string;
  emulatorjs_path: string;
  /** `volume` (UC Volume, deployed) or `local` (directory on disk, dev). */
  storage: 'volume' | 'local';
  volume: string | null;
}

const VOLUME_KEY = 'files';

/** Stable per-game key used for selection + localStorage. */
export function gameKey(game: GameEntry): string {
  return game.slug ?? game.filename ?? game.name;
}

/**
 * URL the emulator fetches the game from. Multi-disk games get a ZIP bundle
 * (EmulatorJS content-sniffs the archive); single-disk games get an
 * extension-preserving content URL so floppy-image detection works.
 */
export function gameUrl(game: GameEntry): string {
  if (game.disks && game.slug) return `/api/games/${game.slug}/bundle`;
  return contentUrl('games', game.filename ?? '');
}

/** Extension-preserving URL for a ROM / disk image served from the volume. */
export function contentUrl(kind: 'games' | 'roms', filename: string): string {
  return `/api/content/${kind}/${encodeURIComponent(filename)}`;
}

/** Upload a file into the volume (roms/ or games/) as the signed-in user. */
export async function uploadFile(path: string, file: File): Promise<void> {
  const res = await fetch(`/api/files/${VOLUME_KEY}/upload?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    body: file,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Upload failed (${res.status})`);
  }
}

async function expectOk(res: Response, fallback: string): Promise<void> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${fallback} (${res.status})`);
  }
}

/**
 * Delete a whole game (all disks + save disk) as the signed-in user. The
 * server answers 207 when only some files could be deleted; treat that as an
 * error so the user sees which files were left behind.
 */
export async function deleteGame(key: string): Promise<void> {
  const res = await fetch(`/api/games/${encodeURIComponent(key)}`, { method: 'DELETE' });
  await expectOk(res, 'Delete failed');
  if (res.status === 207) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Some files could not be deleted');
  }
}

/** Delete a Kickstart ROM as the signed-in user. */
export async function deleteRom(filename: string): Promise<void> {
  const res = await fetch(`/api/roms/${encodeURIComponent(filename)}`, { method: 'DELETE' });
  await expectOk(res, 'Delete failed');
}

/** URL of a stored screenshot PNG. */
export function screenshotUrl(gameId: string, name: string): string {
  return `/api/screenshots/${encodeURIComponent(gameId)}/${encodeURIComponent(name)}`;
}

/** Save a PNG screenshot for a game; resolves to the stored name. */
export async function saveScreenshot(gameId: string, png: Blob): Promise<string> {
  const res = await fetch(`/api/screenshots/${encodeURIComponent(gameId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  });
  await expectOk(res, 'Saving screenshot failed');
  return ((await res.json()) as { name: string }).name;
}

/** Delete a stored screenshot. */
export async function deleteScreenshot(gameId: string, name: string): Promise<void> {
  const res = await fetch(screenshotUrl(gameId, name), { method: 'DELETE' });
  await expectOk(res, 'Delete failed');
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  config: () => getJson<AppConfig>('/api/config'),
  games: () => getJson<{ games: GameEntry[] }>('/api/games').then((d) => d.games),
  roms: () => getJson<{ roms: RomEntry[] }>('/api/roms').then((d) => d.roms),
  screenshots: (gameId: string) =>
    getJson<{ screenshots: string[] }>(`/api/screenshots/${encodeURIComponent(gameId)}`).then((d) => d.screenshots),
};

/** Deterministic cover gradient derived from a game name. */
export function coverColors(name: string): { from: string; to: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  const hue = hash;
  return {
    from: `oklch(0.55 0.16 ${hue})`,
    to: `oklch(0.32 0.1 ${(hue + 40) % 360})`,
  };
}
