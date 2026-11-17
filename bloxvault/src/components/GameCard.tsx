"use client";
import { Check, Film } from "lucide-react";
import type { VaultEntryDTO } from "@/lib/dto";
import { cn, relativeTime, sourcePlatform } from "@/lib/format";
import { GameArt, GameStats, GemBadge, LaunchButton, StarRating, StatusPill, TagChip } from "./ui";

export function GameCard({
  entry,
  onOpen,
  selectMode = false,
  selected = false,
  onToggle,
}: {
  entry: VaultEntryDTO;
  onOpen: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const g = entry.game;
  const src = sourcePlatform(entry.sourceUrl);
  return (
    <article
      onClick={selectMode ? onToggle : onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), selectMode ? onToggle?.() : onOpen())}
      tabIndex={0}
      aria-pressed={selectMode ? selected : undefined}
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden rounded-xl bg-ink-900 ring-1 transition outline-none focus-visible:ring-2 focus-visible:ring-go",
        selected ? "ring-2 ring-go" : "ring-ink-800 hover:-translate-y-0.5 hover:ring-ink-600",
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-ink-850">
        {selectMode && (
          <span className={cn("absolute right-2 bottom-2 z-10 grid size-6 place-items-center rounded-md ring-2 backdrop-blur", selected ? "bg-go text-ink-950 ring-go" : "bg-black/50 ring-white/60")}>
            {selected && <Check className="size-4" strokeWidth={3} />}
          </span>
        )}
        <GameArt game={g} className="size-full transition duration-300 group-hover:scale-[1.03]" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
          <StatusPill status={entry.status} className="backdrop-blur" />
          <GemBadge game={g} className="backdrop-blur" />
        </div>
        {src && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-100 backdrop-blur" title={`Found on ${src.label}`}>
            <Film className="size-3" /> {src.short}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2.5">
          <GameArt game={g} variant="icon" className="size-9 shrink-0 rounded-md ring-1 ring-ink-700" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight">{g.name}</h3>
            <p className="truncate text-xs text-ink-400">by {g.creatorName || "unknown"}</p>
          </div>
        </div>
        <GameStats game={g} />
        <div className="flex flex-wrap gap-1">
          {g.tags.slice(0, 3).map((t) => (
            <TagChip key={t.slug} label={t.label} className="px-2 py-0.5 text-[11px]" />
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {entry.starRating ? (
            <StarRating value={entry.starRating} size={14} readOnly />
          ) : (
            <span className="text-[11px] text-ink-400">{entry.lastPlayedOn ? `Played ${relativeTime(entry.lastPlayedOn + "T12:00:00")}` : `Saved ${relativeTime(entry.createdAt)}`}</span>
          )}
          <LaunchButton placeId={g.rootPlaceId} compactMode />
        </div>
      </div>
    </article>
  );
}

export function RecentRow({ entry, onOpen }: { entry: VaultEntryDTO; onOpen: () => void }) {
  const g = entry.game;
  const src = sourcePlatform(entry.sourceUrl);
  return (
    <button onClick={onOpen} className="animate-rise flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-ink-850">
      <GameArt game={g} variant="icon" className="size-14 shrink-0 rounded-xl ring-1 ring-ink-800" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{g.name}</span>
          <GemBadge game={g} className="shrink-0" />
        </div>
        <GameStats game={g} className="mt-0.5" />
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-400">
          <StatusPill status={entry.status} />
          <span>{entry.lastPlayedOn ? `played ${relativeTime(entry.lastPlayedOn + "T12:00:00")}` : relativeTime(entry.createdAt)}</span>
          {src && (
            <span className="inline-flex items-center gap-0.5">
              · <Film className="size-3" /> {src.short}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
