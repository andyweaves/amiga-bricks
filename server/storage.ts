/**
 * Storage backends for ROMs, disk images and screenshots.
 *
 * - `volumeStorage` (deployed default) goes through the AppKit Files plugin,
 *   running every call as the signed-in user so Unity Catalog grants apply.
 * - `localDirStorage` (STORAGE_MODE=local) reads/writes a plain directory on
 *   disk, so the app can run on a laptop with no Databricks workspace — the
 *   same approach as the original FastAPI prototype's `static/roms|games`.
 *
 * Paths are always "<subdir>/<name>" relative to the storage root; callers
 * validate each segment with `isSafeFilename` before getting here.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { Request } from 'express';

export interface StoredFile {
  stream: WebReadableStream<Uint8Array>;
  /** Size in bytes, when the backend knows it. */
  size?: number;
}

export interface Storage {
  /** Non-directory filenames in a subdirectory; [] when missing or unreadable. */
  list(req: Request, dir: string): Promise<string[]>;
  download(req: Request, filePath: string): Promise<StoredFile>;
  upload(req: Request, filePath: string, contents: Buffer | WebReadableStream<Uint8Array>): Promise<void>;
  delete(req: Request, filePath: string): Promise<void>;
}

/** The subset of the Files plugin's per-user volume API this app uses. */
interface VolumeApi {
  list(dir: string): Promise<{ name?: string; is_directory?: boolean }[]>;
  download(filePath: string): Promise<{ contents?: ReadableStream; 'content-length'?: number }>;
  upload(filePath: string, contents: ReadableStream | Buffer): Promise<void>;
  delete(filePath: string): Promise<void>;
}

/**
 * Percent-encode each segment of a volume-relative path.
 *
 * AppKit's Files connector and the JS SDK splice the raw path into the Files
 * API URL (`new URL(...)` / `url.pathname = ...`), which leaves `[`, `]`, `#`,
 * `?` and `%` unencoded — so a disk image like `Game (Disk 1)[cr HF].adf`
 * fails with a 500 INTERNAL_ERROR (and `#` / `?` would truncate the path).
 * Encoding the segments ourselves is safe: URL parsing keeps existing `%XX`
 * escapes as-is and the Files API decodes them, so files keep their real names.
 * RFC 3986 sub-delims that encodeURIComponent leaves alone are encoded too.
 */
export function encodeVolumePath(filePath: string): string {
  return filePath
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    )
    .join('/');
}

/** Unity Catalog Volume storage via the Files plugin, as the signed-in user. */
export function volumeStorage(forUser: (req: Request) => VolumeApi): Storage {
  return {
    async list(req, dir) {
      try {
        const entries = await forUser(req).list(encodeVolumePath(dir));
        return entries.filter((e) => !e.is_directory && typeof e.name === 'string').map((e) => e.name as string);
      } catch {
        // Volume unset, directory missing, or the user lacks READ_VOLUME — treat as "no files".
        return [];
      }
    },
    async download(req, filePath) {
      const res = await forUser(req).download(encodeVolumePath(filePath));
      if (!res.contents) throw new Error(`Empty download for ${filePath}`);
      return { stream: res.contents as WebReadableStream<Uint8Array>, size: res['content-length'] };
    },
    async upload(req, filePath, contents) {
      await forUser(req).upload(encodeVolumePath(filePath), contents as ReadableStream | Buffer);
    },
    async delete(req, filePath) {
      await forUser(req).delete(encodeVolumePath(filePath));
    },
  };
}

/** Plain-directory storage rooted at `rootDir` (local development). */
export function localDirStorage(rootDir: string): Storage {
  const root = path.resolve(rootDir);
  const resolve = (filePath: string): string => {
    const full = path.resolve(root, filePath);
    if (!full.startsWith(root + path.sep)) throw new Error(`Path escapes storage root: ${filePath}`);
    return full;
  };

  return {
    async list(_req, dir) {
      try {
        const entries = await readdir(resolve(dir), { withFileTypes: true });
        return entries.filter((e) => e.isFile()).map((e) => e.name);
      } catch {
        return [];
      }
    },
    async download(_req, filePath) {
      const full = resolve(filePath);
      const info = await stat(full);
      if (!info.isFile()) throw new Error(`Not a file: ${filePath}`);
      return { stream: Readable.toWeb(createReadStream(full)) as WebReadableStream<Uint8Array>, size: info.size };
    },
    async upload(_req, filePath, contents) {
      const full = resolve(filePath);
      await mkdir(path.dirname(full), { recursive: true });
      if (Buffer.isBuffer(contents)) await writeFile(full, contents);
      else await pipeline(Readable.fromWeb(contents), createWriteStream(full));
    },
    async delete(_req, filePath) {
      await unlink(resolve(filePath));
    },
  };
}

/** Read a whole stored file into memory (for ZIP bundling). */
export async function readAll(file: StoredFile): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of file.stream) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}
