"use client";
import { Gem, Rocket, Star, ThumbsUp, Users } from "lucide-react";
import { useState } from "react";
import { robloxLaunchUrl, robloxWebUrl, STATUS_META, type VaultStatus } from "@/lib/constants";
import { cn, compact } from "@/lib/format";
import type { GameDTO } from "@/lib/dto";

/* ---------------- Star rating (0.5 – 5.0, half-star) ---------------- */

export function StarRating({ value, onChange, size = 22, readOnly = false }: { value: number | null; onChange?: (v: number | null) => void; size?: number; readOnly?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)} role={readOnly ? "img" : "radiogroup"} aria-label={`Rating ${value ?? 0} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = shown >= i ? 1 : shown >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-ink-600" style={{ width: size, height: size }} strokeWidth={1.5} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 1 ? size : size / 2 }}>
                <Star className="text-go fill-go" style={{ width: size, height: size }} strokeWidth={1.5} />
              </span>
            )}
            {!readOnly && (
              <>
                <button
                  type="button"
                  aria-label={`${i - 0.5} stars`}
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(i - 0.5)}
                  onClick={() => onChange?.(value === i - 0.5 ? null : i - 0.5)}
                />
                <button
                  type="button"
                  aria-label={`${i} stars`}
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => onChange?.(value === i ? null : i)}
                />
              </>
            )}
          </span>
        );
      })}
      {!readOnly && <span className="ml-2 w-7 text-sm tabular-nums text-ink-300">{shown ? shown.toFixed(1) : "—"}</span>}
    </div>
  );
}

/* ---------------- Anti-slop sub-slider (1–5) ---------------- */

export function SubSlider({ label, low, high, value, onChange, invert }: { label: string; low: string; high: string; value: number | null; onChange: (v: number | null) => void; invert?: boolean }) {
  const v = value ?? 3;
  // For "bad when high" meters, color shifts green → red as the value rises.
  const hue = invert ? 140 - (v - 1) * 35 : 200 + (v - 1) * 20;
  const color = `hsl(${hue} 75% 55%)`;
  return (
    <div className={cn("rounded-xl bg-ink-850 p-3 ring-1 ring-ink-700", value === null && "opacity-70")}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums" style={{ color: value === null ? undefined : color }}>
            {value === null ? "not rated" : `${v}/5`}
          </span>
          {value !== null && (
            <button type="button" onClick={() => onChange(null)} className="text-[11px] text-ink-400 hover:text-ink-100">
              clear
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ ["--pct" as string]: `${((v - 1) / 4) * 100}%`, ["--track-fill" as string]: color }}
        aria-label={label}
      />
      <div className="mt-0.5 flex justify-between text-[11px] text-ink-400">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

/* ---------------- Status pill ---------------- */

export function StatusPill({ status, className }: { status: VaultStatus; className?: string }) {
  const m = STATUS_META[status];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", m.color, className)}>{m.short}</span>;
}

/* ---------------- Launch ---------------- */

export function LaunchButton({ placeId, className, compactMode = false }: { placeId: number; className?: string; compactMode?: boolean }) {
  return (
    <a
      href={robloxLaunchUrl(placeId)}
      onClick={(e) => e.stopPropagation()}
      title="Boot the Roblox desktop client directly"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg bg-go font-semibold text-ink-950 transition hover:bg-go-dim active:scale-[0.98]",
        compactMode ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        className,
      )}
    >
      <Rocket className={compactMode ? "size-3.5" : "size-4"} />
      Launch Game
    </a>
  );
}

export function WebLink({ placeId, className }: { placeId: number; className?: string }) {
  return (
    <a href={robloxWebUrl(placeId)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={cn("text-xs text-ink-400 underline-offset-2 hover:text-ink-100 hover:underline", className)}>
      roblox.com ↗
    </a>
  );
}

/* ---------------- Stats ---------------- */

export function GameStats({ game, className }: { game: GameDTO; className?: string }) {
  const synced = game.lastSyncedAt !== null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-300", className)}>
      <span className="inline-flex items-center gap-1" title="Live concurrent players">
        <span className={cn("size-1.5 rounded-full", game.ccu > 0 ? "bg-go" : "bg-ink-600")} />
        {synced ? compact(game.ccu) : "—"} playing
      </span>
      <span className="inline-flex items-center gap-1" title={`${compact(game.upVotes)} likes · ${compact(game.downVotes)} dislikes`}>
        <ThumbsUp className="size-3" />
        {synced ? `${game.approvalPercentage.toFixed(0)}%` : "—"}
      </span>
      {game.maxPlayers > 0 && (
        <span className="inline-flex items-center gap-1" title="Max players per server">
          <Users className="size-3" />
          {game.maxPlayers}
        </span>
      )}
    </div>
  );
}

export function GemBadge({ game, className }: { game: GameDTO; className?: string }) {
  if (!game.lastSyncedAt) return null;
  return (
    <span
      title="Hidden Gem Score: quality (Wilson-adjusted approval) × obscurity (CCU) × freshness (last update)"
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1",
        game.isHiddenGem ? "bg-gem/15 text-gem ring-gem/40" : "bg-ink-800 text-ink-300 ring-ink-700",
        className,
      )}
    >
      <Gem className="size-3" />
      {Math.round(game.hiddenGemScore)}
    </span>
  );
}

export function TagChip({ label, active, onClick, count, className }: { label: string; active?: boolean; onClick?: () => void; count?: number; className?: string }) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs ring-1 transition",
        active ? "bg-ink-100 text-ink-950 ring-ink-100" : "bg-ink-850 text-ink-300 ring-ink-700",
        onClick && !active && "hover:text-ink-100 hover:ring-ink-600",
        className,
      )}
    >
      {label}
      {count !== undefined && <span className={cn("tabular-nums", active ? "text-ink-700" : "text-ink-400")}>{count}</span>}
    </Comp>
  );
}

export function GameArt({ game, variant = "thumb", className }: { game: GameDTO; variant?: "thumb" | "icon"; className?: string }) {
  const src = variant === "thumb" ? game.thumbnailUrls[0] ?? game.iconUrl : game.iconUrl ?? game.thumbnailUrls[0];
  if (!src) {
    const initials = game.name
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
    // Deterministic hue per game so placeholders are distinguishable
    const hue = [...game.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    return (
      <div
        className={cn("grid place-items-center overflow-hidden", className)}
        style={{ background: `linear-gradient(135deg, hsl(${hue} 35% 22%), hsl(${(hue + 40) % 360} 30% 12%))` }}
        aria-label={game.name}
      >
        <span className={cn("font-bold tracking-tight text-white/70", variant === "icon" ? "text-sm" : "text-3xl")}>{initials}</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={game.name} loading="lazy" className={cn("object-cover", className)} />;
}
