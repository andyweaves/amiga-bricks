import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Spinner } from '@databricks/appkit-ui/react';
import { ArrowLeft } from 'lucide-react';
import { api, contentUrl, gameKey, gameUrl, type AppConfig, type GameEntry, type RomEntry } from '@/lib/api';
import { EmulatorView } from '@/components/EmulatorView';
import { FloppyGlyph, FloppySaveGlyph } from '@/components/FloppyDisk';
import { SnapshotPanel, type SaveEvent } from '@/components/SnapshotPanel';

const ROM_STORAGE_KEY = 'amiga.selectedRom';

export function PlayPage() {
  const { key } = useParams();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [game, setGame] = useState<GameEntry | null>(null);
  const [rom, setRom] = useState<RomEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveEvents, setSaveEvents] = useState<SaveEvent[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [cfg, games, roms] = await Promise.all([api.config(), api.games(), api.roms()]);
        setConfig(cfg);

        const decoded = decodeURIComponent(key ?? '');
        const found = games.find((g) => gameKey(g) === decoded) ?? null;
        setGame(found);
        if (!found) {
          setError('Game not found. It may have been removed from the volume.');
          return;
        }

        const savedRom = localStorage.getItem(ROM_STORAGE_KEY);
        const chosen = roms.find((r) => r.filename === savedRom) ?? roms[0] ?? null;
        setRom(chosen);
        if (!chosen) setError('No Kickstart ROM available. Upload one from the library first.');
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [key]);

  const onSave = useCallback(() => setSaveEvents((prev) => [{ kind: 'save', at: Date.now() }, ...prev]), []);
  const onLoad = useCallback(() => setSaveEvents((prev) => [{ kind: 'load', at: Date.now() }, ...prev]), []);

  const ready = config && game && rom;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" /> Library
          </Link>
        </Button>
        {game && (
          <div className="flex items-center gap-2">
            <h2 className="font-amiga text-lg">{game.name}</h2>
            {game.disks && (
              <Badge variant="secondary" className="gap-1">
                <FloppyGlyph className="h-3 w-3" /> {game.disks.length} disks
              </Badge>
            )}
            {game.hasSaveDisk && (
              <Badge variant="secondary" className="gap-1">
                <FloppySaveGlyph className="h-3 w-3" /> save disk
              </Badge>
            )}
          </div>
        )}
        {rom && (
          <Badge variant="outline" className="ml-auto">
            {rom.model} · {rom.name}
          </Badge>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Can’t start the emulator</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* Workbench window around the emulator */}
          <div className="wb-window">
            <div className="wb-titlebar font-amiga">
              <span>{game ? `${game.name} — PUAE ${rom?.model ?? ''}` : 'Loading…'}</span>
              <div className="flex gap-1.5">
                <span className="wb-gadget" />
                <span className="wb-gadget" />
              </div>
            </div>
            {ready ? (
              <EmulatorView
                ejsPath={config.emulatorjs_path}
                gameUrl={gameUrl(game)}
                biosUrl={contentUrl('roms', rom.filename)}
                gameName={game.name}
                model={rom.model}
                gameType={game.type}
                onSaveState={onSave}
                onLoadState={onLoad}
              />
            ) : (
              <div className="flex h-[70vh] items-center justify-center bg-black">
                <Spinner />
              </div>
            )}
          </div>

          {/* Snapshots / save-state sidebar */}
          <aside className="rounded-md border border-border bg-card p-4">
            {game && <SnapshotPanel gameId={gameKey(game)} gameName={game.name} saveEvents={saveEvents} />}
          </aside>
        </div>
      )}
    </div>
  );
}
