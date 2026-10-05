import { useEffect, useState } from 'react';
import { Button, Separator } from '@databricks/appkit-ui/react';
import { Camera, Download, Save, Trash2 } from 'lucide-react';
import { api, deleteScreenshot, saveScreenshot, screenshotUrl } from '@/lib/api';

export interface SaveEvent {
  kind: 'save' | 'load';
  at: number;
}

/**
 * Screenshots are stored server-side (the UC volume, or the local data dir in
 * local mode) under screenshots/<gameId>/, so they persist across browsers and
 * aren't bound by localStorage's ~5 MB quota.
 */
export function SnapshotPanel({
  gameId,
  gameName,
  saveEvents,
}: {
  gameId: string;
  gameName: string;
  saveEvents: SaveEvent[];
}) {
  const [shots, setShots] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .screenshots(gameId)
      .then((names) => {
        if (!cancelled) setShots(names);
      })
      .catch(() => {
        if (!cancelled) setNote('Couldn’t load saved screenshots.');
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const capture = async () => {
    const emu = window.EJS_emulator;
    if (!emu || typeof emu.takeScreenshot !== 'function') {
      setNote('Start the game first, then capture.');
      return;
    }
    setBusy(true);
    try {
      // 'canvas' source + preserveDrawingBuffer (forced in EmulatorView) captures
      // the live frame; the retroarch source returns black (gpu screenshot off).
      const { blob } = await emu.takeScreenshot('canvas', 'png');
      const name = await saveScreenshot(gameId, blob);
      setNote(null);
      setShots((prev) => [name, ...prev]);
    } catch (err) {
      setNote(`Couldn’t save a screenshot — ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    try {
      await deleteScreenshot(gameId, name);
      setShots((prev) => prev.filter((n) => n !== name));
    } catch (err) {
      setNote((err as Error).message);
    }
  };

  const download = (name: string, idx: number) => {
    const a = document.createElement('a');
    a.href = screenshotUrl(gameId, name);
    a.download = `${gameName.replace(/[^a-z0-9]+/gi, '_')}_${shots.length - idx}.png`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-amiga text-sm">
            <Camera className="h-4 w-4" /> Screenshots
          </h3>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => void capture()}>
            <Camera className="h-3.5 w-3.5" /> Capture
          </Button>
        </div>
        {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}
        {shots.length === 0 ? (
          <p className="text-xs text-muted-foreground">No screenshots yet. Hit Capture while a game is running.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {shots.map((name, idx) => (
              <div key={name} className="group relative overflow-hidden rounded border border-border">
                <img
                  src={screenshotUrl(gameId, name)}
                  alt={`Screenshot from ${new Date(parseInt(name, 10)).toLocaleString()}`}
                  className="aspect-video w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    aria-label="Download screenshot"
                    onClick={() => download(name, idx)}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-7 w-7"
                    aria-label="Delete screenshot"
                    onClick={() => void remove(name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h3 className="mb-2 flex items-center gap-2 font-amiga text-sm">
          <Save className="h-4 w-4" /> Save states
        </h3>
        {saveEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Create save states from the in-emulator menu (the gamepad / settings icon on the emulator toolbar). They’ll
            be logged here and stored by EmulatorJS in your browser.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {saveEvents.map((e) => (
              <li
                key={`${e.kind}-${e.at}`}
                className="flex items-center justify-between rounded border border-border px-2 py-1"
              >
                <span className="capitalize">{e.kind} state</span>
                <span className="text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
