"use client";
import { Clock, ExternalLink, Gem, Loader2, Plus, ThumbsUp, Users, X } from "lucide-react";
import Link from "next/link";
import type { CandidateDTO } from "@/lib/dto";
import { cn, compact } from "@/lib/format";
import { PARTY_META } from "@/lib/constants";
import type { FilterKey, ParsedQuery } from "@/lib/vibe";

export type SearchSort = "best" | "gems" | "fewest";

export interface SearchState {
  q: string;
  phase: "idle" | "fast" | "full";
  loading: boolean;
  refining: boolean;
  parsed: ParsedQuery | null;
  vault: CandidateDTO[];
  results: CandidateDTO[];
  error: string | null;
}

export function sortResults(list: CandidateDTO[], sort: SearchSort, hideBig: boolean) {
  const l = hideBig ? list.filter((c) => c.playerCount < 5000) : [...list];
  if (sort === "gems") l.sort((a, b) => Number(b.isHiddenGem) - Number(a.isHiddenGem) || b.hiddenGemScore - a.hiddenGemScore);
  if (sort === "fewest") l.sort((a, b) => a.playerCount - b.playerCount);
  return l;
}

/** Flat list in display order — used for keyboard navigation. */
export function flatRows(s: SearchState, sort: SearchSort, hideBig: boolean) {
  return [...s.vault.map((c) => ({ c, section: "vault" as const })), ...sortResults(s.results, sort, hideBig).map((c) => ({ c, section: "roblox" as const }))];
}

export function SearchDropdown({
  state,
  sort,
  hideBig,
  active,
  savingId,
  recent,
  onSort,
  onHideBig,
  onRemoveFilter,
  onPick,
  onOpenEntry,
  onRecent,
  onClearRecent,
  onHover,
}: {
  state: SearchState;
  sort: SearchSort;
  hideBig: boolean;
  active: number;
  savingId: number | null;
  recent: string[];
  onSort: (s: SearchSort) => void;
  onHideBig: (v: boolean) => void;
  onRemoveFilter: (k: FilterKey) => void;
  onPick: (c: CandidateDTO) => void;
  onOpenEntry: (entryId: string) => void;
  onRecent: (q: string) => void;
  onClearRecent: () => void;
  onHover: (i: number) => void;
}) {
  // Empty input → recent searches
  if (state.phase === "idle") {
    if (!recent.length) return null;
    return (
      <Panel>
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Recent searches</span>
          <button onMouseDown={(e) => e.preventDefault()} onClick={onClearRecent} className="text-[11px] text-ink-400 hover:text-ink-100">
            Clear
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          {recent.map((r) => (
            <button key={r} onMouseDown={(e) => e.preventDefault()} onClick={() => onRecent(r)} className="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2.5 py-1 text-xs text-ink-300 ring-1 ring-ink-700 hover:text-ink-100">
              <Clock className="size-3" /> {r}
            </button>
          ))}
        </div>
        <Tips />
      </Panel>
    );
  }

  const p = state.parsed;
  const results = sortResults(state.results, sort, hideBig);
  const vaultRows = state.vault;
  let idx = -1;
  const chips: { key: FilterKey; label: string }[] = p
    ? [
        ...p.tags.map((t) => ({ key: `tag:${t.slug}` as FilterKey, label: t.label })),
        ...(p.maxCcu !== null ? [{ key: "maxCcu" as FilterKey, label: `≤ ${compact(p.maxCcu)} players` }] : []),
        ...(p.party ? [{ key: "party" as FilterKey, label: PARTY_META[p.party] }] : []),
        ...(p.minApproval !== null ? [{ key: "minApproval" as FilterKey, label: `≥ ${p.minApproval}% approval` }] : []),
        ...(p.gemsOnly ? [{ key: "gemsOnly" as FilterKey, label: "Hidden gems" }] : []),
      ]
    : [];

  return (
    <Panel>
      {/* Toolbar: parsed filters + sort */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-800 px-3 py-2">
        {chips.length > 0 && <span className="mr-0.5 text-[11px] text-ink-400">{p?.isVibe ? "Vibe:" : "Filters:"}</span>}
        {chips.map((ch) => (
          <button
            key={ch.key}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onRemoveFilter(ch.key)}
            className="inline-flex items-center gap-1 rounded-full bg-gem/15 px-2 py-0.5 text-[11px] font-medium text-gem ring-1 ring-gem/30 hover:bg-gem/25"
            title="Remove this filter"
          >
            {ch.label} <X className="size-3" />
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {(["best", "gems", "fewest"] as const).map((s) => (
            <button
              key={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSort(s)}
              className={cn("rounded-md px-2 py-0.5 text-[11px] transition", sort === s ? "bg-ink-100 text-ink-950" : "text-ink-400 hover:text-ink-100")}
            >
              {s === "best" ? "Best match" : s === "gems" ? "Gems first" : "Fewest players"}
            </button>
          ))}
          <label className="ml-1 flex cursor-pointer items-center gap-1 text-[11px] text-ink-400" onMouseDown={(e) => e.preventDefault()}>
            <input type="checkbox" checked={hideBig} onChange={(e) => onHideBig(e.target.checked)} className="accent-[var(--color-go)]" />
            Hide 5k+
          </label>
        </div>
      </div>

      <div className="max-h-[55dvh] overflow-y-auto lg:max-h-[62vh]">
        {vaultRows.length > 0 && (
          <Section title="In your vault">
            {vaultRows.map((c) => {
              idx++;
              const i = idx;
              return <Row key={`v${c.universeId}`} c={c} active={active === i} onHover={() => onHover(i)} onClick={() => c.entryId && onOpenEntry(c.entryId)} actionLabel="Open" />;
            })}
          </Section>
        )}

        <Section
          title={p?.isVibe ? "Matches" : "On Roblox"}
          right={state.refining ? (
            <span className="flex items-center gap-1 text-[10px] text-ink-400">
              <Loader2 className="size-3 animate-spin" /> reading descriptions…
            </span>
          ) : null}
        >
          {state.loading && !results.length ? (
            <div className="space-y-1 px-3 py-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div className="size-11 animate-pulse rounded-lg bg-ink-800" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/2 animate-pulse rounded bg-ink-800" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-ink-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-5 text-center text-xs text-ink-400">
              {state.error ?? (state.refining ? "Looking…" : chips.length ? "Nothing matches all of those filters. Try removing one." : "No games found. Try fewer or different words.")}
            </p>
          ) : (
            results.map((c) => {
              idx++;
              const i = idx;
              return <Row key={`r${c.universeId}`} c={c} active={active === i} saving={savingId === c.universeId} onHover={() => onHover(i)} onClick={() => (c.inVault && c.entryId ? onOpenEntry(c.entryId) : onPick(c))} actionLabel={c.inVault ? "Open" : "Vault"} />;
            })
          )}
        </Section>
      </div>
      <div className="hidden items-center gap-3 border-t border-ink-800 px-3 py-1.5 text-[10px] text-ink-400 lg:flex">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span>
          <Kbd>Enter</Kbd> vault / open
        </span>
        <span>
          <Kbd>Esc</Kbd> close
        </span>
        <span className="ml-auto">Nothing is saved until you pick a game.</span>
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="animate-rise mb-2 overflow-hidden rounded-2xl bg-ink-850/97 ring-1 ring-ink-700 backdrop-blur-xl lg:mb-0 lg:shadow-2xl lg:shadow-black/60">{children}</div>;
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{title}</h4>
        {right}
      </div>
      <ul>{children}</ul>
    </section>
  );
}

function Row({ c, active, saving, onClick, onHover, actionLabel }: { c: CandidateDTO; active: boolean; saving?: boolean; onClick: () => void; onHover: () => void; actionLabel: string }) {
  return (
    <li>
      <div
        role="option"
        aria-selected={active}
        onMouseEnter={onHover}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn("group flex cursor-pointer items-center gap-3 px-3 py-2 transition", active ? "bg-ink-800" : "hover:bg-ink-800/60")}
      >
        {c.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.iconUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-ink-700" />
        ) : (
          <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-ink-700 to-ink-800 text-xs font-bold text-white/60 ring-1 ring-ink-700">
            {c.name
              .replace(/[^\p{L}\p{N}\s]/gu, "")
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]!.toUpperCase())
              .join("")}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{c.name}</span>
            {c.isHiddenGem && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-gem/15 px-1 text-[10px] font-semibold text-gem">
                <Gem className="size-2.5" /> gem
              </span>
            )}
            {c.inVault && <span className="shrink-0 rounded bg-go/10 px-1 text-[10px] font-semibold text-go">in vault</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-ink-400">
            <span className="inline-flex items-center gap-1">
              <span className={cn("size-1.5 rounded-full", c.playerCount > 0 ? "bg-go" : "bg-ink-600")} />
              {compact(c.playerCount)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="size-3" />
              {c.approvalPercentage}%
            </span>
            {c.maxPlayers > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                {c.maxPlayers}
              </span>
            )}
            {(c.tags ?? []).slice(0, 2).map((t) => (
              <span key={t.slug} className="hidden truncate rounded bg-ink-800 px-1 text-[10px] text-ink-300 sm:inline">
                {t.label}
              </span>
            ))}
          </div>
          {c.reason && <div className="mt-0.5 truncate text-[11px] text-sky-300/90">{c.reason}</div>}
        </div>
        <Link
          href={`/game/${c.universeId}`}
          onClick={(e) => e.stopPropagation()}
          className="hidden shrink-0 rounded-md p-1.5 text-ink-400 opacity-0 transition hover:bg-ink-700 hover:text-ink-100 group-hover:opacity-100 sm:block"
          title="Open game page"
        >
          <ExternalLink className="size-3.5" />
        </Link>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ring-1", c.inVault ? "bg-ink-800 text-ink-300 ring-ink-700" : "bg-go/10 text-go ring-go/30")}>
          {saving ? <Loader2 className="size-3 animate-spin" /> : !c.inVault && <Plus className="size-3" />}
          {actionLabel}
        </span>
      </div>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mr-0.5 rounded bg-ink-800 px-1 py-px font-mono text-[10px] text-ink-300 ring-1 ring-ink-700">{children}</kbd>;
}

function Tips() {
  return (
    <div className="border-t border-ink-800 px-3 py-2 text-[11px] leading-relaxed text-ink-400">
      Try a name (<i>type soul</i>), a vibe (<i>co-op horror under 500 players</i>, <i>solo parry games highly rated</i>), or paste a Roblox / TikTok / Reel link to save it instantly.
    </div>
  );
}
