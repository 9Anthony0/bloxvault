"use client";
import type { GameDTO } from "@/lib/dto";
import { GameArt, GameStats, GemBadge, LaunchButton, TagChip } from "./ui";

export function DropGameArt({ game }: { game: GameDTO }) {
  return <GameArt game={game} className="hidden aspect-video w-40 shrink-0 rounded-lg sm:block" />;
}

export function DropStats({ game }: { game: GameDTO }) {
  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex items-center gap-2">
        <GameStats game={game} />
        <GemBadge game={game} />
      </div>
      <div className="flex flex-wrap gap-1">
        {game.tags.slice(0, 3).map((t) => (
          <TagChip key={t.slug} label={t.label} className="px-2 py-0.5 text-[11px]" />
        ))}
      </div>
    </div>
  );
}

export function DropLaunch({ placeId }: { placeId: number }) {
  return <LaunchButton placeId={placeId} compactMode />;
}
