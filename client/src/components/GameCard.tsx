import { Link } from 'react-router';
import { Badge, Button } from '@databricks/appkit-ui/react';
import { Trash2 } from 'lucide-react';
import { coverColors, gameKey, type GameEntry } from '@/lib/api';
import { FloppyDisk, FloppyGlyph, FloppySaveGlyph } from '@/components/FloppyDisk';

export function GameCard({
  game,
  manage = false,
  onDelete,
}: {
  game: GameEntry;
  manage?: boolean;
  onDelete?: (game: GameEntry) => void;
}) {
  const { from, to } = coverColors(game.name);
  const diskCount = game.disks?.length ?? 1;
  const gradientId = `fd-${(game.slug ?? game.filename ?? game.name).replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className="group relative">
      <Link
        to={`/play/${encodeURIComponent(gameKey(game))}`}
        className="block focus:outline-none"
        aria-label={`Play ${game.name}`}
      >
        <div className="overflow-hidden rounded-md border border-border bg-card transition-all group-hover:-translate-y-0.5 group-hover:border-primary group-focus-within:border-primary">
          {/* Cover tile — the game as a 3.5" floppy disk */}
          <div className="disk-tile relative flex aspect-[4/3] items-center justify-center">
            <FloppyDisk
              from={from}
              to={to}
              gradientId={gradientId}
              className="h-[82%] w-auto drop-shadow-lg transition-transform group-hover:-rotate-2 group-hover:scale-105"
            />
            <span className="absolute right-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 font-amiga text-[0.6rem] uppercase tracking-wide text-white">
              {game.type}
            </span>
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 p-1.5">
              {game.disks && (
                <Badge variant="secondary" className="gap-1 text-[0.6rem]">
                  <FloppyGlyph className="h-3 w-3" /> {diskCount} disks
                </Badge>
              )}
              {game.hasSaveDisk && (
                <Badge variant="secondary" className="gap-1 text-[0.6rem]">
                  <FloppySaveGlyph className="h-3 w-3" /> save
                </Badge>
              )}
            </div>
          </div>
          <div className="p-2.5">
            <p className="truncate text-sm font-medium text-foreground" title={game.name}>
              {game.name}
            </p>
          </div>
        </div>
      </Link>

      {manage && (
        <Button
          type="button"
          size="icon"
          variant="destructive"
          className="absolute left-1.5 top-1.5 h-7 w-7 shadow-md"
          aria-label={`Delete ${game.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete?.(game);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
