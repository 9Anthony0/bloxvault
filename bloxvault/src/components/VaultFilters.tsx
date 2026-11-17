"use client";
import { Gem, RotateCcw, Search, ThumbsUp, Users } from "lucide-react";
import { PARTY_META, PARTY_SIZES, STATUS_META, VAULT_STATUSES } from "@/lib/constants";
import { activeFilterCount, CCU_STEPS, DEFAULT_FILTERS, type SortKey, type VaultFilters } from "@/lib/filters";
import { cn, compact } from "@/lib/format";
import { TagChip } from "./ui";

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function VaultFiltersPanel({
  value,
  onChange,
  tagFacets,
  statusCounts,
}: {
  value: VaultFilters;
  onChange: (f: VaultFilters) => void;
  tagFacets: { slug: string; label: string; count: number }[];
  statusCounts: Record<string, number>;
}) {
  const set = (patch: Partial<VaultFilters>) => onChange({ ...value, ...patch });
  const ccuCap = CCU_STEPS[value.maxCcuStep];
  const n = activeFilterCount(value);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search your vault"
          className="w-full rounded-lg bg-ink-850 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-ink-700 placeholder:text-ink-400 focus:ring-ink-600"
        />
      </div>

      <Section title="Status">
        <div className="flex flex-col gap-0.5">
          {VAULT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => set({ statuses: toggle(value.statuses, s) })}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition",
                value.statuses.includes(s) ? "bg-ink-800 text-ink-100" : "text-ink-300 hover:bg-ink-850 hover:text-ink-100",
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full ring-1", STATUS_META[s].color)} />
                {STATUS_META[s].label}
              </span>
              <span className="text-xs tabular-nums text-ink-400">{statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Party size" icon={<Users className="size-3.5" />}>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-850 p-1 ring-1 ring-ink-700">
          {PARTY_SIZES.map((p) => (
            <button
              key={p}
              onClick={() => set({ party: toggle(value.party, p) })}
              className={cn("rounded-md py-1.5 text-xs font-medium transition", value.party.includes(p) ? "bg-ink-100 text-ink-950" : "text-ink-300 hover:text-ink-100")}
            >
              {PARTY_META[p]}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Max players online"
        right={<span className={cn("text-xs tabular-nums", ccuCap === Infinity ? "text-ink-400" : "text-go")}>{ccuCap === Infinity ? "Any" : `≤ ${compact(ccuCap)}`}</span>}
      >
        <input
          type="range"
          min={0}
          max={CCU_STEPS.length - 1}
          step={1}
          value={value.maxCcuStep}
          onChange={(e) => set({ maxCcuStep: Number(e.target.value) })}
          className="w-full"
          style={{ ["--pct" as string]: `${(value.maxCcuStep / (CCU_STEPS.length - 1)) * 100}%` }}
          aria-label="Max concurrent players"
        />
        <div className="flex justify-between text-[10px] text-ink-400">
          <span>Ghost town</span>
          <span>Front page</span>
        </div>
      </Section>

      <Section
        title="Min approval"
        icon={<ThumbsUp className="size-3.5" />}
        right={<span className={cn("text-xs tabular-nums", value.minApproval ? "text-go" : "text-ink-400")}>{value.minApproval ? `≥ ${value.minApproval}%` : "Any"}</span>}
      >
        <input
          type="range"
          min={0}
          max={98}
          step={1}
          value={value.minApproval}
          onChange={(e) => set({ minApproval: Number(e.target.value) })}
          className="w-full"
          style={{ ["--pct" as string]: `${(value.minApproval / 98) * 100}%` }}
          aria-label="Minimum approval percentage"
        />
      </Section>

      <button
        onClick={() => set({ gemsOnly: !value.gemsOnly })}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 transition",
          value.gemsOnly ? "bg-gem/15 text-gem ring-gem/40" : "bg-ink-850 text-ink-300 ring-ink-700 hover:text-ink-100",
        )}
      >
        <span className="flex items-center gap-2">
          <Gem className="size-4" /> Hidden gems only
        </span>
        <span className="text-[11px] opacity-80">≥85% · &lt;2k CCU</span>
      </button>

      {tagFacets.length > 0 && (
        <Section title="Mechanics & vibes">
          <div className="flex flex-wrap gap-1.5">
            {tagFacets.map((t) => (
              <TagChip key={t.slug} label={t.label} count={t.count} active={value.tags.includes(t.slug)} onClick={() => set({ tags: toggle(value.tags, t.slug) })} />
            ))}
          </div>
        </Section>
      )}

      {n > 0 && (
        <button onClick={() => onChange({ ...DEFAULT_FILTERS, sort: value.sort })} className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100">
          <RotateCcw className="size-3.5" /> Clear {n} filter{n > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="rounded-lg bg-ink-850 px-2.5 py-1.5 text-xs text-ink-100 outline-none ring-1 ring-ink-700"
      aria-label="Sort"
    >
      <option value="recent">Recently vaulted</option>
      <option value="played">Recently played</option>
      <option value="gem">Hidden Gem Score</option>
      <option value="approval">Approval %</option>
      <option value="ccu-asc">Fewest players</option>
      <option value="rating">Your rating</option>
    </select>
  );
}

function Section({ title, icon, right, children }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
          {icon}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}
