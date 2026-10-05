/**
 * Amiga game-library logic: disk-image discovery, multi-disk grouping and
 * Kickstart ROM model detection.
 *
 * Ported from the original FastAPI implementation to TypeScript so it can be
 * unit-tested in isolation (see games.test.ts). These are pure functions over
 * plain filename strings — they do no I/O — which keeps them trivial to test
 * and independent of where the files actually live (a Unity Catalog Volume,
 * in this app).
 *
 * Multi-disk games are auto-detected by naming convention:
 *   Game Name_Disk 1.adf, Game Name_Disk 2.adf   (numeric)
 *   Game Name_Disk1.adf, Game Name_d1.adf
 *   Game Name (Disk 1).adf, Game Name (Disk 2).adf
 *   Game Name A.adf, Game Name B.adf              (alpha A-F)
 *   Game Name_Disk A.adf, Game Name (Disk B).adf  (alpha A-Z with prefix)
 *   Game Name savedisk.adf                        (save disk, excluded from M3U)
 */

export const GAME_EXTENSIONS = new Set(['.adf', '.adz', '.dms', '.zip']);
export const ROM_EXTENSIONS = new Set(['.rom', '.bin']);

/** Sentinel disk number used for save disks (excluded from the regular list). */
export const SAVE_DISK = -1;

export interface DiskRef {
  filename: string;
  disk: number;
}

export interface GameEntry {
  /** Display name (base name for multi-disk, file stem for single-disk). */
  name: string;
  /** URL-safe identifier for multi-disk games; null for single-disk. */
  slug: string | null;
  /** Filename for single-disk games; null for multi-disk. */
  filename: string | null;
  /** Ordered disk list for multi-disk games; null for single-disk. */
  disks: DiskRef[] | null;
  /** Whether a dedicated save disk was detected for this game. */
  hasSaveDisk: boolean;
  /** Lower-case file extension without the dot (e.g. "adf"). */
  type: string;
}

export interface RomEntry {
  name: string;
  filename: string;
  model: string;
}

// Optional trailing scene/release tags like [cr QTX], [a], [!], [t+3].
const TRAILING_TAGS = '(?:\\[[^\\]]*\\])*';

// Numeric disk patterns: "_Disk 1", "_Disk1", "_d1", " (Disk 1)", "(Disk 3 of 3)".
const DISK_NUM_PATTERN = new RegExp(
  '(?:' +
    '[_ ]?\\(Disk\\s*(\\d+)(?:\\s*of\\s*\\d+)?\\)' +
    '|[_ ]Disk\\s*(\\d+)' +
    '|[_ ][dD](\\d+)' +
    ')' +
    TRAILING_TAGS +
    '$'
);

// Alpha disk patterns: "_Disk A", "(Disk B)", trailing single uppercase A-F.
const DISK_ALPHA_PATTERN = new RegExp(
  '(?:' +
    '[_ ]?\\(Disk\\s*([A-Za-z])(?:\\s*of\\s*[A-Za-z])?\\)' +
    '|[_ ]Disk\\s*([A-Za-z])' +
    '|[_ ]([A-F])' +
    ')' +
    TRAILING_TAGS +
    '$'
);

// Save disk filenames: "Game savedisk", "Game save_disk", "Game Save Disk".
const SAVE_DISK_PATTERN = new RegExp('[_ ]save[_ ]?disk' + TRAILING_TAGS + '$', 'i');

/** Lower-case extension including the leading dot, or "" when none. */
export function extname(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

/** Filename without its final extension. */
export function stemOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot < 0 ? filename : filename.slice(0, dot);
}

export function isValidGame(filename: string): boolean {
  return GAME_EXTENSIONS.has(extname(filename));
}

export function isValidRom(filename: string): boolean {
  return ROM_EXTENSIONS.has(extname(filename)) || filename.toLowerCase().includes('kick');
}

/**
 * Whether a client-supplied name is a single plain path segment: non-empty, no
 * path separators or NULs, not "." / "..", and not a hidden (dot-prefixed)
 * entry. Used to keep request params from escaping their volume subdirectory.
 */
export function isSafeFilename(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !name.startsWith('.') &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0')
  );
}

function firstGroup(match: RegExpMatchArray): string {
  for (let i = 1; i < match.length; i += 1) {
    if (match[i] !== undefined) return match[i];
  }
  return '';
}

/**
 * Extract the base game name and disk number from a filename stem.
 * Returns disk === null for single-disk games, SAVE_DISK for save disks,
 * and a positive integer for numbered/lettered disks (A-D -> 1-4).
 */
export function parseDiskInfo(stem: string): { base: string; disk: number | null } {
  const save = SAVE_DISK_PATTERN.exec(stem);
  if (save) return { base: stem.slice(0, save.index).trim(), disk: SAVE_DISK };

  const num = DISK_NUM_PATTERN.exec(stem);
  if (num) return { base: stem.slice(0, num.index).trim(), disk: parseInt(firstGroup(num), 10) };

  const alpha = DISK_ALPHA_PATTERN.exec(stem);
  if (alpha) {
    const letter = firstGroup(alpha).toUpperCase();
    return { base: stem.slice(0, alpha.index).trim(), disk: letter.charCodeAt(0) - 65 + 1 };
  }

  return { base: stem, disk: null };
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'game';
}

/**
 * Group a list of game filenames into single- and multi-disk entries.
 * Save disks are excluded from the disk list but flip `hasSaveDisk`.
 * Slugs are unique: when two base names slugify alike ("Monkey Island" /
 * "Monkey-Island"), later ones (in filename order) get a "-2", "-3"… suffix.
 */
export function groupGames(filenames: string[]): GameEntry[] {
  const valid = filenames.filter(isValidGame).sort((a, b) => a.localeCompare(b));
  const usedSlugs = new Set<string>();
  const uniqueSlug = (base: string): string => {
    const root = slugify(base);
    let slug = root;
    for (let n = 2; usedSlugs.has(slug); n += 1) slug = `${root}-${n}`;
    usedSlugs.add(slug);
    return slug;
  };

  const groups = new Map<string, { disk: number | null; filename: string }[]>();
  for (const filename of valid) {
    const { base, disk } = parseDiskInfo(stemOf(filename));
    const bucket = groups.get(base) ?? [];
    bucket.push({ disk, filename });
    groups.set(base, bucket);
  }

  const games: GameEntry[] = [];
  for (const [base, disks] of groups) {
    const regular = disks.filter((d) => d.disk !== SAVE_DISK);
    const hasSaveDisk = regular.length < disks.length;
    const hasNumbers = regular.some((d) => d.disk !== null);

    if (hasNumbers && regular.length > 1) {
      const sorted = [...regular].sort((a, b) => (a.disk ?? 0) - (b.disk ?? 0));
      games.push({
        name: base,
        slug: uniqueSlug(base),
        filename: null,
        disks: sorted.map((d) => ({ filename: d.filename, disk: d.disk as number })),
        hasSaveDisk,
        type: extname(sorted[0].filename).replace(/^\./, ''),
      });
    } else {
      for (const { filename } of regular) {
        games.push({
          name: stemOf(filename),
          slug: null,
          filename,
          disks: null,
          hasSaveDisk,
          type: extname(filename).replace(/^\./, ''),
        });
      }
    }
  }

  return games.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/**
 * Resolve every physical file that makes up a game, given a game key.
 * Single-disk games are keyed by their exact filename. Multi-disk games are
 * keyed by slug — this returns all of their disks *and* the save disk (which
 * grouping hides), so a delete can remove the whole game cleanly. A
 * single-disk game takes its save disk with it only when it is the sole game
 * sharing that base name; otherwise the save disk is left for the others.
 */
export function filesForGame(filenames: string[], key: string): string[] {
  const valid = filenames.filter(isValidGame);
  const game = groupGames(valid).find((g) => (g.slug ?? g.filename) === key);
  if (!game) return [];

  const first = game.disks ? game.disks[0].filename : (game.filename as string);
  const { base } = parseDiskInfo(stemOf(first));
  const group = valid.filter((f) => parseDiskInfo(stemOf(f)).base === base);
  if (game.disks) return group;

  const regular = group.filter((f) => parseDiskInfo(stemOf(f)).disk !== SAVE_DISK);
  return regular.length === 1 ? group : [first];
}

/** Detect the Amiga model from a Kickstart ROM filename. */
export function detectModel(romFilename: string): string {
  const n = romFilename.toLowerCase();
  if (n.includes('cd32')) return 'CD32';
  if (n.includes('310') || n.includes('3.1') || n.includes('300') || n.includes('3.0')) return 'A1200';
  if (n.includes('200') || n.includes('204') || n.includes('2.0')) return 'A600';
  return 'A500';
}

/** Build the ROM entry list (name, filename, detected model) from filenames. */
export function listRoms(filenames: string[]): RomEntry[] {
  return filenames
    .filter(isValidRom)
    .sort((a, b) => a.localeCompare(b))
    .map((filename) => ({ name: stemOf(filename), filename, model: detectModel(filename) }));
}
