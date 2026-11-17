"use client";
import { EyeOff, Heart, Loader2, Plus, Sparkles, Telescope, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecommendationDTO } from "@/lib/client-api";
import { TAG_BY_SLUG } from "@/lib/constants";
import { cn } from "@/lib/format";
import { GameArt, GameStats, GemBadge, LaunchButton } from "./ui";

export function RecommendationShelf({
  items,
  seeds,
  topTags,
  loading,
  onVault,
  onDigDeeper,
  onDismiss,
  onImport,
  className,
}: {
  items: RecommendationDTO[];
  seeds: string[];
  topTags: string[];
  loading: boolean;
  onVault: (universeId: number) => Promise<void>;
  onDigDeeper: () => Promise<void>;
  /** "Not interested" — undo=true restores it */
  onDismiss: (universeId: number, undo?: boolean) => Promise<void>;
  /** Opens the Roblox-favorites import (shown when there's no taste signal yet) */
  onImport?: () => void;
  className?: string;
}) {
  const [digging, setDigging] = useState(false);
  const [vaulting, setVaulting] = useState<number | null>(null);
  const [hidden, setHidden] = useState<{ id: number; name: string } | null>(null);
  const visible = items.filter((r) => r.game.universeId !== hidden?.id);
  useEffect(() => {
    if (!hidden) return;
    const t = setTimeout(() => setHidden(null), 6000);
    return () => clearTimeout(t);
  }, [hidden]);

  return (
    <section className={cn("rounded-2xl bg-gradient-to-b from-gem/[0.07] to-transparent p-4 ring-1 ring-gem/15", className)}>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-gem" /> Hidden gems for you
          </h2>
          <p className="mt-0.5 text-xs text-ink-400">
            {seeds.length ? (
              <>
                Built from {seeds.slice(0, 2).join(" & ")}
                {seeds.length > 2 && ` +${seeds.length - 2}`} · tuned to {topTags.slice(0, 3).map((t) => TAG_BY_SLUG[t]?.label ?? t).join(", ")}
              </>
            ) : (
              "Mark games as Loved or rate them 4★+ to train your Taste Graph."
            )}
          </p>
        </div>
        <button
          onClick={async () => {
            setDigging(true);
            await onDigDeeper().finally(() => setDigging(false));
          }}
          disabled={digging || !seeds.length}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-850 px-2.5 py-1.5 text-xs text-ink-100 ring-1 ring-ink-700 hover:ring-gem/40 disabled:opacity-40"
          title="Search Roblox for more games matching your top mechanics"
        >
          {digging ? <Loader2 className="size-3.5 animate-spin" /> : <Telescope className="size-3.5" />}
          Dig deeper
        </button>
      </header>

      {hidden && (
        <div className="animate-rise mb-3 flex items-center justify-between rounded-lg bg-ink-850 px-3 py-2 text-xs ring-1 ring-ink-700">
          <span className="text-ink-300">
            Hid <b className="text-ink-100">{hidden.name}</b>. You&apos;ll see fewer games like it.
          </span>
          <button
            onClick={async () => {
              const id = hidden.id;
              setHidden(null);
              await onDismiss(id, true);
            }}
            className="inline-flex items-center gap-1 text-ink-300 hover:text-ink-100"
          >
            <Undo2 className="size-3.5" /> Undo
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 w-64 shrink-0 animate-pulse rounded-xl bg-ink-850" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        seeds.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="max-w-sm text-xs text-ink-400">Recommendations learn from games you Love or rate 4★+. The fastest way to start is importing the games you&apos;ve favorited on Roblox.</p>
            {onImport && (
              <button onClick={onImport} className="inline-flex items-center gap-1.5 rounded-lg bg-go px-3 py-2 text-xs font-semibold text-ink-950">
                <Heart className="size-3.5" /> Import Roblox favorites
              </button>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-ink-400">No matches in the pool yet. Hit “Dig deeper” to pull fresh candidates from Roblox.</p>
        )
      ) : (
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
          {visible.map((r) => (
            <article key={r.game.universeId} className="group/card flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-xl bg-ink-900 ring-1 ring-ink-800 transition hover:ring-ink-600">
              <div className="relative aspect-video bg-ink-850">
                <Link href={`/game/${r.game.universeId}`} aria-label={`Open ${r.game.name}`}>
                  <GameArt game={r.game} className="size-full" />
                </Link>
                <button
                  onClick={async () => {
                    setHidden({ id: r.game.universeId, name: r.game.name });
                    await onDismiss(r.game.universeId);
                  }}
                  className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[10px] font-medium text-ink-100 opacity-100 backdrop-blur transition hover:bg-black/80 lg:opacity-0 lg:group-hover/card:opacity-100"
                  title="Not interested: hide this and show fewer like it"
                >
                  <EyeOff className="size-3" /> Not interested
                </button>
                <div className="absolute right-2 top-2">
                  <GemBadge game={r.game} className="backdrop-blur" />
                </div>
                <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-100 backdrop-blur">
                  {Math.round(r.match * 100)}% taste match
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <Link href={`/game/${r.game.universeId}`} className="truncate text-sm font-semibold hover:underline">
                  {r.game.name}
                </Link>
                <GameStats game={r.game} />
                <p className="line-clamp-2 text-[11px] leading-snug text-ink-400" title={r.why}>
                  {r.why}
                </p>
                <div className="flex flex-wrap gap-1">
                  {r.matchedTags.slice(0, 3).map((t) => (
                    <span key={t.slug} className="rounded bg-gem/10 px-1.5 py-0.5 text-[10px] text-gem">
                      {t.label}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex gap-1.5 pt-1.5">
                  <button
                    onClick={async () => {
                      setVaulting(r.game.universeId);
                      await onVault(r.game.universeId).finally(() => setVaulting(null));
                    }}
                    disabled={vaulting === r.game.universeId}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-ink-800 py-1.5 text-xs font-medium ring-1 ring-ink-700 hover:ring-ink-600 disabled:opacity-50"
                  >
                    {vaulting === r.game.universeId ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Vault
                  </button>
                  <LaunchButton placeId={r.game.rootPlaceId} compactMode className="flex-1" />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
