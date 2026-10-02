import { Link } from 'react-router';
import { Badge } from '@databricks/appkit-ui/react';
import { Disc3, Save } from 'lucide-react';
import { coverColors, gameKey, type GameEntry } from '@/lib/api';

export function GameCard({ game }: { game: GameEntry }) {
  const { from, to } = coverColors(game.name);
  const diskCount = game.disks?.length ?? 1;

  return (
    <Link
      to={`/play/${encodeURIComponent(gameKey(game))}`}
      className="group block focus:outline-none"
      aria-label={`Play ${game.name}`}
    >
      <div className="overflow-hidden rounded-md border border-border bg-card transition-all group-hover:border-primary group-focus-visible:border-primary group-hover:-translate-y-0.5">
        {/* Cover tile */}
        <div
          className="disk-tile relative flex aspect-[4/3] items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
        >
          <Disc3 className="h-14 w-14 text-white/80 drop-shadow transition-transform group-hover:scale-110" />
          <span className="absolute right-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[0.6rem] font-amiga uppercase tracking-wide text-white">
            {game.type}
          </span>
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 p-1.5">
            {game.disks && (
              <Badge variant="secondary" className="gap-1 text-[0.6rem]">
                <Disc3 className="h-3 w-3" /> {diskCount} disks
              </Badge>
            )}
            {game.hasSaveDisk && (
              <Badge variant="secondary" className="gap-1 text-[0.6rem]">
                <Save className="h-3 w-3" /> save
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
  );
}
