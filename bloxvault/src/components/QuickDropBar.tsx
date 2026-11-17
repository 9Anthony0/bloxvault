"use client";
import { ArrowUp, Check, ClipboardPaste, CornerDownLeft, Gem, Link2, Loader2, Search, ThumbsUp, Undo2, Users, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, ApiError, type IngestResponse, type PickResponse } from "@/lib/client-api";
import type { CandidateDTO } from "@/lib/dto";
import { cn, compact } from "@/lib/format";
import type { FilterKey } from "@/lib/vibe";
import { flatRows, SearchDropdown, type SearchSort, type SearchState } from "./SearchDropdown";
import { GameArt } from "./ui";

type State =
  | { t: "idle" }
  | { t: "busy"; label: string }
  | { t: "done"; res: IngestResponse }
  | { t: "pick"; res: PickResponse }
  | { t: "needCaption"; sourceUrl: string; message: string }
  | { t: "error"; message: string };

const RECENT_KEY = "bloxvault:recent-searches";
const EMPTY_SEARCH: SearchState = { q: "", phase: "idle", loading: false, refining: false, parsed: null, vault: [], results: [], error: null };

/** Links and pasted captions are "save" inputs; everything else is a search. */
export function isSaveInput(text: string) {
  const t = text.trim();
  return /(https?:\/\/|roblox:\/\/|ro\.blox\.com|www\.|\.com\/)/i.test(t) || t.length > 90 || /\n/.test(t) || (t.match(/[#@]\w+/g)?.length ?? 0) >= 2;
}

function busyLabel(input: string) {
  if (/roblox\.com|ro\.blox/i.test(input)) return "Resolving place → universe…";
  if (/instagram|tiktok|youtu/i.test(input)) return "Reading the clip's caption…";
  if (/^https?:\/\//i.test(input)) return "Reading that page…";
  return "Matching caption…";
}

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export interface QuickDropHandle {
  focus: () => void;
}

export const QuickDropBar = forwardRef<QuickDropHandle, {
  onVaulted: (r: IngestResponse) => void;
  onOpen: (entryId: string) => void;
  onRemoved: (entryId: string) => void;
  initialInput?: string | null;
}>(function QuickDropBar({ onVaulted, onOpen, onRemoved, initialInput }, ref) {
  const [value, setValue] = useState("");
  const [caption, setCaption] = useState("");
  const [state, setState] = useState<State>({ t: "idle" });
  const [picking, setPicking] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH);
  const [off, setOff] = useState<FilterKey[]>([]);
  const [sort, setSort] = useState<SearchSort>("best");
  const [hideBig, setHideBig] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fired = useRef(false);
  const reqId = useRef(0);
  const aborter = useRef<AbortController | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));
  useEffect(() => setRecent(loadRecent()), []);

  const saveInput = isSaveInput(value);
  const showDropdown = focused && !saveInput && state.t !== "busy" && (value.trim().length >= 2 || recent.length > 0);

  const pushRecent = useCallback((q: string) => {
    const t = q.trim();
    if (t.length < 3) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  /* ---------------- live search (debounced, fast → full) ---------------- */
  useEffect(() => {
    const q = value.trim();
    if (saveInput || q.length < 2) {
      aborter.current?.abort();
      setSearch(EMPTY_SEARCH);
      return;
    }
    const id = ++reqId.current;
    setSearch((s) => ({ ...s, q, loading: true, refining: true, error: null, phase: s.phase === "idle" ? "fast" : s.phase }));
    const t = setTimeout(async () => {
      aborter.current?.abort();
      const ctrl = new AbortController();
      aborter.current = ctrl;
      api
        .search(q, "fast", off, ctrl.signal)
        .then((r) => {
          if (id !== reqId.current) return;
          setSearch((s) => ({ ...s, phase: s.phase === "full" && s.q === q ? "full" : "fast", parsed: r.parsed, vault: r.vault, results: s.phase === "full" && s.q === q ? s.results : r.results, loading: false }));
          setActive(0);
        })
        .catch((e) => id === reqId.current && (e as Error).name !== "AbortError" && setSearch((s) => ({ ...s, loading: false, error: (e as Error).message })));
      api
        .search(q, "full", off, ctrl.signal)
        .then((r) => {
          if (id !== reqId.current) return;
          setSearch((s) => ({ ...s, q, phase: "full", parsed: r.parsed, vault: r.vault, results: r.results, loading: false, refining: false }));
          pushRecent(q);
        })
        .catch((e) => id === reqId.current && (e as Error).name !== "AbortError" && setSearch((s) => ({ ...s, refining: false, loading: false })));
    }, 260);
    return () => clearTimeout(t);
  }, [value, off, saveInput, pushRecent]);

  const rows = flatRows(search, sort, hideBig);

  function saved(res: IngestResponse) {
    setState({ t: "done", res });
    setValue("");
    setCaption("");
    setSearch(EMPTY_SEARCH);
    inputRef.current?.blur();
    onVaulted(res);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  /** Pick from the live search dropdown → save by id (never guesses). */
  async function pickFromSearch(c: CandidateDTO) {
    setPicking(c.universeId);
    pushRecent(value);
    try {
      const res = await api.vaultById({ universeId: c.universeId });
      saved({ ...res, candidates: [] });
    } catch (e) {
      setState({ t: "error", message: (e as Error).message });
    } finally {
      setPicking(null);
    }
  }

  function openEntry(entryId: string) {
    setFocused(false);
    inputRef.current?.blur();
    onOpen(entryId);
  }

  /** Links & captions → ingest pipeline (instant save for links, picker for unclear captions). */
  async function submitSave(input: string, extra: { caption?: string; sourceUrl?: string } = {}) {
    const text = input.trim();
    if (!text && !extra.caption) return;
    setState({ t: "busy", label: busyLabel(extra.caption ? "" : text) });
    try {
      const res = await api.ingest(extra.caption ? { input: extra.caption, sourceUrl: extra.sourceUrl } : { input: text });
      if (res.needsPick) setState({ t: "pick", res });
      else saved(res);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "NEED_CAPTION" && typeof err.data.sourceUrl === "string") {
        setState({ t: "needCaption", sourceUrl: err.data.sourceUrl, message: err.message });
      } else setState({ t: "error", message: err.message });
    }
  }

  async function pick(c: CandidateDTO) {
    if (state.t !== "pick") return;
    const { sourceUrl, caption: cap } = state.res;
    setPicking(c.universeId);
    try {
      const res = await api.vaultById({ universeId: c.universeId, sourceUrl, caption: cap });
      saved({ ...res, candidates: [] });
    } catch (e) {
      setState({ t: "error", message: (e as Error).message });
    } finally {
      setPicking(null);
    }
  }

  async function swap(universeId: number) {
    if (state.t !== "done") return;
    const prev = state.res;
    setState({ t: "busy", label: "Swapping…" });
    try {
      const res = await api.vaultById({ universeId, replaceEntryId: prev.entry.id });
      if (res.entry.id !== prev.entry.id) onRemoved(prev.entry.id);
      setState({ t: "done", res: { ...res, candidates: prev.candidates.filter((c) => c.universeId !== universeId) } });
      onVaulted(res);
    } catch (e) {
      setState({ t: "error", message: (e as Error).message });
    }
  }

  async function pasteAndGo() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) return;
      setValue(clip);
      if (isSaveInput(clip)) submitSave(clip);
      else {
        setFocused(true);
        inputRef.current?.focus();
      }
    } catch {
      inputRef.current?.focus();
    }
  }

  async function undo() {
    if (state.t !== "done" || state.res.alreadyVaulted) return;
    const id = state.res.entry.id;
    await api.deleteEntry(id).catch(() => {});
    onRemoved(id);
    setState({ t: "idle" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (value) setValue("");
      else inputRef.current?.blur();
      setFocused(false);
      return;
    }
    if (!showDropdown || saveInput) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saveInput) return submitSave(value);
    const row = rows[active];
    if (!row) return;
    if (row.c.inVault && row.c.entryId) openEntry(row.c.entryId);
    else pickFromSearch(row.c);
  }

  // Share-sheet / deep-link entry (/?url=… or /?text=…) auto-submits once.
  useEffect(() => {
    if (initialInput && !fired.current) {
      fired.current = true;
      setValue(initialInput);
      if (isSaveInput(initialInput)) submitSave(initialInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput]);

  // Auto-dismiss saves so the user can get back to scrolling
  useEffect(() => {
    if (state.t === "done") {
      const id = setTimeout(() => setState((s) => (s.t === "done" ? { t: "idle" } : s)), 7000);
      return () => clearTimeout(id);
    }
  }, [state]);

  const busy = state.t === "busy";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:pointer-events-auto lg:static lg:z-auto">
      {/* Panels — above the bar on mobile, dropdown below it on desktop */}
      <div className="pointer-events-auto mx-auto max-w-2xl px-3 lg:absolute lg:mt-16 lg:w-full lg:max-w-[44rem] lg:px-0">
        {showDropdown ? (
          <SearchDropdown
            state={search}
            sort={sort}
            hideBig={hideBig}
            active={active}
            savingId={picking}
            recent={recent}
            onSort={setSort}
            onHideBig={setHideBig}
            onRemoveFilter={(k) => setOff((o) => [...o, k])}
            onPick={pickFromSearch}
            onOpenEntry={openEntry}
            onRecent={(q) => {
              setValue(q);
              inputRef.current?.focus();
            }}
            onClearRecent={() => {
              setRecent([]);
              try {
                localStorage.removeItem(RECENT_KEY);
              } catch {}
            }}
            onHover={setActive}
          />
        ) : (
          <>
            {state.t === "done" && <ResultCard res={state.res} onOpen={onOpen} onSwap={swap} onUndo={undo} onClose={() => setState({ t: "idle" })} />}
            {state.t === "pick" && <PickerCard res={state.res} picking={picking} onPick={pick} onClose={() => setState({ t: "idle" })} />}
            {state.t === "error" && (
              <div className="animate-rise mb-2 flex items-start gap-2 rounded-2xl bg-rose-950/80 p-3 text-sm text-rose-100 ring-1 ring-rose-500/30 backdrop-blur lg:mb-0">
                <span className="flex-1">{state.message}</span>
                <button onClick={() => setState({ t: "idle" })} className="text-rose-200/70 hover:text-rose-100">
                  <X className="size-4" />
                </button>
              </div>
            )}
            {state.t === "needCaption" && (
              <div className="animate-rise mb-2 rounded-2xl bg-ink-850/95 p-3 ring-1 ring-amber-500/30 backdrop-blur lg:mb-0">
                <p className="mb-2 text-xs text-amber-200">{state.message}</p>
                <textarea
                  autoFocus
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  placeholder="Paste the caption or just type the game name…"
                  className="w-full resize-none rounded-lg bg-ink-900 p-2 text-sm outline-none ring-1 ring-ink-700 focus:ring-go"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setState({ t: "idle" })} className="rounded-lg px-3 py-1.5 text-xs text-ink-300 hover:text-ink-100">
                    Cancel
                  </button>
                  <button
                    onClick={() => submitSave("", { caption, sourceUrl: state.sourceUrl })}
                    disabled={!caption.trim()}
                    className="rounded-lg bg-go px-3 py-1.5 text-xs font-semibold text-ink-950 disabled:opacity-40"
                  >
                    Find it
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* The bar */}
      <form onSubmit={onSubmit} className="pointer-events-auto border-t border-ink-800 bg-ink-950/90 px-3 pt-3 pb-safe backdrop-blur-xl lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl bg-ink-850 p-1.5 ring-1 ring-ink-700 focus-within:ring-go/60 lg:max-w-none">
          <button
            type="button"
            onClick={pasteAndGo}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ink-800 px-3 py-2.5 text-xs font-medium text-ink-100 ring-1 ring-ink-700 active:scale-95 disabled:opacity-50 lg:py-2"
            title="Paste from clipboard"
          >
            <ClipboardPaste className="size-4" />
            <span className="lg:hidden">Paste</span>
            <span className="hidden lg:inline">Paste</span>
          </button>
          <span className="hidden shrink-0 text-ink-400 sm:block">{saveInput ? <Link2 className="size-4 text-go" /> : <Search className="size-4" />}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (off.length) setOff([]); // removed filters apply to the previous query only
              if (state.t !== "busy") setState({ t: "idle" });
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKeyDown}
            disabled={busy}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint={saveInput ? "go" : "search"}
            role="combobox"
            aria-expanded={showDropdown}
            placeholder={busy ? (state as { label: string }).label : "Search a game or vibe — or paste a Roblox / TikTok / Reel link"}
            className="min-w-0 flex-1 bg-transparent px-1 text-[15px] outline-none placeholder:text-ink-400 lg:text-sm"
          />
          {saveInput && !busy && (
            <span className="hidden shrink-0 items-center gap-1 rounded-md bg-go/10 px-2 py-1 text-[11px] font-medium text-go sm:inline-flex">
              <CornerDownLeft className="size-3" /> Enter to vault
            </span>
          )}
          {!saveInput && !busy && value === "" && (
            <kbd className="hidden shrink-0 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-ink-400 ring-1 ring-ink-700 lg:block" title="Press / to search">
              /
            </kbd>
          )}
          <button
            type="submit"
            disabled={busy || !value.trim() || (!saveInput && !rows.length)}
            aria-label={saveInput ? "Vault it" : "Vault highlighted result"}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-go text-ink-950 transition active:scale-95 disabled:bg-ink-700 disabled:text-ink-400 lg:size-9"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
          </button>
        </div>
      </form>
    </div>
  );
});

/* ---------------- Picker: shown when it's a search, not an exact match ---------------- */

function PickerCard({ res, picking, onPick, onClose }: { res: PickResponse; picking: number | null; onPick: (c: CandidateDTO) => void; onClose: () => void }) {
  return (
    <div className="animate-rise mb-2 overflow-hidden rounded-2xl bg-ink-850/95 ring-1 ring-ink-700 backdrop-blur lg:mb-0 lg:shadow-2xl lg:shadow-black/50">
      <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2.5">
        <Search className="size-4 text-ink-400" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Which one is “{res.query}”?</div>
          <div className="text-[11px] text-ink-400">Tap a game to vault it{res.sourceUrl ? " — the clip link comes with it" : ""}. Nothing is saved until you pick.</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Cancel">
          <X className="size-4" />
        </button>
      </div>
      <ul className="max-h-[55dvh] divide-y divide-ink-800/70 overflow-y-auto lg:max-h-[60vh]">
        {res.candidates.map((c) => (
          <li key={c.universeId}>
            <button
              onClick={() => onPick(c)}
              disabled={picking !== null}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-ink-800/60 disabled:opacity-60"
            >
              {c.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.iconUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-ink-700" loading="lazy" />
              ) : (
                <div className="size-12 shrink-0 rounded-lg bg-ink-800" />
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
                  {c.creatorName && <span className="truncate">by {c.creatorName}</span>}
                </div>
                {c.reason && <div className="mt-0.5 truncate text-[11px] text-sky-300/90">{c.reason}</div>}
                {!c.reason && c.description && <div className="mt-0.5 truncate text-[11px] text-ink-400/80">{c.description}</div>}
              </div>
              {picking === c.universeId ? <Loader2 className="size-4 shrink-0 animate-spin text-ink-400" /> : <span className="shrink-0 rounded-lg bg-ink-800 px-2 py-1 text-[11px] font-medium ring-1 ring-ink-700">Vault</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Saved card with Undo + "Not it?" ---------------- */

function ResultCard({ res, onOpen, onSwap, onUndo, onClose }: { res: IngestResponse; onOpen: (id: string) => void; onSwap: (u: number) => void; onUndo: () => void; onClose: () => void }) {
  return (
    <div className="animate-rise mb-2 overflow-hidden rounded-2xl bg-ink-850/95 ring-1 ring-ink-700 backdrop-blur lg:mb-0 lg:shadow-2xl lg:shadow-black/50">
      <div className="flex items-center gap-3 p-2.5">
        <button onClick={() => onOpen(res.entry.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <GameArt game={res.game} variant="icon" className="size-12 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-go">
              <Check className="size-3.5" strokeWidth={3} />
              {res.alreadyVaulted ? "Already in your vault" : "Vaulted"}
            </div>
            <div className="truncate text-sm font-semibold">{res.game.name}</div>
            <div className="truncate text-xs text-ink-400">
              {compact(res.game.ccu)} playing · {res.game.approvalPercentage.toFixed(0)}% · {res.game.tags.slice(0, 2).map((t) => t.label).join(" · ")}
            </div>
          </div>
        </button>
        {!res.alreadyVaulted && (
          <button onClick={onUndo} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100" title="Undo">
            <Undo2 className="size-4" />
          </button>
        )}
        <button onClick={onClose} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100" title="Dismiss">
          <X className="size-4" />
        </button>
      </div>
      {res.candidates.length > 0 && (
        <div className="border-t border-ink-800 px-2.5 py-2">
          <div className="mb-1.5 text-[11px] text-ink-400">Not it? Tap to swap:</div>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {res.candidates.map((c) => (
              <button key={c.universeId} onClick={() => onSwap(c.universeId)} className="flex shrink-0 items-center gap-2 rounded-lg bg-ink-800 py-1 pl-1 pr-2.5 text-left ring-1 ring-ink-700 hover:ring-ink-600">
                {c.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.iconUrl} alt="" className="size-7 rounded-md object-cover" />
                ) : (
                  <span className="size-7 rounded-md bg-ink-700" />
                )}
                <span>
                  <span className="block max-w-40 truncate text-xs font-medium">{c.name}</span>
                  <span className="block text-[10px] text-ink-400">
                    {compact(c.playerCount)} · {c.approvalPercentage}%
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
