import { useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@databricks/appkit-ui/react';
import { CheckCircle2, Upload, XCircle } from 'lucide-react';
import { uploadFile } from '@/lib/api';
import { DISK_IMAGE_EXT, unpackDiskImages } from '@/lib/zip';

const ROM_EXT = /\.(rom|bin)$/i;
const ZIP_EXT = /\.zip$/i;

type Status = 'pending' | 'uploading' | 'done' | 'error';
interface Item {
  file: File;
  dest: string;
  status: Status;
  message?: string;
  /** Zip this disk image was unpacked from, if any. */
  from?: string;
}

/** Decide the target subfolder from the filename. */
function destFor(file: File): string | null {
  if (ROM_EXT.test(file.name) || file.name.toLowerCase().includes('kick')) return `roms/${file.name}`;
  if (DISK_IMAGE_EXT.test(file.name)) return `games/${file.name}`;
  return null;
}

export function UploadDialog({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      // Zips are unpacked so their disks upload (and group) as separate images.
      if (ZIP_EXT.test(file.name)) {
        try {
          const disks = await unpackDiskImages(file);
          if (disks.length === 0) {
            next.push({ file, dest: '', status: 'error', message: 'No .adf/.adz/.dms disk images in this zip' });
          }
          for (const disk of disks) {
            next.push({ file: disk, dest: `games/${disk.name}`, status: 'pending', from: file.name });
          }
        } catch {
          next.push({ file, dest: '', status: 'error', message: 'Could not read this zip' });
        }
        continue;
      }
      const dest = destFor(file);
      next.push(
        dest ? { file, dest, status: 'pending' } : { file, dest: '', status: 'error', message: 'Unsupported file type' }
      );
    }
    setItems((prev) => [...prev, ...next]);
  }

  async function startUpload() {
    setBusy(true);
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].status !== 'pending') continue;
      setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'uploading' } : it)));
      try {
        await uploadFile(items[i].dest, items[i].file);
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'done' } : it)));
      } catch (err) {
        setItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: 'error', message: (err as Error).message } : it))
        );
      }
    }
    setBusy(false);
    onUploaded();
  }

  function reset() {
    setItems([]);
    if (inputRef.current) inputRef.current.value = '';
  }

  const pending = items.some((it) => it.status === 'pending');

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" /> Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-amiga">Upload to volume</DialogTitle>
          <DialogDescription>
            Kickstart ROMs (.rom/.bin) go to <code>roms/</code>; disk images (.adf/.adz/.dms) go to <code>games/</code>.
            Zips are unpacked and their disk images uploaded individually, so multi-disk games are grouped. Files are
            written to the Unity Catalog volume as you.
          </DialogDescription>
        </DialogHeader>

        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground hover:border-primary"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="h-6 w-6" />
          <span>Drop files here or click to browse</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".rom,.bin,.adf,.adz,.dms,.zip"
            className="hidden"
            onChange={(e) => void addFiles(e.target.files)}
          />
        </label>

        {items.length > 0 && (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {items.map((it) => (
              <li
                key={`${it.file.name}-${it.file.size}-${it.file.lastModified}`}
                className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate" title={it.file.name}>
                  {it.file.name}
                  {it.dest && <span className="ml-1 text-xs text-muted-foreground">→ {it.dest.split('/')[0]}/</span>}
                  {it.from && <span className="ml-1 text-xs text-muted-foreground">(from {it.from})</span>}
                </span>
                {it.status === 'uploading' && <Spinner />}
                {it.status === 'done' && <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />}
                {it.status === 'error' && (
                  <span className="flex items-center gap-1 text-xs text-destructive" title={it.message}>
                    <XCircle className="h-4 w-4" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={reset} disabled={busy || items.length === 0}>
            Clear list
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void startUpload()} disabled={busy || !pending} className="gap-2">
              <Upload className="h-4 w-4" /> Upload {items.filter((i) => i.status === 'pending').length || ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />;
}
