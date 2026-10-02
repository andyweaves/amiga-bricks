import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { Cpu, HardDrive, Joystick, Search, Trash2, Wrench } from 'lucide-react';
import { api, deleteGame, deleteRom, gameKey, type GameEntry, type RomEntry } from '@/lib/api';
import { GameCard } from '@/components/GameCard';
import { UploadDialog } from '@/components/UploadDialog';

const ROM_STORAGE_KEY = 'amiga.selectedRom';
const SKELETON_KEYS = Array.from({ length: 10 }, (_, i) => `skeleton-${i}`);

export function LibraryPage() {
  const [games, setGames] = useState<GameEntry[] | null>(null);
  const [roms, setRoms] = useState<RomEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedRom, setSelectedRom] = useState<string>(() => localStorage.getItem(ROM_STORAGE_KEY) ?? '');
  const [reloadKey, setReloadKey] = useState(0);
  const [manage, setManage] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = () => setReloadKey((k) => k + 1);

  const requestDeleteGame = (game: GameEntry) => {
    setDeleteError(null);
    setPendingDelete({
      label: game.disks ? `${game.name} (${game.disks.length} disks)` : game.name,
      run: () => deleteGame(gameKey(game)),
    });
  };

  const requestDeleteRom = (rom: RomEntry) => {
    setDeleteError(null);
    setPendingDelete({ label: `Kickstart ROM “${rom.name}”`, run: () => deleteRom(rom.filename) });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await pendingDelete.run();
      setPendingDelete(null);
      reload();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [g, r] = await Promise.all([api.games(), api.roms()]);
        if (cancelled) return;
        setError(null);
        setGames(g);
        setRoms(r);
        setSelectedRom((prev) => {
          if (r.length > 0 && !r.some((rom) => rom.filename === prev)) {
            localStorage.setItem(ROM_STORAGE_KEY, r[0].filename);
            return r[0].filename;
          }
          return prev;
        });
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const onRomChange = (filename: string) => {
    setSelectedRom(filename);
    localStorage.setItem(ROM_STORAGE_KEY, filename);
  };

  const filtered = useMemo(() => {
    if (!games) return [];
    const q = query.trim().toLowerCase();
    return q ? games.filter((g) => g.name.toLowerCase().includes(q)) : games;
  }, [games, query]);

  const loading = games === null || roms === null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games…"
            className="pl-9"
          />
        </div>

        {roms && roms.length > 0 && (
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedRom} onValueChange={onRomChange}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select Kickstart ROM" />
              </SelectTrigger>
              <SelectContent>
                {roms.map((rom) => (
                  <SelectItem key={rom.filename} value={rom.filename}>
                    {rom.name} · {rom.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {manage && selectedRom && (
              <Button
                variant="destructive"
                size="icon"
                aria-label="Delete selected ROM"
                onClick={() => {
                  const rom = roms.find((r) => r.filename === selectedRom);
                  if (rom) requestDeleteRom(rom);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        <Button
          variant={manage ? 'default' : 'outline'}
          className="gap-2"
          aria-pressed={manage}
          onClick={() => setManage((m) => !m)}
        >
          <Wrench className="h-4 w-4" /> {manage ? 'Done' : 'Manage'}
        </Button>

        <UploadDialog onUploaded={reload} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t load the library</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ROM setup notice */}
      {!loading && roms && roms.length === 0 && (
        <Alert>
          <HardDrive className="h-4 w-4" />
          <AlertTitle className="font-amiga">No Kickstart ROM found</AlertTitle>
          <AlertDescription>
            <span>
              Upload a Kickstart ROM (.rom or .bin) with the Upload button. Kickstart 1.3 is recommended for most
              classic A500 games. ROMs are copyrighted — obtain them legally (e.g. via Amiga Forever).
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {SKELETON_KEYS.map((k) => (
            <Skeleton key={k} className="aspect-[4/3] w-full rounded-md" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Joystick className="h-4 w-4" />
            <span>
              {filtered.length} game{filtered.length === 1 ? '' : 's'}
            </span>
            {query && <Badge variant="secondary">filtered</Badge>}
            {manage && (
              <Badge variant="outline" className="gap-1 text-destructive">
                <Trash2 className="h-3 w-3" /> manage mode
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((game) => (
              <GameCard key={game.slug ?? game.filename} game={game} manage={manage} onDelete={requestDeleteGame} />
            ))}
          </div>
        </>
      ) : games && games.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-10 text-center">
          <Joystick className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="font-amiga text-lg">Your library is empty</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Upload Amiga disk images (<code>.adf</code>, <code>.adz</code>, <code>.dms</code>, <code>.zip</code>) to get
            started. Multi-disk games are grouped automatically by filename.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No games match “{query}”.
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-amiga">Delete from volume?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `This permanently deletes ${pendingDelete.label} from the Unity Catalog volume. This can’t be undone.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertTitle>Delete failed</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" className="gap-2" disabled={deleting} onClick={() => void confirmDelete()}>
              <Trash2 className="h-4 w-4" /> {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
