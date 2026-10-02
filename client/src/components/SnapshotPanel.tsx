import { useCallback, useEffect, useState } from 'react';
import { Button, Separator } from '@databricks/appkit-ui/react';
import { Camera, Download, Save, Trash2 } from 'lucide-react';

export interface SaveEvent {
  kind: 'save' | 'load';
  at: number;
}

const MAX_SHOTS = 12;

function storageKey(gameId: string) {
  return `amiga.shots.${gameId}`;
}

function loadShots(gameId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(gameId)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read screenshot'));
    reader.readAsDataURL(blob);
  });
}

export function SnapshotPanel({
  gameId,
  gameName,
  saveEvents,
}: {
  gameId: string;
  gameName: string;
  saveEvents: SaveEvent[];
}) {
  const [shots, setShots] = useState<string[]>(() => loadShots(gameId));
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setShots(loadShots(gameId));
  }, [gameId]);

  const persist = useCallback(
    (next: string[]) => {
      setShots(next);
      try {
        localStorage.setItem(storageKey(gameId), JSON.stringify(next));
      } catch {
        /* quota — ignore */
      }
    },
    [gameId]
  );

  // Use EmulatorJS's own screenshot API — it reads the core framebuffer, so it
  // works even though the WebGL canvas doesn't preserve its drawing buffer
  // (plain canvas.toDataURL() returns a blank image).
  const capture = async () => {
    const emu = window.EJS_emulator;
    if (!emu || typeof emu.takeScreenshot !== 'function') {
      setNote('Start the game first, then capture.');
      return;
    }
    try {
      // 'canvas' source + preserveDrawingBuffer (set in EmulatorView) captures
      // the live frame; the retroarch source returns black (gpu screenshot off).
      const { blob } = await emu.takeScreenshot('canvas');
      const data = await blobToDataUrl(blob);
      setNote(null);
      persist([data, ...shots].slice(0, MAX_SHOTS));
    } catch {
      setNote('Couldn’t capture a screenshot — try again once the game is running.');
    }
  };

  const remove = (idx: number) => persist(shots.filter((_, i) => i !== idx));

  const download = (data: string, idx: number) => {
    const a = document.createElement('a');
    a.href = data;
    a.download = `${gameName.replace(/[^a-z0-9]+/gi, '_')}_${idx + 1}.png`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-amiga text-sm">
            <Camera className="h-4 w-4" /> Screenshots
          </h3>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void capture()}>
            <Camera className="h-3.5 w-3.5" /> Capture
          </Button>
        </div>
        {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}
        {shots.length === 0 ? (
          <p className="text-xs text-muted-foreground">No screenshots yet. Hit Capture while a game is running.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {shots.map((data, idx) => (
              <div
                key={`${data.length}-${data.slice(-24)}`}
                className="group relative overflow-hidden rounded border border-border"
              >
                <img src={data} alt={`Screenshot ${idx + 1}`} className="aspect-video w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => download(data, idx)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => remove(idx)}>
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
