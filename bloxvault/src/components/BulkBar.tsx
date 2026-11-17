"use client";
import { ListPlus, Loader2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { STATUS_META, VAULT_STATUSES, type VaultStatus } from "@/lib/constants";
import type { ListDTO } from "@/lib/lists";

/** Floating action bar for multi-select in the vault grid. */
export function BulkBar({ ids, lists, onDone, onCancel, onSelectAll }: { ids: string[]; lists: ListDTO[]; onDone: () => void; onCancel: () => void; onSelectAll: () => void }) {
  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const n = ids.length;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setMsg(label);
      setDropOpen(false);
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-3 lg:bottom-6">
      <div className="animate-rise relative flex max-w-full flex-wrap items-center gap-2 rounded-2xl bg-ink-850/95 px-3 py-2.5 shadow-2xl shadow-black/60 ring-1 ring-ink-700 backdrop-blur-xl">
        <span className="text-sm font-semibold tabular-nums">{n} selected</span>
        <button onClick={onSelectAll} className="text-xs text-ink-400 hover:text-ink-100">
          Select all shown
        </button>
        <span className="mx-1 h-5 w-px bg-ink-700" />
        <select
          disabled={!n || busy}
          value=""
          onChange={(e) => e.target.value && run(`Moved ${n} to ${STATUS_META[e.target.value as VaultStatus].short}`, () => api.bulk({ action: "status", ids, status: e.target.value as VaultStatus }))}
          className="rounded-lg bg-ink-800 px-2 py-1.5 text-xs ring-1 ring-ink-700 disabled:opacity-40"
          aria-label="Set status"
        >
          <option value="">Set status…</option>
          {VAULT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <div className="relative">
          <button disabled={!n || busy} onClick={() => setDropOpen(!dropOpen)} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 px-2.5 py-1.5 text-xs ring-1 ring-ink-700 disabled:opacity-40">
            <ListPlus className="size-3.5" /> Add to Drop
          </button>
          {dropOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 space-y-1 rounded-xl bg-ink-850 p-2 ring-1 ring-ink-700">
              {lists.map((l) => (
                <button key={l.slug} onClick={() => run(`Added ${n} to “${l.title}”`, () => api.bulk({ action: "drop", ids, slug: l.slug }))} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-ink-800">
                  {l.title}
                </button>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (title.trim().length >= 3) run(`Created “${title.trim()}”`, () => api.bulk({ action: "drop", ids, newTitle: title.trim() }));
                }}
                className="flex gap-1 pt-1"
              >
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New Drop title…" className="min-w-0 flex-1 rounded-md bg-ink-900 px-2 py-1.5 text-xs outline-none ring-1 ring-ink-700" />
                <button className="rounded-md bg-ink-800 px-2 text-xs ring-1 ring-ink-700">Create</button>
              </form>
            </div>
          )}
        </div>
        <button
          disabled={!n || busy}
          onClick={() => confirm(`Remove ${n} game${n > 1 ? "s" : ""} from your vault?`) && run(`Removed ${n}`, () => api.bulk({ action: "remove", ids }))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 px-2.5 py-1.5 text-xs text-rose-300 ring-1 ring-ink-700 hover:ring-rose-500/40 disabled:opacity-40"
        >
          <Trash2 className="size-3.5" /> Remove
        </button>
        {busy && <Loader2 className="size-4 animate-spin text-ink-400" />}
        {msg && !busy && <span className="text-xs text-go">{msg}</span>}
        <button onClick={onCancel} className="ml-1 rounded-lg p-1.5 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Exit selection (Esc)">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
