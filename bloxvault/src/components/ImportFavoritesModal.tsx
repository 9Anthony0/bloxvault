"use client";
import { Check, Heart, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type ImportFavoritesResponse } from "@/lib/client-api";
import { cn } from "@/lib/format";

const LS_KEY = "bloxvault:roblox-user";
const COUNT_KEY = "bloxvault:import-count";
const PRESETS = [10, 25, 50, 100, 200] as const;

export function ImportFavoritesModal({ onClose, onImported, hasDemo }: { onClose: () => void; onImported: () => void; hasDemo: boolean }) {
  const [user, setUser] = useState("");
  const [savedUser, setSavedUser] = useState<string | null>(null);
  const [count, setCount] = useState<number>(50);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<"LOVED" | "VAULTED">("LOVED");
  const [clearDemo, setClearDemo] = useState(hasDemo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportFavoritesResponse | null>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      const u = localStorage.getItem(LS_KEY);
      setUser(u ?? "");
      setSavedUser(u);
      const c = Number(localStorage.getItem(COUNT_KEY));
      if (c > 0) PRESETS.includes(c as (typeof PRESETS)[number]) ? setCount(c) : (setCount(c), setCustom(String(c)));
    } catch {}
  }, []);

  async function run(who = user.trim()) {
    setBusy(true);
    setError(null);
    try {
      const r = await api.importFavorites({ user: who, status, clearDemo, max: count });
      try {
        localStorage.setItem(LS_KEY, who);
        localStorage.setItem(COUNT_KEY, String(count));
      } catch {}
      setResult(r);
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm lg:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="animate-rise w-full max-w-md rounded-t-3xl bg-ink-900 p-5 pb-safe ring-1 ring-ink-700 lg:rounded-2xl lg:pb-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Heart className="size-4 text-rose-300" /> Import your Roblox favorites
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">Pulls the games you&apos;ve favorited (★) on your Roblox account. No password needed. Your favorites just have to be visible to everyone in Roblox privacy settings.</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-ink-850 p-1.5 text-ink-400 hover:text-ink-100" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-go/10 p-3 text-sm ring-1 ring-go/30">
              <div className="flex items-center gap-1.5 font-semibold text-go">
                <Check className="size-4" /> Imported from @{result.user.name}
              </div>
              <p className="mt-1 text-xs text-ink-300">
                {result.found} favorites found · <b className="text-ink-100">{result.added} added</b>
                {result.alreadyInVault > 0 && ` · ${result.alreadyInVault} already in vault`}
                {result.failed > 0 && ` · ${result.failed} couldn't load`}
                {result.demoRemoved > 0 && ` · ${result.demoRemoved} demo games removed`}
              </p>
              {result.addedNames.length > 0 && <p className="mt-2 line-clamp-3 text-[11px] text-ink-400">{result.addedNames.join(", ")}</p>}
            </div>
            {result.found === 0 && <p className="text-xs text-amber-200">No favorites came back. Either the account has none, or its favorites are private.</p>}
            <button onClick={onClose} className="w-full rounded-xl bg-go py-2.5 text-sm font-semibold text-ink-950">
              See my recommendations
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (user.trim()) run();
            }}
            className="space-y-4"
          >
            <input
              autoFocus
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="Roblox username, user ID, or profile link"
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full rounded-xl bg-ink-850 px-3 py-2.5 text-sm outline-none ring-1 ring-ink-700 placeholder:text-ink-400 focus:ring-go/60"
            />

            {savedUser && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(savedUser)}
                className="flex w-full items-center justify-between rounded-xl bg-ink-850 px-3 py-2.5 text-left ring-1 ring-ink-700 hover:ring-ink-600 disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-medium">Re-sync @{savedUser}</span>
                  <span className="block text-[11px] text-ink-400">Adds anything you&apos;ve favorited since last time. Existing games keep their ratings.</span>
                </span>
                <RefreshCw className="size-4 text-ink-400" />
              </button>
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">How many</span>
                <span className="text-[11px] text-ink-400">most recent favorites first</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setCount(n);
                      setCustom("");
                    }}
                    className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition", count === n && !custom ? "bg-ink-100 text-ink-950 ring-ink-100" : "bg-ink-850 text-ink-300 ring-ink-700 hover:text-ink-100")}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCount(500);
                    setCustom("");
                  }}
                  className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition", count === 500 && !custom ? "bg-ink-100 text-ink-950 ring-ink-100" : "bg-ink-850 text-ink-300 ring-ink-700 hover:text-ink-100")}
                >
                  All
                </button>
                <input
                  value={custom}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                    setCustom(v);
                    if (Number(v) > 0) setCount(Math.min(500, Number(v)));
                  }}
                  inputMode="numeric"
                  placeholder="Custom"
                  className={cn("w-20 rounded-md bg-ink-850 px-2 py-1.5 text-xs outline-none ring-1 placeholder:text-ink-400", custom ? "ring-go/60" : "ring-ink-700")}
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Add them as</div>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink-850 p-1 ring-1 ring-ink-700">
                {(
                  [
                    ["LOVED", "Loved", "Trains your recommendations"],
                    ["VAULTED", "Play Later", "Just saves them"],
                  ] as const
                ).map(([k, label, hint]) => (
                  <button key={k} type="button" onClick={() => setStatus(k)} className={cn("rounded-md px-2 py-1.5 text-left transition", status === k ? "bg-ink-100 text-ink-950" : "text-ink-300 hover:text-ink-100")}>
                    <div className="text-xs font-semibold">{label}</div>
                    <div className={cn("text-[10px]", status === k ? "text-ink-700" : "text-ink-400")}>{hint}</div>
                  </button>
                ))}
              </div>
            </div>

            {hasDemo && (
              <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-300">
                <input type="checkbox" checked={clearDemo} onChange={(e) => setClearDemo(e.target.checked)} className="mt-0.5 accent-[var(--color-go)]" />
                <span>
                  Remove the 8 demo games first <span className="text-ink-400">(they&apos;re why recommendations lean hardcore/horror)</span>
                </span>
              </label>
            )}

            {error && <p className="rounded-lg bg-rose-950/60 p-2.5 text-xs text-rose-100 ring-1 ring-rose-500/30">{error}</p>}

            <button disabled={busy || !user.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-go py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-40">
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Importing &amp; tagging… {count > 50 ? "(can take ~20s)" : ""}
                </>
              ) : (
                `Import ${count === 500 ? "all" : `${count} most recent`} favorites`
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
