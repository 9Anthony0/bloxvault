"use client";
import { CalendarCheck, CalendarClock, ExternalLink, Film, Gem, ListPlus, Loader2, Maximize2, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type EntryPatch } from "@/lib/client-api";
import { STATUS_META, SUB_RATINGS, TAG_TAXONOMY, VAULT_STATUSES, type SubRatingKey } from "@/lib/constants";
import type { PlayLogDTO, VaultEntryDTO } from "@/lib/dto";
import { cn, compact, localToday, relativeTime, sourcePlatform } from "@/lib/format";
import type { ListDTO } from "@/lib/lists";
import { computeHiddenGem } from "@/lib/scoring";
import { GameArt, GemBadge, LaunchButton, StarRating, SubSlider, WebLink } from "./ui";

export function GameDetailModal({
  entry,
  lists,
  onChange,
  onDelete,
  onClose,
  onListsChanged,
}: {
  entry: VaultEntryDTO;
  lists: ListDTO[];
  onChange: (e: VaultEntryDTO) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onListsChanged: () => void;
}) {
  const g = entry.game;
  const [draft, setDraft] = useState(entry);
  const [saving, setSaving] = useState(false);
  const [thumb, setThumb] = useState(0);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(entry), [entry]);
  // Stable listener (registered once): re-registering on every render can make the browser skip it
  // when another keydown listener triggers a re-render mid-event.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return el.blur(); // first Esc leaves the field
      closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  async function save(patch: EntryPatch) {
    setDraft((d) => ({ ...d, ...(patch as Partial<VaultEntryDTO>) }));
    setSaving(true);
    try {
      const { entry: fresh } = await api.patchEntry(entry.id, patch);
      onChange(fresh);
    } finally {
      setSaving(false);
    }
  }

  function saveNotes(notes: string) {
    setDraft((d) => ({ ...d, notes }));
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => save({ notes }), 600);
  }

  const gem = useMemo(
    () => computeHiddenGem({ upVotes: g.upVotes, downVotes: g.downVotes, ccu: g.ccu, lastUpdated: g.lastUpdated ? new Date(g.lastUpdated) : null }),
    [g],
  );
  const thumbs = g.thumbnailUrls.length ? g.thumbnailUrls : g.iconUrl ? [g.iconUrl] : [];
  const stale = gem.daysSinceUpdate !== null && gem.daysSinceUpdate > 180;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm lg:items-center lg:p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={g.name}
        className="animate-rise flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-ink-900 ring-1 ring-ink-700 lg:rounded-2xl"
      >
        {/* Hero */}
        <div className="relative aspect-[21/9] shrink-0 bg-ink-850 lg:aspect-[3/1]">
          {thumbs[thumb] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbs[thumb]} alt="" className="size-full object-cover" />
          ) : (
            <GameArt game={g} className="size-full" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/30 to-transparent" />
          <div className="absolute right-3 top-3 flex gap-1.5">
            <Link href={`/game/${g.universeId}`} className="rounded-full bg-black/50 p-2 text-ink-100 backdrop-blur hover:bg-black/70" aria-label="Open full game page" title="Open full game page">
              <Maximize2 className="size-4" />
            </Link>
            <button onClick={onClose} className="rounded-full bg-black/50 p-2 text-ink-100 backdrop-blur hover:bg-black/70" aria-label="Close (Esc)">
              <X className="size-4" />
            </button>
          </div>
          {thumbs.length > 1 && (
            <div className="absolute right-3 bottom-3 flex gap-1">
              {thumbs.map((_, i) => (
                <button key={i} onClick={() => setThumb(i)} className={cn("h-1.5 rounded-full transition-all", i === thumb ? "w-5 bg-white" : "w-1.5 bg-white/40")} aria-label={`Screenshot ${i + 1}`} />
              ))}
            </div>
          )}
          <div className="absolute bottom-3 left-4 flex items-end gap-3 lg:left-6">
            <GameArt game={g} variant="icon" className="size-16 rounded-xl ring-2 ring-ink-900 lg:size-20" />
            <div className="pb-0.5">
              <h2 className="text-lg font-bold leading-tight lg:text-2xl">{g.name}</h2>
              <p className="text-xs text-ink-300">by {g.creatorName}</p>
            </div>
          </div>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-4 lg:grid-cols-[1fr_300px] lg:p-6">
          {/* Left: logging */}
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <LaunchButton placeId={g.rootPlaceId} />
              <WebLink placeId={g.rootPlaceId} />
              <span className="ml-auto text-[11px] text-ink-400">{saving ? <Loader2 className="inline size-3 animate-spin" /> : "Saved"}</span>
            </div>

            {/* Status */}
            <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
              {VAULT_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => save({ status: s })}
                  className={cn("shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition", draft.status === s ? STATUS_META[s].color : "bg-ink-850 text-ink-300 ring-ink-700 hover:text-ink-100")}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>

            {/* Rating */}
            <div>
              <Label>Your rating</Label>
              <StarRating value={draft.starRating} onChange={(v) => save({ starRating: v })} size={28} />
            </div>

            {/* Anti-slop */}
            <div>
              <Label hint="Rate the stuff star ratings hide">Anti-Slop meters</Label>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {(Object.keys(SUB_RATINGS) as SubRatingKey[]).map((k) => (
                  <SubSlider key={k} {...SUB_RATINGS[k]} value={draft[k]} onChange={(v) => save({ [k]: v })} />
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <textarea
                value={draft.notes}
                onChange={(e) => saveNotes(e.target.value)}
                rows={3}
                placeholder="Who to play with, what to try first, why you dropped it…"
                className="w-full resize-y rounded-xl bg-ink-850 p-3 text-sm outline-none ring-1 ring-ink-700 placeholder:text-ink-400 focus:ring-ink-600"
              />
            </div>

            {/* Play log */}
            <PlayLog entryId={entry.id} onChange={onChange} />

            {/* Source */}
            <SourceCard entry={draft} onSave={(url) => save({ sourceUrl: url })} />
          </div>

          {/* Right: telemetry */}
          <aside className="space-y-5">
            <div className="rounded-xl bg-ink-850 p-3 ring-1 ring-ink-700">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <Gem className="size-3.5 text-gem" /> Hidden Gem Score
                </span>
                <GemBadge game={g} />
              </div>
              <Meter label="Quality (Wilson-adjusted)" v={gem.quality} />
              <Meter label="Obscurity (CCU sweet spot)" v={gem.obscurity} />
              <Meter label="Freshness (last update)" v={gem.freshness} />
              <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                {g.isHiddenGem ? "✓ Clears both gem gates: ≥85% approval and under 2,000 players." : `Gates: ${g.approvalPercentage >= 85 ? "✓" : "✗"} ≥85% approval · ${g.ccu < 2000 ? "✓" : "✗"} <2k CCU`}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Stat k="Playing now" v={compact(g.ccu)} />
              <Stat k="Approval" v={`${g.approvalPercentage.toFixed(1)}%`} />
              <Stat k="Likes / dislikes" v={`${compact(g.upVotes)} / ${compact(g.downVotes)}`} />
              <Stat k="Visits" v={compact(g.visits)} />
              <Stat k="Server size" v={g.maxPlayers ? `${g.maxPlayers} max` : "—"} />
              <Stat k="Genre" v={g.genre ?? "—"} />
            </dl>
            <div className={cn("flex items-center gap-1.5 text-[11px]", stale ? "text-amber-300" : "text-ink-400")}>
              <CalendarClock className="size-3.5" />
              Updated {relativeTime(g.lastUpdated)}
              {stale && " — possibly abandoned"}
            </div>

            <TagEditor entry={draft} onSave={(tags) => save({ tags })} />
            <AddToDrop entry={draft} lists={lists} onDone={onListsChanged} />

            {g.description && (
              <details className="group text-xs text-ink-300">
                <summary className="cursor-pointer select-none text-ink-400 hover:text-ink-100">Roblox description</summary>
                <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line leading-relaxed">{g.description}</p>
              </details>
            )}

            <button
              onClick={async () => {
                if (!confirm(`Remove ${g.name} from your vault?`)) return;
                await api.deleteEntry(entry.id);
                onDelete(entry.id);
              }}
              className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-rose-300"
            >
              <Trash2 className="size-3.5" /> Remove from vault
            </button>
          </aside>
        </div>
        {/* Spacer so the bottom sheet clears the iOS home indicator */}
        <div className="pb-safe lg:hidden" />
      </div>
    </div>
  );
}

function SourceCard({ entry: e, onSave }: { entry: VaultEntryDTO; onSave: (u: string | null) => void }) {
  const src = sourcePlatform(e.sourceUrl);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(e.sourceUrl ?? "");
  if (e.sourceUrl && !editing)
    return (
      <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="group flex items-start gap-3 rounded-xl bg-ink-850 p-3 ring-1 ring-ink-700 hover:ring-ink-600">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500/30 to-amber-400/20 text-ink-100">
          <Film className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-xs font-semibold">
            Where you found it · {src?.label} <ExternalLink className="size-3 opacity-60 group-hover:opacity-100" />
          </span>
          {e.sourceCaption && <span className="mt-0.5 line-clamp-2 block text-xs text-ink-400">“{e.sourceCaption}”</span>}
          <span className="mt-0.5 block truncate text-[11px] text-ink-400/70">{e.sourceUrl}</span>
        </span>
        <button
          onClick={(ev) => {
            ev.preventDefault();
            setEditing(true);
          }}
          className="text-[11px] text-ink-400 hover:text-ink-100"
        >
          edit
        </button>
      </a>
    );
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        onSave(val.trim() || null);
        setEditing(false);
      }}
      className="flex gap-2"
    >
      <input
        value={val}
        onChange={(ev) => setVal(ev.target.value)}
        placeholder="Link the Reel / TikTok you found it from"
        className="min-w-0 flex-1 rounded-lg bg-ink-850 px-3 py-2 text-xs outline-none ring-1 ring-ink-700 placeholder:text-ink-400 focus:ring-ink-600"
      />
      <button className="rounded-lg bg-ink-800 px-3 text-xs ring-1 ring-ink-700">Save</button>
    </form>
  );
}

function PlayLog({ entryId, onChange }: { entryId: string; onChange: (e: VaultEntryDTO) => void }) {
  const today = localToday();
  const [logs, setLogs] = useState<PlayLogDTO[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.plays(entryId).then((r) => setLogs(r.logs)).catch(() => setLogs([]));
  }, [entryId]);

  async function add() {
    setBusy(true);
    try {
      const r = await api.logPlay(entryId, date, note.trim());
      setLogs(r.logs);
      onChange(r.entry);
      setAdding(false);
      setNote("");
      setDate(today);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label hint={logs?.length ? `${logs.length} session${logs.length > 1 ? "s" : ""}` : undefined}>Play log</Label>
        {!adding && (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md bg-ink-850 px-2 py-1 text-[11px] font-medium ring-1 ring-ink-700 hover:ring-ink-600">
            <CalendarCheck className="size-3.5" /> Log a play
          </button>
        )}
      </div>
      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mb-2 flex flex-wrap gap-2 rounded-xl bg-ink-850 p-2 ring-1 ring-ink-700"
        >
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="rounded-md bg-ink-900 px-2 py-1.5 text-xs outline-none ring-1 ring-ink-700 [color-scheme:dark]" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Quick note (optional): who you played with, how far you got…" className="min-w-0 flex-1 rounded-md bg-ink-900 px-2 py-1.5 text-xs outline-none ring-1 ring-ink-700 placeholder:text-ink-400" />
          <button type="button" onClick={() => setAdding(false)} className="px-2 text-xs text-ink-400 hover:text-ink-100">
            Cancel
          </button>
          <button disabled={busy} className="rounded-md bg-go px-3 py-1.5 text-xs font-semibold text-ink-950 disabled:opacity-50">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
          </button>
        </form>
      )}
      {logs === null ? (
        <div className="h-8 animate-pulse rounded-lg bg-ink-850" />
      ) : logs.length === 0 ? (
        !adding && <p className="text-xs text-ink-400">No sessions logged yet. Logging a play moves a Play Later game to Playing.</p>
      ) : (
        <ul className="space-y-1">
          {logs.slice(0, 6).map((l) => (
            <li key={l.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-ink-850">
              <span className="w-20 shrink-0 tabular-nums text-ink-300">{new Date(l.playedOn + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              <span className="min-w-0 flex-1 truncate text-ink-400">{l.note || "—"}</span>
              <button
                onClick={async () => {
                  const r = await api.deletePlay(entryId, l.id);
                  setLogs(r.logs);
                  onChange(r.entry);
                }}
                className="text-ink-600 opacity-0 hover:text-rose-300 group-hover:opacity-100"
                aria-label="Delete this log"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
          {logs.length > 6 && <li className="px-2 text-[11px] text-ink-400">+{logs.length - 6} older</li>}
        </ul>
      )}
    </div>
  );
}

function TagEditor({ entry, onSave }: { entry: VaultEntryDTO; onSave: (tags: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const current = entry.game.tags.map((t) => t.slug);
  return (
    <div>
      <Label>Mechanics & vibes</Label>
      <div className="flex flex-wrap gap-1.5">
        {entry.game.tags.map((t) => (
          <span key={t.slug} className="group inline-flex items-center gap-1 rounded-full bg-ink-850 px-2.5 py-1 text-xs text-ink-100 ring-1 ring-ink-700" title={`${t.source} · ${Math.round(t.confidence * 100)}%`}>
            {t.label}
            <button onClick={() => onSave(current.filter((s) => s !== t.slug))} className="text-ink-400 hover:text-rose-300" aria-label={`Remove ${t.label}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-ink-400 ring-1 ring-dashed ring-ink-700 hover:text-ink-100">
          <Plus className="size-3" /> tag
        </button>
      </div>
      {open && (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-lg bg-ink-850 p-2 ring-1 ring-ink-700">
          {TAG_TAXONOMY.filter((t) => !current.includes(t.slug)).map((t) => (
            <button
              key={t.slug}
              onClick={() => {
                onSave([...current, t.slug].slice(0, 8));
                setOpen(false);
              }}
              className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] text-ink-300 hover:text-ink-100"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddToDrop({ entry, lists, onDone }: { entry: VaultEntryDTO; lists: ListDTO[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const uid = entry.game.universeId;
  const inLists = new Set(lists.filter((l) => l.items.some((i) => i.game.universeId === uid)).map((l) => l.slug));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs text-ink-300 hover:text-ink-100">
        <ListPlus className="size-3.5" /> Add to a Drop {inLists.size > 0 && <span className="text-ink-400">(in {inLists.size})</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-1 rounded-lg bg-ink-850 p-2 ring-1 ring-ink-700">
          {lists.map((l) => (
            <button
              key={l.slug}
              disabled={busy || inLists.has(l.slug)}
              onClick={() => run(() => api.addToList(l.slug, uid))}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-ink-800 disabled:opacity-50"
            >
              <span className="truncate">{l.title}</span>
              <span className="text-ink-400">{inLists.has(l.slug) ? "added" : `${l.items.length}`}</span>
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim().length >= 3) run(() => api.createList(title.trim(), "", [uid]).then(() => setTitle("")));
            }}
            className="flex gap-1 pt-1"
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New Drop title…" className="min-w-0 flex-1 rounded-md bg-ink-900 px-2 py-1.5 text-xs outline-none ring-1 ring-ink-700" />
            <button disabled={busy} className="rounded-md bg-ink-800 px-2 text-xs ring-1 ring-ink-700">
              {busy ? <Loader2 className="size-3 animate-spin" /> : "Create"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{children}</h3>
      {hint && <span className="text-[11px] text-ink-400/70">{hint}</span>}
    </div>
  );
}

function Meter({ label, v }: { label: string; v: number }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[11px] text-ink-400">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(v * 100)}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full bg-gem" style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-ink-850 px-2.5 py-2 ring-1 ring-ink-800">
      <dt className="text-[10px] uppercase tracking-wide text-ink-400">{k}</dt>
      <dd className="mt-0.5 truncate font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

