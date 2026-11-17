import "server-only";
import { dismissed, games as gameStore, vault } from "./store";
import { GEM_MAX_CCU, GEM_MIN_APPROVAL, passesGemGates, TAG_BY_SLUG } from "./constants";
import { toGameDTO, type GameDTO } from "./dto";
import { fetchSimilarGames, hydrateUniverses, searchGames, type SearchHit } from "./roblox";
import { upsertSnapshot } from "./ingest";

/**
 * Taste Graph
 * ------------------------------------------------------------
 * 1. Build a weighted tag vector from the user's taste signals:
 *      LOVED              +1.25 × (stars/5, default 0.9)
 *      ★ ≥ 4 (any status) +1.00 × stars/5
 *      DROPPED or ★ ≤ 2   −0.50 (pushes away from mechanics they bounced off)
 *      "Not interested"   −0.35 (and the game itself is never shown again)
 *    Each contribution is multiplied by the tag's classifier confidence.
 * 2. For every non-vaulted game: match = Σ w(tag)·conf / (‖taste‖₁ normalised), clipped 0–1.
 * 3. final = 0.55·match + 0.45·(hiddenGemScore/100), then
 *      ×1.15 if it clears both gem gates (≥85% approval AND <2,000 CCU)
 *      ×0.60 if CCU ≥ 2,000      ×0.70 if approval < 85%
 * 4. Diversify (greedy re-rank): each pick's score is reduced for every matched tag the shelf
 *    already shows, so one dominant taste (e.g. horror) can't fill the whole shelf.
 */

export interface Recommendation {
  game: GameDTO;
  score: number;
  match: number;
  matchedTags: { slug: string; label: string }[];
  because: string[]; // names of loved games sharing tags
  /** One-line human explanation, e.g. "Shares Parry Combat + Permadeath with Deepwoken · 94% approval · 340 playing" */
  why: string;
}

export async function buildTasteVector() {
  const entries = vault.list();
  const weights = new Map<string, number>();
  const sources = new Map<string, Set<string>>(); // tag → loved game names
  const seeds: string[] = [];

  for (const e of entries) {
    let w = 0;
    const stars = e.starRating ?? null;
    if (e.status === "LOVED") w += 1.25 * (stars ? stars / 5 : 0.9);
    else if (stars !== null && stars >= 4) w += stars / 5;
    if (e.status === "DROPPED" || (stars !== null && stars <= 2)) w -= 0.5;
    if (w === 0) continue;
    if (w > 0) seeds.push(e.game.name);
    for (const gt of e.game.tags) {
      weights.set(gt.slug, (weights.get(gt.slug) ?? 0) + w * gt.confidence);
      if (w > 0) {
        if (!sources.has(gt.slug)) sources.set(gt.slug, new Set());
        sources.get(gt.slug)!.add(e.game.name);
      }
    }
  }
  const seedIds = entries
    .filter((e) => e.status === "LOVED" || (e.starRating ?? 0) >= 4)
    .sort((a, b) => (b.starRating ?? 4.5) - (a.starRating ?? 4.5))
    .map((e) => Number(e.gameUniverseId));
  // "Not interested" clicks are a weak negative signal on that game's mechanics
  const hidden = dismissed.ids();
  for (const g of gameStore.getMany([...hidden])) {
    for (const gt of g.tags) if (gt.confidence >= 0.25) weights.set(gt.slug, (weights.get(gt.slug) ?? 0) - 0.35 * gt.confidence);
  }
  return { weights, sources, seeds, seedIds, hidden, vaultedIds: new Set(entries.map((e) => e.gameUniverseId)) };
}

export async function recommend({ limit = 12, includeVaulted = false } = {}): Promise<{ items: Recommendation[]; seeds: string[]; topTags: string[] }> {
  const { weights, sources, seeds, vaultedIds, hidden } = await buildTasteVector();
  const positive = [...weights.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]);
  const norm = positive.slice(0, 6).reduce((s, [, w]) => s + w, 0) || 1;

  const games = gameStore.listSynced();
  const scored: Recommendation[] = [];

  for (const g of games) {
    if (hidden.has(g.universeId)) continue;
    const vaulted = vaultedIds.has(g.universeId);
    if (vaulted && !includeVaulted) continue;
    let raw = 0;
    const matched: { slug: string; label: string }[] = [];
    const because = new Set<string>();
    for (const gt of g.tags) {
      if (gt.confidence < 0.25) continue; // filler tags from the heuristic tagger aren't real signal
      const w = weights.get(gt.slug);
      if (!w) continue;
      raw += w * gt.confidence;
      if (w > 0) {
        matched.push({ slug: gt.slug, label: gt.label });
        sources.get(gt.slug)?.forEach((n) => n !== g.name && because.add(n));
      }
    }
    const match = Math.max(0, Math.min(1, raw / norm));
    if (seeds.length && match <= 0) continue; // nothing in common with your taste
    let score = 0.55 * match + 0.45 * (g.hiddenGemScore / 100);
    const gemGate = passesGemGates(g);
    if (gemGate) score *= 1.15;
    if (g.ccu >= GEM_MAX_CCU) score *= 0.6;
    if (g.approvalPercentage < GEM_MIN_APPROVAL) score *= 0.7;
    const becauseList = [...because].slice(0, 3);
    const shares = matched.slice(0, 2).map((t) => t.label).join(" + ");
    const parts = [
      shares && becauseList.length ? `Shares ${shares} with ${becauseList[0]}` : shares ? `Matches your taste for ${shares}` : "Highly rated hidden gem",
      `${Math.round(g.approvalPercentage)}% approval`,
      `${g.ccu.toLocaleString("en-US")} playing`,
    ];
    if (gemGate) parts.push("passes both gem gates");
    scored.push({ game: toGameDTO(g), score: Math.round(score * 1000) / 1000, match: Math.round(match * 100) / 100, matchedTags: matched, because: becauseList, why: parts.join(" · ") });
  }

  scored.sort((a, b) => b.score - a.score);

  // Greedy diversity re-rank (MMR-style): penalize tags the shelf already covers.
  const picked: Recommendation[] = [];
  const shown = new Map<string, number>();
  const remaining = [...scored];
  while (picked.length < limit && remaining.length) {
    let bestI = 0, bestAdj = -Infinity;
    remaining.forEach((r, i) => {
      const overlap = r.matchedTags.reduce((s, t) => s + (shown.get(t.slug) ?? 0), 0) / Math.max(1, r.matchedTags.length);
      const adj = r.score * (1 / (1 + 0.35 * overlap));
      if (adj > bestAdj) (bestAdj = adj), (bestI = i);
    });
    const [r] = remaining.splice(bestI, 1);
    picked.push(r);
    for (const t of r.matchedTags) shown.set(t.slug, (shown.get(t.slug) ?? 0) + 1);
  }
  return { items: picked, seeds, topTags: positive.slice(0, 5).map(([s]) => s) };
}

/**
 * Grow the candidate pool ("Dig deeper"):
 *  - Roblox's own "similar experiences" for up to 6 of your Loved / top-rated games (rotating each call)
 *  - Roblox search for up to 6 of your top mechanics, one query per tag, so every taste gets candidates
 * Unseen hits are hydrated (batched) and auto-tagged. Megahits are skipped before hydration.
 */
let digRound = 0;
export async function expandCandidatePool(maxNew = 24) {
  const { weights, seedIds } = await buildTasteVector();
  const tags = [...weights.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => TAG_BY_SLUG[s]?.label ?? s);
  if (!tags.length && !seedIds.length) return { added: 0, queries: [] as string[] };

  // Rotate which seeds we ask about so repeated digs reach new territory.
  const start = (digRound++ * 3) % Math.max(1, seedIds.length);
  const seedsThisRound = [...seedIds.slice(start), ...seedIds.slice(0, start)].slice(0, 6);

  const [similar, searched] = await Promise.all([
    Promise.all(seedsThisRound.map((id) => fetchSimilarGames(id, 12).catch(() => [] as SearchHit[]))),
    Promise.all(tags.map((t) => searchGames(t, 12).catch(() => [] as SearchHit[]))),
  ]);
  const known = gameStore.allIds();

  // Interleave sources so one source/tag can't use up the whole budget.
  const lists = [...similar, ...searched];
  const fresh = new Map<number, SearchHit>();
  for (let i = 0; fresh.size < maxNew && lists.some((l) => l.length > i); i++) {
    for (const l of lists) {
      const h = l[i];
      if (h && !known.has(h.universeId) && !fresh.has(h.universeId) && h.playerCount < GEM_MAX_CCU * 3) fresh.set(h.universeId, h);
      if (fresh.size >= maxNew) break;
    }
  }
  const snaps = await hydrateUniverses([...fresh.keys()]);
  for (const s of snaps) await upsertSnapshot(s);
  return { added: snaps.length, queries: tags };
}
