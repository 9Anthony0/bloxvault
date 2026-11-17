"use client";
import { CheckSquare, Gem, Heart, Layers, ListMusic, RefreshCw, SlidersHorizontal, Sparkles, Clock, X } from "lucide-react";
import { BulkBar } from "./BulkBar";
import { DEMO_PLACE_IDS } from "@/lib/constants";
import { ImportFavoritesModal } from "./ImportFavoritesModal";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type IngestResponse, type RecommendationDTO } from "@/lib/client-api";
import type { VaultEntryDTO } from "@/lib/dto";
import { activeFilterCount, applyFilters, DEFAULT_FILTERS, type VaultFilters } from "@/lib/filters";
import { cn } from "@/lib/format";
import type { ListDTO } from "@/lib/lists";
import { GameCard, RecentRow } from "./GameCard";
import { GameDetailModal } from "./GameDetailModal";
import { QuickDropBar, type QuickDropHandle } from "./QuickDropBar";
import { RecommendationShelf } from "./RecommendationShelf";
import { SortSelect, VaultFiltersPanel } from "./VaultFilters";

type MobileTab = "recent" | "vault" | "foryou";

export function AppShell() {
  const [entries, setEntries] = useState<VaultEntryDTO[]>([]);
  const [recs, setRecs] = useState<{ items: RecommendationDTO[]; seeds: string[]; topTags: string[] }>({ items: [], seeds: [], topTags: [] });
  const [lists, setLists] = useState<ListDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState<VaultFilters>(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<MobileTab>("recent");
  const [recentBy, setRecentBy] = useState<"vaulted" | "played">("vaulted");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shareInput, setShareInput] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectModeRef = useRef(false);
  selectModeRef.current = selectMode;
  const openRef = useRef<string | null>(null);
  openRef.current = openId;
  const deskBar = useRef<QuickDropHandle>(null);
  const mobileBar = useRef<QuickDropHandle>(null);
  // Two Quick-Drop instances exist (header on desktop, bottom bar on mobile); only the visible one gets the share payload.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const loadVault = useCallback(async () => {
    try {
      const v = await api.vault();
      setEntries(v.entries);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  const loadRecs = useCallback(async () => {
    setRecsLoading(true);
    try {
      setRecs(await api.recommendations());
    } catch {
      /* shelf just stays empty */
    } finally {
      setRecsLoading(false);
    }
  }, []);
  const loadLists = useCallback(async () => setLists((await api.lists().catch(() => ({ lists: [] }))).lists), []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const { refreshed } = await api.sync();
      if (refreshed > 0) await Promise.all([loadVault(), loadRecs()]);
    } catch {
      /* offline / rate limited — cached data is fine */
    } finally {
      setSyncing(false);
    }
  }, [loadVault, loadRecs]);

  useEffect(() => {
    // Share-sheet target: /?url=…&text=…&title=…
    const p = new URLSearchParams(window.location.search);
    const shared = [p.get("url"), p.get("text"), p.get("title")].filter(Boolean).join(" ").trim();
    if (shared) setShareInput(shared);
    const openParam = p.get("open");
    if (openParam) setOpenId(openParam);
    if (shared || openParam) window.history.replaceState(null, "", "/");
    Promise.all([loadVault(), loadRecs(), loadLists()]).then(syncNow);
  }, [loadVault, loadRecs, loadLists, syncNow]);

  // Keyboard: "/" focuses search (unless you're typing somewhere), Esc is handled by each panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      if (e.key === "Escape" && !typing && selectModeRef.current && !openRef.current) {
        setSelectMode(false);
        setSelected(new Set());
      }
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        (isDesktop ? deskBar : mobileBar).current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop]);

  const onVaulted = useCallback(
    (r: IngestResponse) => {
      setEntries((prev) => [r.entry, ...prev.filter((e) => e.id !== r.entry.id)]);
      loadRecs();
    },
    [loadRecs],
  );
  const onRemoved = useCallback((id: string) => setEntries((prev) => prev.filter((e) => e.id !== id)), []);
  const onEntryChange = useCallback(
    (e: VaultEntryDTO) => {
      setEntries((prev) => prev.map((x) => (x.id === e.id ? e : x)));
      loadRecs();
    },
    [loadRecs],
  );

  const filtered = useMemo(() => applyFilters(entries, filters), [entries, filters]);
  const tagFacets = useMemo(() => {
    const m = new Map<string, { slug: string; label: string; count: number }>();
    for (const e of entries) for (const t of e.game.tags) m.set(t.slug, { slug: t.slug, label: t.label, count: (m.get(t.slug)?.count ?? 0) + 1 });
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [entries]);
  const statusCounts = useMemo(() => entries.reduce<Record<string, number>>((acc, e) => ((acc[e.status] = (acc[e.status] ?? 0) + 1), acc), {}), [entries]);
  const open = entries.find((e) => e.id === openId) ?? null;
  const nActive = activeFilterCount(filters);
  const gemCount = entries.filter((e) => e.game.isHiddenGem).length;

  const vaultFromRec = async (universeId: number) => {
    const r = await api.vaultById({ universeId });
    onVaulted(r);
  };
  const dismissRec = async (universeId: number, undo = false) => {
    await api.dismiss(universeId, undo).catch(() => {});
    if (!undo) setTimeout(loadRecs, 4000); // let the Undo toast breathe, then refill the shelf
    else loadRecs();
  };
  const digDeeper = async () => {
    const r = await api.digDeeper();
    setRecs({ items: r.items, seeds: r.seeds, topTags: r.topTags });
  };

  const filtersPanel = <VaultFiltersPanel value={filters} onChange={setFilters} tagFacets={tagFacets} statusCounts={statusCounts} />;

  const vaultGrid = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Play Later Vault <span className="font-normal text-ink-400">· {filtered.length === entries.length ? entries.length : `${filtered.length} of ${entries.length}`}</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen(true)}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ring-1 lg:hidden", nActive ? "bg-ink-100 text-ink-950 ring-ink-100" : "bg-ink-850 ring-ink-700")}
          >
            <SlidersHorizontal className="size-3.5" /> Filters{nActive ? ` · ${nActive}` : ""}
          </button>
          <button
            onClick={() => {
              setSelectMode(!selectMode);
              setSelected(new Set());
            }}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ring-1", selectMode ? "bg-ink-100 text-ink-950 ring-ink-100" : "bg-ink-850 ring-ink-700 hover:ring-ink-600")}
            title="Select several games to change status, add to a Drop, or remove"
          >
            <CheckSquare className="size-3.5" /> {selectMode ? "Done" : "Select"}
          </button>
          <SortSelect value={filters.sort} onChange={(sort) => setFilters({ ...filters, sort })} />
        </div>
      </div>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/3.6] animate-pulse rounded-xl bg-ink-900" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasEntries={entries.length > 0} onClear={() => setFilters(DEFAULT_FILTERS)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((e) => (
            <GameCard
              key={e.id}
              entry={e}
              onOpen={() => setOpenId(e.id)}
              selectMode={selectMode}
              selected={selected.has(e.id)}
              onToggle={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(e.id)) next.delete(e.id);
                  else next.add(e.id);
                  return next;
                })
              }
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 lg:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="size-7" />
            <span className="text-[15px] font-bold tracking-tight">BloxVault</span>
          </Link>
          <div className="relative hidden flex-1 lg:block">
            <QuickDropBar ref={deskBar} onVaulted={onVaulted} onOpen={setOpenId} onRemoved={onRemoved} initialInput={isDesktop === true ? shareInput : null} />
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-ink-400 lg:ml-0">
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink-850 px-2.5 py-1.5 text-xs font-medium text-ink-100 ring-1 ring-ink-700 hover:ring-ink-600"
              title="Import the games you've favorited on Roblox"
            >
              <Heart className="size-3.5 text-rose-300" />
              <span className="hidden sm:inline">Import Roblox favorites</span>
              <span className="sm:hidden">Import</span>
            </button>
            <span className="hidden items-center gap-1 sm:inline-flex" title="Games in your vault that pass both hidden-gem gates">
              <Gem className="size-3.5 text-gem" /> {gemCount} gems
            </span>
            <button onClick={syncNow} disabled={syncing} className="rounded-lg p-1.5 hover:bg-ink-850 hover:text-ink-100" title="Refresh live player counts & votes from Roblox">
              <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
            </button>
          </div>
        </div>
        {/* Mobile tabs */}
        <nav className="flex gap-1 px-3 pb-2 lg:hidden">
          {(
            [
              ["recent", "Recent", Clock],
              ["vault", "Vault", Layers],
              ["foryou", "For You", Sparkles],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition", tab === k ? "bg-ink-850 text-ink-100 ring-1 ring-ink-700" : "text-ink-400")}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </nav>
      </header>

      {loadError && (
        <div className="mx-auto mt-4 max-w-2xl rounded-xl bg-rose-950/60 p-3 text-sm text-rose-100 ring-1 ring-rose-500/30">
          Couldn&apos;t load your vault: {loadError}. Did you run <code className="font-mono">npm run setup</code>?
        </div>
      )}

      {/* ---------- Mobile ("Frictionless Capture") ---------- */}
      <main className="px-3 pt-3 pb-44 lg:hidden">
        {tab === "recent" && (
          <section>
            <div className="mb-1 flex items-center justify-between px-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Recently {recentBy}</h2>
              <div className="flex gap-0.5 rounded-lg bg-ink-900 p-0.5 ring-1 ring-ink-800">
                {(["vaulted", "played"] as const).map((k) => (
                  <button key={k} onClick={() => setRecentBy(k)} className={cn("rounded-md px-2 py-0.5 text-[11px] capitalize", recentBy === k ? "bg-ink-800 text-ink-100" : "text-ink-400")}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="space-y-2 px-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-ink-900" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-ink-400">Paste a Reel, TikTok, or Roblox link below. It&apos;ll land here.</p>
            ) : (
              <div className="divide-y divide-ink-800/60">
                {[...entries]
                  .filter((e) => recentBy === "vaulted" || e.lastPlayedOn)
                  .sort((a, b) => (recentBy === "played" ? (b.lastPlayedOn ?? "").localeCompare(a.lastPlayedOn ?? "") : b.createdAt.localeCompare(a.createdAt)))
                  .slice(0, 25)
                  .map((e) => (
                    <RecentRow key={e.id} entry={e} onOpen={() => setOpenId(e.id)} />
                  ))}
              </div>
            )}
          </section>
        )}
        {tab === "vault" && vaultGrid}
        {tab === "foryou" && <RecommendationShelf {...recs} loading={recsLoading} onVault={vaultFromRec} onDigDeeper={digDeeper} onDismiss={dismissRec} onImport={() => setImportOpen(true)} />}
      </main>
      <div className="lg:hidden">
        <QuickDropBar ref={mobileBar} onVaulted={onVaulted} onOpen={setOpenId} onRemoved={onRemoved} initialInput={isDesktop === false ? shareInput : null} />
      </div>

      {/* ---------- Desktop ("Discovery Hub & Command Center") ---------- */}
      <div className="mx-auto hidden max-w-[1600px] gap-6 px-6 py-6 lg:grid lg:grid-cols-[264px_1fr]">
        <aside className="sticky top-[76px] h-[calc(100dvh-100px)] space-y-8 overflow-y-auto pr-1">
          {filtersPanel}
          <DropsNav lists={lists} />
          <p className="text-[11px] leading-relaxed text-ink-400">
            <kbd className="rounded bg-ink-850 px-1 font-mono ring-1 ring-ink-700">/</kbd> search · <kbd className="rounded bg-ink-850 px-1 font-mono ring-1 ring-ink-700">↑↓</kbd> pick ·{" "}
            <kbd className="rounded bg-ink-850 px-1 font-mono ring-1 ring-ink-700">Esc</kbd> close
          </p>
        </aside>
        <main className="min-w-0 space-y-6">
          <RecommendationShelf {...recs} loading={recsLoading} onVault={vaultFromRec} onDigDeeper={digDeeper} onDismiss={dismissRec} onImport={() => setImportOpen(true)} />
          <section>{vaultGrid}</section>
        </main>
      </div>

      {/* Mobile filter drawer */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setFiltersOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="animate-rise absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-ink-900 p-4 pb-safe ring-1 ring-ink-700">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button onClick={() => setFiltersOpen(false)} className="rounded-full bg-ink-850 p-1.5">
                <X className="size-4" />
              </button>
            </div>
            {filtersPanel}
            <button onClick={() => setFiltersOpen(false)} className="mt-6 w-full rounded-xl bg-go py-3 text-sm font-semibold text-ink-950">
              Show {filtered.length} games
            </button>
          </div>
        </div>
      )}

      {selectMode && (
        <BulkBar
          ids={[...selected]}
          lists={lists}
          onSelectAll={() => setSelected(new Set(filtered.map((e) => e.id)))}
          onCancel={() => {
            setSelectMode(false);
            setSelected(new Set());
          }}
          onDone={() => {
            setSelected(new Set());
            loadVault();
            loadLists();
            loadRecs();
          }}
        />
      )}

      {importOpen && (
        <ImportFavoritesModal
          hasDemo={entries.some((e) => DEMO_PLACE_IDS.includes(e.game.rootPlaceId))}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            loadVault();
            loadRecs();
            loadLists();
          }}
        />
      )}

      {open && (
        <GameDetailModal
          entry={open}
          lists={lists}
          onChange={onEntryChange}
          onDelete={(id) => {
            onRemoved(id);
            setOpenId(null);
            loadRecs();
          }}
          onClose={() => setOpenId(null)}
          onListsChanged={loadLists}
        />
      )}
    </div>
  );
}

function DropsNav({ lists }: { lists: ListDTO[] }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        <ListMusic className="size-3.5" /> Drops
      </h3>
      {lists.length === 0 ? (
        <p className="text-xs text-ink-400">Bundle games into a shareable list from any game&apos;s detail view.</p>
      ) : (
        <ul className="space-y-0.5">
          {lists.map((l) => (
            <li key={l.slug}>
              <Link href={`/lists/${l.slug}`} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-ink-300 hover:bg-ink-850 hover:text-ink-100">
                <span className="truncate">{l.title}</span>
                <span className="text-xs tabular-nums text-ink-400">{l.items.length}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState({ hasEntries, onClear }: { hasEntries: boolean; onClear: () => void }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-ink-700 py-16 text-center">
      {hasEntries ? (
        <>
          <p className="text-sm text-ink-300">Nothing in your vault matches those filters.</p>
          <button onClick={onClear} className="mt-2 text-xs text-go hover:underline">
            Clear filters
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-300">Your vault is empty.</p>
          <p className="mt-1 text-xs text-ink-400">Drop a Roblox link, a Reel, or a fuzzy game description into the bar above.</p>
        </>
      )}
    </div>
  );
}
