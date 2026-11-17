import "server-only";
import { games, meta, tags as tagStore, vault } from "./store";
import { TAG_BY_SLUG, TAG_TAXONOMY, type VaultStatus } from "./constants";
import { toEntryDTO, toGameDTO, type CandidateDTO, type GameDTO, type VaultEntryDTO } from "./dto";
import { expandRobloxShortLink, extractPlaceId, hydratePlace, hydrateUniverses, searchGames, type RobloxGameSnapshot, type SearchHit } from "./roblox";
import { computeHiddenGem, approvalPct } from "./scoring";
import { classifyInput, cleanSearchQuery, extractTitleCandidates, fetchSocialMeta, queryVariants, titleSimilarity, GENRE_WORDS, type InputKind } from "./social";
import { classifyHeuristic, classifyTags, TAGGER_VERSION, type TagResult } from "./tagger";

const TTL_MS = Number(process.env.ROBLOX_SYNC_TTL_MINUTES ?? 360) * 60_000;

/* ------------------------------------------------------------------ */
/* Persistence                                                          */
/* ------------------------------------------------------------------ */

export async function setGameTags(universeId: number, links: { slug: string; confidence: number; source: string }[], { replace = false } = {}) {
  if (replace) tagStore.clear(universeId, ["heuristic", "llm"]);
  tagStore.add(
    universeId,
    links.map((t) => ({ ...t, label: TAG_BY_SLUG[t.slug]?.label ?? t.slug })),
  );
}

/** Upsert telemetry and recompute the Hidden Gem Score. Auto-tags only when the game has no tags yet. */
export async function upsertSnapshot(snap: RobloxGameSnapshot, opts: { caption?: string; retag?: boolean } = {}) {
  const before = games.get(snap.universeId);
  const gem = computeHiddenGem({ upVotes: snap.upVotes, downVotes: snap.downVotes, ccu: snap.ccu, lastUpdated: snap.lastUpdated });
  games.upsert({
    universeId: snap.universeId,
    rootPlaceId: snap.rootPlaceId,
    name: snap.name,
    description: snap.description,
    creatorName: snap.creatorName,
    creatorType: snap.creatorType,
    genre: snap.genre,
    subgenre: snap.subgenre,
    iconUrl: snap.iconUrl, // null keeps the previous icon (see store)
    thumbnailUrls: snap.thumbnailUrls, // [] keeps the previous thumbnails
    ccu: snap.ccu,
    visits: snap.visits,
    maxPlayers: snap.maxPlayers,
    upVotes: snap.upVotes,
    downVotes: snap.downVotes,
    approvalPercentage: gem.approvalPercentage,
    hiddenGemScore: gem.score,
    lastUpdated: snap.lastUpdated,
    lastSyncedAt: new Date(),
  });
  // Tag when new, when asked, or when Roblox's genre info changed on a game we auto-tagged (user/seed tags are never touched).
  const genreChanged = before && (before.genre !== snap.genre || before.subgenre !== snap.subgenre) && tagStore.allAuto(snap.universeId);
  if (tagStore.count(snap.universeId) === 0 || opts.retag || genreChanged) {
    const t = await classifyTags({ name: snap.name, description: snap.description, caption: opts.caption, genre: snap.genre, subgenre: snap.subgenre });
    await setGameTags(snap.universeId, t, { replace: true });
  }
  return games.get(snap.universeId)!;
}

/**
 * Rebuild auto-generated tags when the tagger improves (TAGGER_VERSION bump). Local and fast:
 * uses stored name/description/genre, keeps user- and seed-assigned tags. Called on app load.
 */
export function ensureTaggerVersion() {
  if (Number(meta.get("tagger_version") ?? 0) >= TAGGER_VERSION) return 0;
  for (const t of TAG_TAXONOMY) tagStore.ensure(t.slug, t.label); // refresh renamed labels
  let n = 0;
  for (const g of games.listAll()) {
    if (!tagStore.allAuto(g.universeId)) continue;
    tagStore.clear(g.universeId, ["heuristic", "llm"]);
    tagStore.add(
      g.universeId,
      classifyHeuristic({ name: g.name, description: g.description, genre: g.genre, subgenre: g.subgenre }).map((t) => ({ ...t, label: TAG_BY_SLUG[t.slug]?.label ?? t.slug })),
    );
    n++;
  }
  meta.set("tagger_version", String(TAGGER_VERSION));
  return n;
}

const fresh = (g: { lastSyncedAt: Date | null } | null) => Boolean(g?.lastSyncedAt && Date.now() - g.lastSyncedAt.getTime() < TTL_MS);

/** Return a cached game if fresh, else hydrate from Roblox. */
export async function getOrHydrateByUniverse(universeId: number, opts: { caption?: string; force?: boolean } = {}) {
  const existing = games.get(universeId);
  if (!opts.force && fresh(existing)) return existing!;
  const [snap] = await hydrateUniverses([universeId]);
  if (!snap) {
    if (existing) return existing;
    throw new Error(`Roblox returned no data for universe ${universeId}`);
  }
  return upsertSnapshot(snap, { caption: opts.caption });
}

export async function getOrHydrateByPlace(placeId: number, opts: { caption?: string; force?: boolean } = {}) {
  const cached = games.getByRootPlace(placeId);
  if (cached && !opts.force && fresh(cached)) return cached;
  if (cached) return getOrHydrateByUniverse(cached.universeId, { ...opts, force: true });
  // Sub-places (not the root) also resolve to their universe here
  const snap = await hydratePlace(placeId);
  return upsertSnapshot(snap, { caption: opts.caption });
}

/** Refresh every game whose telemetry is older than the TTL (or never synced). Batched. */
export async function syncStaleGames(limit = 100) {
  const stale = games.staleIds(new Date(Date.now() - TTL_MS), limit);
  if (!stale.length) return { refreshed: 0 };
  const snaps = await hydrateUniverses(stale);
  for (const s of snaps) await upsertSnapshot(s);
  return { refreshed: snaps.length };
}

/* ------------------------------------------------------------------ */
/* Matching                                                             */
/* ------------------------------------------------------------------ */

export interface RankedCandidate {
  hit: SearchHit;
  snap: RobloxGameSnapshot | null;
  nameSim: number;
  coverage: number;
  score: number;
  reason: string | null;
}

async function localSearch(q: string): Promise<SearchHit[]> {
  return games.searchLocal(q, 8).map((r) => ({ universeId: r.universeId, rootPlaceId: r.rootPlaceId, name: r.name, playerCount: r.ccu, upVotes: r.upVotes, downVotes: r.downVotes }));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Two-stage ranking.
 *  1. Search Roblox with up to 3 query variants ("bleach anime game" → "bleach anime", "bleach").
 *     Pool + dedupe hits, keep the 10 Roblox ranks highest across variants.
 *  2. Hydrate those 10 (4 batched calls) so we can read DESCRIPTIONS — Bleach-inspired games
 *     rarely say "Bleach" in the title, but almost always do in the description.
 *     Final score:
 *       search:   0.30·name similarity + 0.30·keyword coverage (name+description) + 0.20·Roblox rank + 0.10·quality + 0.10·popularity
 *     Keyword coverage weights distinctive words 1.0 and genre words 0.25, and a game that never
 *     mentions any distinctive word (e.g. "Anime Highschool" for "bleach anime game") is scored ×0.6.
 *       caption:  0.55·name similarity + 0.15·coverage + 0.15·rank + 0.075·quality + 0.075·popularity
 *     Nothing is written to the DB here; candidates are only persisted once picked.
 */
export async function rankCandidates(guesses: string[], keywords: string[], kind: InputKind, { shortlistSize = 10, perQuery = 10 } = {}): Promise<RankedCandidate[]> {
  const queries = guesses.slice(0, 4);
  const lists = await Promise.all(
    queries.map(async (q) => {
      const hits = await searchGames(q, perQuery).catch(() => [] as SearchHit[]);
      return hits.length ? hits : localSearch(q);
    }),
  );

  // Stage 1: pool by best normalized Roblox rank; appearing in several variant lists is a good sign.
  const pool = new Map<number, { hit: SearchHit; rank: number; seen: number }>();
  lists.forEach((hits) =>
    hits.forEach((h, i) => {
      const rank = 1 - i / Math.max(hits.length, 1);
      const p = pool.get(h.universeId);
      if (!p) pool.set(h.universeId, { hit: h, rank, seen: 1 });
      else {
        p.rank = Math.max(p.rank, rank);
        p.seen++;
      }
    }),
  );
  const shortlist = [...pool.values()]
    .map((p) => ({ ...p, rank: Math.min(1, p.rank + 0.1 * (p.seen - 1)) }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, shortlistSize);
  if (!shortlist.length) return [];

  // Stage 2: hydrate for descriptions, art, live CCU.
  const snaps = new Map((await hydrateUniverses(shortlist.map((s) => s.hit.universeId)).catch(() => [] as RobloxGameSnapshot[])).map((s) => [s.universeId, s]));
  const kws = [...new Set(keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 2))];
  // Distinctive words ("bleach", "deepwoken") carry the query; genre words ("anime", "horror") barely count.
  const kwWeight = (k: string) => (GENRE_WORDS.has(k) ? 0.25 : 1);
  const distinct = kws.filter((k) => !GENRE_WORDS.has(k));
  const totalW = kws.reduce((s, k) => s + kwWeight(k), 0);
  const w = kind === "search" ? { sim: 0.3, cov: 0.3, rank: 0.2, q: 0.1, pop: 0.1 } : { sim: 0.55, cov: 0.15, rank: 0.15, q: 0.075, pop: 0.075 };

  return shortlist
    .map(({ hit, rank }) => {
      const snap = snaps.get(hit.universeId) ?? null;
      const name = snap?.name ?? hit.name;
      const desc = snap?.description ?? "";
      const nameSim = Math.max(...queries.map((q) => titleSimilarity(q, name)));
      const has = (text: string, k: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(k)}`, "iu").test(text);
      const inName = kws.filter((k) => has(name, k));
      const inDesc = kws.filter((k) => !inName.includes(k) && has(desc, k));
      const matched = [...inName, ...inDesc];
      const coverage = totalW ? matched.reduce((s, k) => s + kwWeight(k), 0) / totalW : nameSim;
      // Never mentions the one word that matters → probably just shares a genre word with the query.
      const missesCore = distinct.length > 0 && !distinct.some((k) => matched.includes(k));
      const up = snap?.upVotes ?? hit.upVotes, down = snap?.downVotes ?? hit.downVotes, ccu = snap?.ccu ?? hit.playerCount;
      const quality = computeHiddenGem({ upVotes: up, downVotes: down, ccu, lastUpdated: snap?.lastUpdated ?? null }).quality;
      const pop = Math.min(1, Math.log10(ccu + 1) / 5);
      const score = (w.sim * nameSim + w.cov * coverage + w.rank * rank + w.q * quality + w.pop * pop) * (missesCore && nameSim < 0.85 ? 0.6 : 1);
      const reason =
        nameSim >= 0.85 ? "Title match" : inDesc.some((k) => distinct.includes(k)) ? `Description mentions “${inDesc.filter((k) => distinct.includes(k)).slice(0, 2).join("”, “")}”` : inName.some((k) => distinct.includes(k)) ? `Title has “${inName.filter((k) => distinct.includes(k)).slice(0, 2).join("”, “")}”` : null;
      return { hit, snap, nameSim, coverage, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}

/** Only skip the picker when we're genuinely sure. */
export function isConfident(ranked: RankedCandidate[], kind: InputKind) {
  const [a, b] = ranked;
  if (!a) return false;
  if (kind === "search") return a.nameSim >= 0.9 && (!b || a.score - b.score >= 0.08);
  return a.nameSim >= 0.8 && (!b || a.score - b.score >= 0.05);
}

/* ------------------------------------------------------------------ */
/* Ingest pipeline                                                      */
/* ------------------------------------------------------------------ */

export interface IngestRequest {
  input?: string;
  universeId?: number;
  placeId?: number;
  sourceUrl?: string | null;
  caption?: string | null;
  status?: VaultStatus;
  /** Swap a mis-matched entry for the chosen candidate, carrying over its source link */
  replaceEntryId?: string;
}

/** A game was saved. */
export interface IngestResult {
  needsPick: false;
  kind: InputKind | "direct";
  entry: VaultEntryDTO;
  game: GameDTO;
  alreadyVaulted: boolean;
  confidence: number; // 0–1
  method: string;
  /** Other plausible matches for the "Not it?" swap */
  candidates: CandidateDTO[];
  captionUsed?: string;
}

/** Not confident enough to auto-save — the user picks from these. Nothing was saved. */
export interface PickResult {
  needsPick: true;
  kind: InputKind;
  query: string;
  method: string;
  candidates: CandidateDTO[];
  sourceUrl: string | null;
  caption: string | null;
}

export class IngestError extends Error {
  constructor(message: string, public status = 400, public code = "INGEST_FAILED", public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

async function vaultGame(universeId: number, opts: { sourceUrl?: string | null; caption?: string | null; status?: VaultStatus; replaceEntryId?: string }) {
  let carry: { sourceUrl: string | null; sourceCaption: string | null } | null = null;
  if (opts.replaceEntryId) {
    const old = vault.get(opts.replaceEntryId);
    if (old && old.gameUniverseId !== universeId) {
      carry = { sourceUrl: old.sourceUrl, sourceCaption: old.sourceCaption };
      vault.delete(old.id);
    }
  }
  const sourceUrl = opts.sourceUrl ?? carry?.sourceUrl ?? null;
  const sourceCaption = opts.caption ?? carry?.sourceCaption ?? null;
  const existing = vault.getByGame(universeId);
  if (existing) {
    // Never clobber a link the user already has; fill it in if it was empty.
    const entry = vault.update(existing.id, { sourceUrl: existing.sourceUrl ?? sourceUrl, sourceCaption: existing.sourceCaption ?? sourceCaption });
    return { entry, alreadyVaulted: true };
  }
  const entry = vault.create(universeId, { status: opts.status ?? "VAULTED", sourceUrl, sourceCaption });
  return { entry, alreadyVaulted: false };
}

/** Build the client DTO for a ranked search hit. Tags are inferred (not persisted) for unseen games. */
export function candidateFrom(r: RankedCandidate, opts: { inVault: boolean; entryId?: string | null }): CandidateDTO {
  const { hit, snap, nameSim, score, reason } = r;
  const up = snap?.upVotes ?? hit.upVotes, down = snap?.downVotes ?? hit.downVotes, ccu = snap?.ccu ?? hit.playerCount;
  const gem = computeHiddenGem({ upVotes: up, downVotes: down, ccu, lastUpdated: snap?.lastUpdated ?? null });
  const known = games.get(hit.universeId);
  const tags = known?.tags.length
    ? known.tags.filter((t) => t.confidence >= 0.25).map((t) => ({ slug: t.slug, label: t.label }))
    : snap
      ? classifyHeuristic({ name: snap.name, description: snap.description, genre: snap.genre, subgenre: snap.subgenre }).map((t) => ({ slug: t.slug, label: TAG_BY_SLUG[t.slug]?.label ?? t.slug }))
      : [];
  return {
    universeId: hit.universeId,
    rootPlaceId: snap?.rootPlaceId ?? hit.rootPlaceId,
    name: snap?.name ?? hit.name,
    creatorName: snap?.creatorName ?? hit.creatorName ?? "",
    iconUrl: snap?.iconUrl ?? known?.iconUrl ?? null,
    description: (snap?.description ?? "").replace(/\s+/g, " ").slice(0, 160),
    playerCount: ccu,
    maxPlayers: snap?.maxPlayers ?? 0,
    approvalPercentage: Math.round(approvalPct(up, down)),
    hiddenGemScore: gem.score,
    isHiddenGem: gem.isHiddenGem,
    similarity: Math.round(nameSim * 100) / 100,
    score: Math.round(score * 100) / 100,
    reason,
    inVault: opts.inVault,
    entryId: opts.entryId ?? null,
    tags,
  };
}

async function toCandidates(ranked: RankedCandidate[], { exclude, limit = 8 }: { exclude?: number; limit?: number } = {}): Promise<CandidateDTO[]> {
  const rows = ranked.filter((r) => r.hit.universeId !== exclude).slice(0, limit);
  const vaulted = vault.vaultedAmong(rows.map((r) => r.hit.universeId));
  return rows.map((r) => candidateFrom(r, { inVault: vaulted.has(r.hit.universeId) }));
}

/** Persist a candidate we already hydrated during ranking (saves a round of Roblox calls). */
async function persistRanked(r: RankedCandidate, caption?: string) {
  return r.snap ? upsertSnapshot(r.snap, { caption }) : getOrHydrateByUniverse(r.hit.universeId, { caption });
}

export async function ingest(req: IngestRequest): Promise<IngestResult | PickResult> {
  const vaultOpts = { status: req.status, replaceEntryId: req.replaceEntryId };

  // Direct picks (picker rows, "Not it?" chips, "Save to My Vault" on a Drop)
  if (req.universeId || req.placeId) {
    const game = req.universeId ? await getOrHydrateByUniverse(req.universeId, { caption: req.caption ?? undefined }) : await getOrHydrateByPlace(req.placeId!, { caption: req.caption ?? undefined });
    const { entry, alreadyVaulted } = await vaultGame(game.universeId, { ...vaultOpts, sourceUrl: req.sourceUrl, caption: req.caption });
    return { needsPick: false, kind: "direct", entry: toEntryDTO(entry), game: toGameDTO(game), alreadyVaulted, confidence: 1, method: "direct", candidates: [] };
  }

  const raw = (req.input ?? "").trim();
  if (!raw) throw new IngestError("Paste a Roblox link, a Reel/TikTok link, a caption, or a game name.", 400, "EMPTY");
  const ci = classifyInput(raw);

  /* a) Roblox URL — always exact ---------------------------------- */
  if (ci.kind === "roblox_url") {
    let placeId = ci.placeId ?? null;
    if (!placeId && ci.url && /ro\.blox\.com/i.test(ci.url)) placeId = await expandRobloxShortLink(ci.url);
    if (!placeId) throw new IngestError("Couldn't find a place ID in that Roblox link. Share links (roblox.com/share?code=…) need to be opened once in a browser to get the /games/ URL.", 422, "NO_PLACE_ID");
    const game = await getOrHydrateByPlace(placeId);
    const { entry, alreadyVaulted } = await vaultGame(game.universeId, { ...vaultOpts, sourceUrl: req.sourceUrl ?? null });
    return { needsPick: false, kind: ci.kind, entry: toEntryDTO(entry), game: toGameDTO(game), alreadyVaulted, confidence: 1, method: "place-id", candidates: [] };
  }

  /* b) Social URL / caption --------------------------------------- */
  let caption = req.caption ?? "";
  let sourceUrl: string | null = req.sourceUrl ?? null;
  let method = "";
  if (ci.kind === "social_url") {
    sourceUrl = ci.url!;
    const inlineText = raw.replace(ci.url!, "").trim();
    if (!caption) {
      const meta = await fetchSocialMeta(ci.url!, ci.platform);
      caption = [meta.caption, inlineText].filter(Boolean).join("\n");
      method = `social:${ci.platform}:${meta.method}`;
    }
    if (!caption.trim()) {
      throw new IngestError(
        ci.platform === "instagram"
          ? "Instagram hid this Reel's caption behind a login wall. Paste the caption (or the game name) along with the link and I'll take it from there."
          : "Couldn't read a caption from that link. Paste the caption or game name with it.",
        422,
        "NEED_CAPTION",
        { sourceUrl },
      );
    }
  } else if (ci.kind === "caption") {
    caption = raw;
    method = "caption";
  }

  let guesses: string[];
  let keywords: string[];
  let query: string;
  if (caption) {
    // A caption that already contains a Roblox link is the jackpot
    const linked = extractPlaceId(caption);
    if (linked) {
      const game = await getOrHydrateByPlace(linked, { caption });
      const { entry, alreadyVaulted } = await vaultGame(game.universeId, { ...vaultOpts, sourceUrl, caption });
      return { needsPick: false, kind: ci.kind, entry: toEntryDTO(entry), game: toGameDTO(game), alreadyVaulted, confidence: 0.98, method: `${method}+link`, candidates: [], captionUsed: caption };
    }
    const ex = await extractTitleCandidates(caption);
    if (!ex.candidates.length) throw new IngestError("Couldn't spot a game title in that caption. Try pasting just the game name.", 422, "NO_TITLE", { sourceUrl });
    guesses = ex.candidates;
    keywords = cleanSearchQuery(ex.candidates[0]).split(" ");
    query = ex.candidates[0];
    method = `${method}+${ex.method}`;
  } else {
    /* c) Fuzzy search ---------------------------------------------- */
    guesses = queryVariants(raw);
    keywords = cleanSearchQuery(raw).split(" ");
    query = raw;
    method = "search";
  }

  const ranked = await rankCandidates(guesses, keywords, ci.kind);
  if (!ranked.length) throw new IngestError(`Nothing on Roblox matched "${query}". Try fewer or different words.`, 404, "NO_MATCH", { sourceUrl });

  if (!isConfident(ranked, ci.kind)) {
    return { needsPick: true, kind: ci.kind, query, method, candidates: await toCandidates(ranked), sourceUrl, caption: caption || null };
  }

  const best = ranked[0];
  const game = await persistRanked(best, caption || undefined);
  const { entry, alreadyVaulted } = await vaultGame(game.universeId, { ...vaultOpts, sourceUrl, caption: caption || null });
  return {
    needsPick: false,
    kind: ci.kind,
    entry: toEntryDTO(entry),
    game: toGameDTO(game),
    alreadyVaulted,
    confidence: Math.round(best.nameSim * 100) / 100,
    method,
    candidates: await toCandidates(ranked, { exclude: best.hit.universeId, limit: 5 }),
    captionUsed: caption || undefined,
  };
}
