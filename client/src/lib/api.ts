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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  config: () => getJson<AppConfig>('/api/config'),
  games: () => getJson<{ games: GameEntry[] }>('/api/games').then((d) => d.games),
  roms: () => getJson<{ roms: RomEntry[] }>('/api/roms').then((d) => d.roms),
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
