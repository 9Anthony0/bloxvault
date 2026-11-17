import type { PartySize, VaultStatus } from "./constants";
import type { VaultEntryDTO } from "./dto";

/** Log-ish CCU steps for the Max CCU slider. Last step = no cap. */
export const CCU_STEPS = [50, 100, 300, 500, 1000, 2000, 5000, 10_000, 50_000, Infinity] as const;

export type SortKey = "recent" | "played" | "gem" | "approval" | "ccu-asc" | "rating";

export interface VaultFilters {
  q: string;
  statuses: VaultStatus[];
  party: PartySize[];
  tags: string[]; // match ALL selected
  maxCcuStep: number; // index into CCU_STEPS
  minApproval: number; // 0–100
  gemsOnly: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: VaultFilters = {
  q: "",
  statuses: [],
  party: [],
  tags: [],
  maxCcuStep: CCU_STEPS.length - 1,
  minApproval: 0,
  gemsOnly: false,
  sort: "recent",
};

export function applyFilters(entries: VaultEntryDTO[], f: VaultFilters) {
  const maxCcu = CCU_STEPS[f.maxCcuStep] ?? Infinity;
  const q = f.q.trim().toLowerCase();
  const out = entries.filter((e) => {
    const g = e.game;
    if (f.statuses.length && !f.statuses.includes(e.status)) return false;
    if (f.party.length && !f.party.every((p) => g.partySizes.includes(p))) return false;
    if (f.tags.length && !f.tags.every((t) => g.tags.some((gt) => gt.slug === t))) return false;
    if (g.ccu > maxCcu) return false;
    if (g.approvalPercentage < f.minApproval) return false;
    if (f.gemsOnly && !g.isHiddenGem) return false;
    if (q && !`${g.name} ${g.creatorName} ${e.notes} ${g.tags.map((t) => t.label).join(" ")}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const by: Record<SortKey, (a: VaultEntryDTO, b: VaultEntryDTO) => number> = {
    recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
    played: (a, b) => (b.lastPlayedOn ?? "").localeCompare(a.lastPlayedOn ?? "") || b.updatedAt.localeCompare(a.updatedAt),
    gem: (a, b) => b.game.hiddenGemScore - a.game.hiddenGemScore,
    approval: (a, b) => b.game.approvalPercentage - a.game.approvalPercentage,
    "ccu-asc": (a, b) => a.game.ccu - b.game.ccu,
    rating: (a, b) => (b.starRating ?? -1) - (a.starRating ?? -1),
  };
  return out.sort(by[f.sort]);
}

export function activeFilterCount(f: VaultFilters) {
  return (
    f.statuses.length +
    f.party.length +
    f.tags.length +
    (f.maxCcuStep !== DEFAULT_FILTERS.maxCcuStep ? 1 : 0) +
    (f.minApproval > 0 ? 1 : 0) +
    (f.gemsOnly ? 1 : 0)
  );
}
