import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { Cpu, Gamepad2, HardDrive, Search } from 'lucide-react';
import { api, type GameEntry, type RomEntry } from '@/lib/api';
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

  const reload = () => setReloadKey((k) => k + 1);

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
          </div>
        )}

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
            <Gamepad2 className="h-4 w-4" />
            <span>
              {filtered.length} game{filtered.length === 1 ? '' : 's'}
            </span>
            {query && <Badge variant="secondary">filtered</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((game) => (
              <GameCard key={game.slug ?? game.filename} game={game} />
            ))}
          </div>
        </>
      ) : games && games.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-10 text-center">
          <Gamepad2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
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
    </div>
  );
}
