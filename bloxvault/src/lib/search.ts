import "server-only";
import { partySizesFor, passesGemGates, TAG_BY_SLUG } from "./constants";
import type { CandidateDTO } from "./dto";
import { candidateFrom, rankCandidates, type RankedCandidate } from "./ingest";
import { fetchIcons, searchGames, type SearchHit } from "./roblox";
import { approvalPct, computeHiddenGem } from "./scoring";
import { cleanSearchQuery, queryVariants } from "./social";
import { games, vault, type GameRecord } from "./store";
import { parseQuery, type FilterKey, type ParsedQuery } from "./vibe";

/**
 * Two-phase search used by the live dropdown.
 *   phase=fast  (~1 Roblox search + 1 icon call): instant list from Roblox's own ranking + your vault + your local pool
 *   phase=full  (hydrates ~10–16 games): reads descriptions, infers tags, applies vibe filters, re-ranks
 * The client shows `fast` immediately and swaps in `full` when it lands.
 */

export interface SearchResponse {
  query: string;
  phase: "fast" | "full";
  parsed: ParsedQuery;
  /** Games already in your vault that match */
  vault: CandidateDTO[];
  /** Everything else: Roblox results + games already known locally (from imports / Dig deeper) */
  results: CandidateDTO[];
}

/* ------------------------------ filters ------------------------------ */

interface Filterable {
  ccu: number;
  approval: number; // 0–100
  votes: number;
  maxPlayers: number;
  tagSlugs: string[];
}

function passes(f: Filterable, p: ParsedQuery, { strictParty }: { strictParty: boolean }) {
  if (p.maxCcu !== null && f.ccu > p.maxCcu) return false;
  if (p.minApproval !== null && f.votes > 0 && f.approval < p.minApproval) return false;
  if (p.gemsOnly && !passesGemGates({ approvalPercentage: f.approval, ccu: f.ccu, upVotes: f.votes, downVotes: 0 })) return false;
  // Party size needs maxPlayers, which fast results don't have yet — only enforce once known.
  if (p.party && (strictParty || f.maxPlayers > 0) && !partySizesFor(f.maxPlayers, f.tagSlugs).includes(p.party)) return false;
  return true;
}

const tagMatch = (slugs: string[], p: ParsedQuery) => (p.tags.length ? p.tags.filter((t) => slugs.includes(t.slug)).length / p.tags.length : 0);

/* ------------------------------ local ------------------------------ */

function gameToCandidate(g: GameRecord, extra: Partial<CandidateDTO> = {}): CandidateDTO {
  return {
    universeId: g.universeId,
    rootPlaceId: g.rootPlaceId,
    name: g.name,
    creatorName: g.creatorName,
    iconUrl: g.iconUrl,
    description: g.description.replace(/\s+/g, " ").slice(0, 160),
    playerCount: g.ccu,
    maxPlayers: g.maxPlayers,
    approvalPercentage: Math.round(g.approvalPercentage),
    hiddenGemScore: g.hiddenGemScore,
    isHiddenGem: g.lastSyncedAt !== null && passesGemGates(g),
    similarity: 0,
    score: 0,
    reason: null,
    inVault: false,
    entryId: null,
    tags: g.tags.filter((t) => t.confidence >= 0.25).map((t) => ({ slug: t.slug, label: t.label })),
    ...extra,
  };
}

const filterableGame = (g: GameRecord): Filterable => ({
  ccu: g.ccu,
  approval: g.approvalPercentage,
  votes: g.upVotes + g.downVotes,
  maxPlayers: g.maxPlayers,
  tagSlugs: g.tags.filter((t) => t.confidence >= 0.25).map((t) => t.slug),
});

/** Match against games we already have locally (vault + pool). Instant, no network. */
function localMatches(p: ParsedQuery) {
  const text = cleanSearchQuery(p.raw).toLowerCase();
  const words = (p.text || text).split(" ").filter((w) => w.length > 2);
  const entries = new Map(vault.list().map((e) => [e.gameUniverseId, e]));
  const scored: { g: GameRecord; s: number; why: string | null }[] = [];

  for (const g of games.listSynced()) {
    const f = filterableGame(g);
    const name = g.name.toLowerCase();
    const nameHit = text.length >= 2 && (name.includes(text) || (words.length > 0 && words.every((w) => name.includes(w))));
    const tm = tagMatch(f.tagSlugs, p);
    if (p.isVibe) {
      if (!passes(f, p, { strictParty: true })) continue;
      if (p.tags.length && tm === 0) continue;
      if (!p.tags.length && !nameHit && p.text) continue;
      const s = 0.55 * tm + 0.3 * (g.hiddenGemScore / 100) + 0.15 * (g.approvalPercentage / 100) + (nameHit ? 0.3 : 0);
      const matched = p.tags.filter((t) => f.tagSlugs.includes(t.slug)).map((t) => t.label);
      scored.push({ g, s, why: matched.length ? `Matches ${matched.join(" + ")}` : null });
    } else if (nameHit) {
      scored.push({ g, s: name === text ? 2 : 1 + tm, why: null });
    }
  }
  scored.sort((a, b) => b.s - a.s);
  const inVault = scored.filter((x) => entries.has(x.g.universeId)).slice(0, 5);
  const pool = scored.filter((x) => !entries.has(x.g.universeId)).slice(0, 8);
  return {
    vault: inVault.map((x) => gameToCandidate(x.g, { inVault: true, entryId: entries.get(x.g.universeId)!.id, reason: x.why, score: x.s })),
    pool: pool.map((x) => gameToCandidate(x.g, { reason: x.why ?? "Already in your discovery pool", score: x.s })),
  };
}

/* ------------------------------ roblox ------------------------------ */

function robloxQueries(p: ParsedQuery): string[] {
  if (!p.isVibe) return queryVariants(p.raw);
  const tagLabels = p.tags.map((t) => TAG_BY_SLUG[t.slug]?.label.replace(/&/g, "").replace(/\s+/g, " ") ?? t.label);
  return [...new Set([p.text, p.text && tagLabels[0] ? `${p.text} ${tagLabels[0]}` : "", ...tagLabels].filter(Boolean))].slice(0, 4) as string[];
}

function hitToCandidate(h: SearchHit, i: number, icon: string | null, vaulted: Map<number, string>): CandidateDTO {
  const gem = computeHiddenGem({ upVotes: h.upVotes, downVotes: h.downVotes, ccu: h.playerCount, lastUpdated: null });
  const known = games.get(h.universeId);
  return {
    universeId: h.universeId,
    rootPlaceId: h.rootPlaceId,
    name: h.name,
    creatorName: h.creatorName ?? "",
    iconUrl: icon ?? known?.iconUrl ?? null,
    description: "",
    playerCount: h.playerCount,
    maxPlayers: known?.maxPlayers ?? 0,
    approvalPercentage: Math.round(approvalPct(h.upVotes, h.downVotes)),
    hiddenGemScore: known?.hiddenGemScore ?? gem.score,
    isHiddenGem: gem.isHiddenGem,
    similarity: 0,
    score: 1 - i / 20,
    reason: null,
    inVault: vaulted.has(h.universeId),
    entryId: vaulted.get(h.universeId) ?? null,
    tags: known?.tags.filter((t) => t.confidence >= 0.25).map((t) => ({ slug: t.slug, label: t.label })) ?? [],
  };
}

function mergeUnique(...lists: CandidateDTO[][]) {
  const seen = new Set<number>();
  const out: CandidateDTO[] = [];
  for (const l of lists) for (const c of l) if (!seen.has(c.universeId)) seen.add(c.universeId), out.push(c);
  return out;
}

/* ------------------------------ phases ------------------------------ */

export async function searchFast(q: string, off: FilterKey[] = []): Promise<SearchResponse> {
  const p = parseQuery(q, off);
  const local = localMatches(p);
  const vaulted = new Map(vault.list().map((e) => [e.gameUniverseId, e.id]));
  const query = robloxQueries(p)[0] ?? q;
  const hits = await searchGames(query, 15).catch(() => [] as SearchHit[]);
  const icons = await fetchIcons(hits.map((h) => h.universeId)).catch(() => new Map<number, string>());
  const roblox = hits
    .filter((h) => passes({ ccu: h.playerCount, approval: approvalPct(h.upVotes, h.downVotes), votes: h.upVotes + h.downVotes, maxPlayers: 0, tagSlugs: [] }, p, { strictParty: false }))
    .map((h, i) => hitToCandidate(h, i, icons.get(h.universeId) ?? null, vaulted))
    .filter((c) => !c.inVault || !local.vault.some((v) => v.universeId === c.universeId));
  // For vibes, local pool games are already filtered/tagged → show them first; for names, Roblox's ranking leads.
  const results = p.isVibe ? mergeUnique(local.pool, roblox) : mergeUnique(roblox, local.pool);
  return { query: q, phase: "fast", parsed: p, vault: local.vault, results: results.filter((r) => !local.vault.some((v) => v.universeId === r.universeId)).slice(0, 20) };
}

export async function searchFull(q: string, off: FilterKey[] = []): Promise<SearchResponse> {
  const p = parseQuery(q, off);
  const local = localMatches(p);
  const entries = new Map(vault.list().map((e) => [e.gameUniverseId, e.id]));
  const queries = robloxQueries(p);
  // Names: only the user's own words count as keywords. Vibes: the leftover text (tags are scored separately).
  const keywords = (p.isVibe ? p.text : p.text || cleanSearchQuery(p.raw)).split(" ").filter(Boolean);
  const ranked: RankedCandidate[] = await rankCandidates(queries, keywords, "search", { shortlistSize: p.isVibe ? 16 : 12, perQuery: 12 }).catch(() => []);

  const scored = ranked
    .map((r) => {
      const c = candidateFrom(r, { inVault: entries.has(r.hit.universeId), entryId: entries.get(r.hit.universeId) ?? null });
      const slugs = (c.tags ?? []).map((t) => t.slug);
      const f: Filterable = { ccu: c.playerCount, approval: c.approvalPercentage, votes: (r.snap?.upVotes ?? r.hit.upVotes) + (r.snap?.downVotes ?? r.hit.downVotes), maxPlayers: c.maxPlayers, tagSlugs: slugs };
      if (!passes(f, p, { strictParty: Boolean(r.snap) })) return null;
      const tm = tagMatch(slugs, p);
      if (p.isVibe && p.tags.length && tm === 0) return null;
      const matched = p.tags.filter((t) => slugs.includes(t.slug)).map((t) => t.label);
      // Names: keep the name-matching score, nudge by tag overlap. Vibes: tags + gem quality lead.
      const score = p.isVibe ? 0.45 * tm + 0.25 * (c.hiddenGemScore / 100) + 0.3 * r.score : r.score + 0.2 * tm;
      return { ...c, score: Math.round(score * 100) / 100, reason: matched.length && (p.isVibe || !c.reason) ? `Matches ${matched.join(" + ")}` : c.reason };
    })
    .filter((c): c is CandidateDTO => c !== null)
    .sort((a, b) => b.score - a.score);

  const robloxNotVault = scored.filter((c) => !local.vault.some((v) => v.universeId === c.universeId));
  // Merge pool games in by score (vibes) or after Roblox matches (names)
  const results = p.isVibe ? mergeUnique(robloxNotVault, local.pool).sort((a, b) => b.score - a.score) : mergeUnique(robloxNotVault, local.pool);
  return { query: q, phase: "full", parsed: p, vault: local.vault, results: results.slice(0, 20) };
}
