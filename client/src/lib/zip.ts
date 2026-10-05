/**
 * Unpack uploaded zips into individual disk images.
 *
 * A zip is otherwise handed to the emulator as one game with no M3U, so PUAE
 * only boots its first disk and the player gets stuck at "insert disk 2"
 * (disk swapping is broken in the current core). Uploading the disks as
 * separate files lets the server group them and build the multi-disk bundle.
 */
import { unzipSync } from 'fflate';

/** Disk images the emulator loads directly; zips are unpacked into these. */
export const DISK_IMAGE_EXT = /\.(adf|adz|dms)$/i;

// Entry names that only identify the disk: "disk1", "Disk 2", "disc_3", "d4", "1", "A".
const GENERIC_DISK = /^(?:dis[ck]|df|d)?[\s_-]*(\d+|[a-z])$/i;

/**
 * Filename to upload a zip entry as. Descriptive names are kept as-is; generic
 * ones ("disk1.adf") are renamed after the zip ("Lemmings (Disk 1).adf") so they
 * group under the right game and can't collide with other games' disks.
 */
export function diskImageName(zipName: string, entryPath: string): string {
  const base = entryPath.split('/').pop() ?? entryPath;
  const dot = base.lastIndexOf('.');
  const stem = dot < 0 ? base : base.slice(0, dot);
  const ext = dot < 0 ? '' : base.slice(dot).toLowerCase();
  const generic = GENERIC_DISK.exec(stem);
  if (!generic) return base;
  return `${zipName.replace(/\.zip$/i, '')} (Disk ${generic[1].toUpperCase()})${ext}`;
}

/** Extract the disk images from a zip (ignoring macOS metadata), sorted by path. */
export async function unpackDiskImages(zip: File): Promise<File[]> {
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
    filter: (f) => DISK_IMAGE_EXT.test(f.name) && !f.name.startsWith('__MACOSX/'),
  });
  return (
    Object.keys(entries)
      .sort((a, b) => a.localeCompare(b))
      // fflate returns ArrayBuffer-backed arrays; the cast just narrows the type.
      .map((path) => new File([entries[path] as Uint8Array<ArrayBuffer>], diskImageName(zip.name, path)))
  );
}
