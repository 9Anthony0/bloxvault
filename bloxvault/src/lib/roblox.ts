import "server-only";

/**
 * Roblox API service — SERVER ONLY.
 * Roblox's public web APIs reject browser CORS, so every call here runs inside
 * Next.js Route Handlers / server code. No deprecated api.roblox.com endpoints.
 *
 * Resolution chain:
 *   placeId ──(apis.roblox.com/universes/v1/places/{id}/universe)──▶ universeId
 *   universeId ──▶ games.roblox.com/v1/games            (meta + live CCU)
 *              ──▶ games.roblox.com/v1/games/votes      (likes / dislikes)
 *              ──▶ thumbnails.roblox.com/v1/games/icons (512² icon)
 *              ──▶ thumbnails.roblox.com/v1/games/multiget/thumbnails (768×432 ×3)
 * All batched endpoints accept comma-separated universeIds, so hydration of N games
 * costs 4 requests total (plus one resolve per unknown placeId).
 */

const UA = "BloxVault/0.1 (+https://github.com/bloxvault)";
const BATCH = 50;

export class RobloxApiError extends Error {
  constructor(message: string, public status?: number, public url?: string) {
    super(message);
    this.name = "RobloxApiError";
  }
}

async function robloxFetch<T>(url: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": UA, ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 3) {
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        await sleep(Math.max(retryAfter * 1000, 400 * 2 ** attempt + Math.random() * 200));
        return robloxFetch<T>(url, init, attempt + 1);
      }
    }
    if (!res.ok) throw new RobloxApiError(`Roblox API ${res.status} for ${new URL(url).pathname}`, res.status, url);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof RobloxApiError) throw err;
    if (attempt < 2) {
      await sleep(300 * 2 ** attempt);
      return robloxFetch<T>(url, init, attempt + 1);
    }
    throw new RobloxApiError(`Network error calling Roblox: ${(err as Error).message}`, undefined, url);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/* ------------------------------------------------------------------ */
/* URL parsing                                                          */
/* ------------------------------------------------------------------ */

const PLACE_PATTERNS = [
  /roblox\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/(\d{3,})/i, // /games/123/name, /es/games/123
  /roblox\.com\/games\/start\?[^ ]*placeId=(\d{3,})/i, // /games/start?placeId=123
  /roblox:\/\/[^\s]*?placeId=(\d{3,})/i, // roblox://placeId=123, roblox://experiences/start?placeId=123
  /[?&]placeId=(\d{3,})/i, // other deep links
];

export function extractPlaceId(text: string): number | null {
  for (const re of PLACE_PATTERNS) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

export function isRobloxUrl(text: string) {
  return /(^|\s|\/\/)(www\.|web\.)?(roblox\.com|ro\.blox\.com)\//i.test(text) || /^roblox:\/\//i.test(text);
}

/** ro.blox.com short links 30x-redirect to the full games URL. Follow manually. */
export async function expandRobloxShortLink(url: string): Promise<number | null> {
  try {
    let current = url;
    for (let i = 0; i < 4; i++) {
      const res = await fetch(current, { redirect: "manual", headers: { "User-Agent": UA } });
      const loc = res.headers.get("location");
      const direct = extractPlaceId(current);
      if (direct) return direct;
      if (!loc) {
        // Some short links render an HTML page with the target in a meta refresh / og:url
        const html = await res.text().catch(() => "");
        return extractPlaceId(html);
      }
      current = new URL(loc, current).toString();
    }
    return extractPlaceId(current);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Raw endpoint wrappers                                                */
/* ------------------------------------------------------------------ */

export async function resolveUniverseId(placeId: number): Promise<number> {
  const data = await robloxFetch<{ universeId: number | null }>(
    `https://apis.roblox.com/universes/v1/places/${placeId}/universe`,
  );
  if (!data.universeId) throw new RobloxApiError(`No universe found for place ${placeId}`, 404);
  return data.universeId;
}

interface RawGame {
  id: number;
  rootPlaceId: number;
  name: string;
  description: string | null;
  creator: { id: number; name: string; type: "User" | "Group"; hasVerifiedBadge?: boolean };
  playing: number;
  visits: number;
  maxPlayers: number;
  created: string;
  updated: string;
  genre?: string;
  genre_l1?: string;
  genre_l2?: string;
}

export async function fetchGames(universeIds: number[]): Promise<RawGame[]> {
  const out: RawGame[] = [];
  for (const ids of chunk(universeIds, BATCH)) {
    const r = await robloxFetch<{ data: RawGame[] }>(`https://games.roblox.com/v1/games?universeIds=${ids.join(",")}`);
    out.push(...r.data);
  }
  return out;
}

export async function fetchVotes(universeIds: number[]) {
  const out = new Map<number, { upVotes: number; downVotes: number }>();
  for (const ids of chunk(universeIds, BATCH)) {
    const r = await robloxFetch<{ data: { id: number; upVotes: number; downVotes: number }[] }>(
      `https://games.roblox.com/v1/games/votes?universeIds=${ids.join(",")}`,
    );
    for (const v of r.data) out.set(v.id, { upVotes: v.upVotes, downVotes: v.downVotes });
  }
  return out;
}

export async function fetchIcons(universeIds: number[]) {
  const out = new Map<number, string>();
  for (const ids of chunk(universeIds, BATCH)) {
    const r = await robloxFetch<{ data: { targetId: number; state: string; imageUrl: string | null }[] }>(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids.join(",")}&size=512x512&format=Png&isCircular=false`,
    );
    for (const d of r.data) if (d.imageUrl && d.state === "Completed") out.set(d.targetId, d.imageUrl);
  }
  return out;
}

export async function fetchThumbnails(universeIds: number[], countPerUniverse = 3) {
  const out = new Map<number, string[]>();
  for (const ids of chunk(universeIds, BATCH)) {
    const r = await robloxFetch<{
      data: { universeId: number; error: unknown; thumbnails: { state: string; imageUrl: string | null }[] }[];
    }>(
      `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids.join(",")}&countPerUniverse=${countPerUniverse}&defaults=true&size=768x432&format=Png&isCircular=false`,
    );
    for (const d of r.data) {
      out.set(
        d.universeId,
        d.thumbnails.filter((t) => t.state === "Completed" && t.imageUrl).map((t) => t.imageUrl!) ?? [],
      );
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* High-level hydration                                                 */
/* ------------------------------------------------------------------ */

export interface RobloxGameSnapshot {
  universeId: number;
  rootPlaceId: number;
  name: string;
  description: string;
  creatorName: string;
  creatorType: "User" | "Group";
  genre: string | null;
  subgenre: string | null;
  iconUrl: string | null;
  thumbnailUrls: string[];
  ccu: number;
  visits: number;
  maxPlayers: number;
  upVotes: number;
  downVotes: number;
  lastUpdated: Date;
  created: Date;
}

/** Fetch everything about N universes in 4 batched calls. Thumbnail failures are non-fatal. */
export async function hydrateUniverses(universeIds: number[]): Promise<RobloxGameSnapshot[]> {
  if (universeIds.length === 0) return [];
  const [games, votes, icons, thumbs] = await Promise.all([
    fetchGames(universeIds),
    fetchVotes(universeIds).catch(() => new Map<number, { upVotes: number; downVotes: number }>()),
    fetchIcons(universeIds).catch(() => new Map<number, string>()),
    fetchThumbnails(universeIds).catch(() => new Map<number, string[]>()),
  ]);
  return games.map((g) => {
    const v = votes.get(g.id) ?? { upVotes: 0, downVotes: 0 };
    return {
      universeId: g.id,
      rootPlaceId: g.rootPlaceId,
      name: g.name,
      description: g.description ?? "",
      creatorName: g.creator?.name ?? "",
      creatorType: g.creator?.type ?? "User",
      genre: g.genre_l1 || (g.genre && g.genre !== "All" ? g.genre : null),
      subgenre: g.genre_l2 || null,
      iconUrl: icons.get(g.id) ?? null,
      thumbnailUrls: thumbs.get(g.id) ?? [],
      ccu: g.playing ?? 0,
      visits: g.visits ?? 0,
      maxPlayers: g.maxPlayers ?? 0,
      upVotes: v.upVotes,
      downVotes: v.downVotes,
      lastUpdated: new Date(g.updated),
      created: new Date(g.created),
    };
  });
}

export async function hydratePlace(placeId: number): Promise<RobloxGameSnapshot> {
  const universeId = await resolveUniverseId(placeId);
  const [snap] = await hydrateUniverses([universeId]);
  if (!snap) throw new RobloxApiError(`Universe ${universeId} returned no game data`, 404);
  return snap;
}

/* ------------------------------------------------------------------ */
/* Search                                                               */
/* ------------------------------------------------------------------ */

export interface SearchHit {
  universeId: number;
  rootPlaceId: number;
  name: string;
  playerCount: number;
  upVotes: number;
  downVotes: number;
  creatorName?: string;
}

/**
 * Roblox omni-search (the endpoint the roblox.com search page uses). Unauthenticated,
 * but undocumented — parsed defensively; callers fall back to local DB search on failure.
 */
export async function searchGames(query: string, limit = 8): Promise<SearchHit[]> {
  const sessionId = crypto.randomUUID();
  const url = `https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&sessionId=${sessionId}&pageType=all`;
  const data = await robloxFetch<{ searchResults?: { contentGroupType?: string; contents?: Record<string, unknown>[] }[] }>(url);
  const hits: SearchHit[] = [];
  for (const group of data.searchResults ?? []) {
    if (group.contentGroupType && group.contentGroupType !== "Game") continue;
    for (const c of group.contents ?? []) {
      const universeId = Number(c.universeId ?? c.contentId);
      const rootPlaceId = Number(c.rootPlaceId);
      if (!universeId || !rootPlaceId) continue;
      hits.push({
        universeId,
        rootPlaceId,
        name: String(c.name ?? ""),
        playerCount: Number(c.playerCount ?? 0),
        upVotes: Number(c.totalUpVotes ?? 0),
        downVotes: Number(c.totalDownVotes ?? 0),
        creatorName: c.creatorName ? String(c.creatorName) : undefined,
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* Users & favorites                                                    */
/* ------------------------------------------------------------------ */

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
}

/** Accepts a username, a numeric user ID, or a roblox.com/users/{id}/profile URL. */
export async function resolveRobloxUser(input: string): Promise<RobloxUser> {
  const text = input.trim().replace(/^@/, "");
  const idMatch = text.match(/roblox\.com\/(?:[a-z]{2}\/)?users\/(\d+)/i) ?? text.match(/^(\d{1,15})$/);
  if (idMatch) {
    const u = await robloxFetch<{ id: number; name: string; displayName: string }>(`https://users.roblox.com/v1/users/${idMatch[1]}`);
    return { id: u.id, name: u.name, displayName: u.displayName };
  }
  const r = await robloxFetch<{ data: { id: number; name: string; displayName: string }[] }>("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [text], excludeBannedUsers: true }),
  });
  const u = r.data[0];
  if (!u) throw new RobloxApiError(`No Roblox user named "${text}"`, 404);
  return { id: u.id, name: u.name, displayName: u.displayName };
}

/**
 * A user's favorited experiences (public endpoint; respects the user's privacy settings).
 * Pages of 50 until `max`. Returns universe IDs in Roblox's order (most recent favorites first).
 */
export async function fetchFavoriteGames(userId: number, max = 200): Promise<{ universeId: number; rootPlaceId: number; name: string }[]> {
  const out: { universeId: number; rootPlaceId: number; name: string }[] = [];
  let cursor = "";
  do {
    const r = await robloxFetch<{ data: { id: number; name: string; rootPlace?: { id: number } }[]; nextPageCursor: string | null }>(
      `https://games.roblox.com/v2/users/${userId}/favorite/games?accessFilter=2&limit=50&sortOrder=Desc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    for (const g of r.data) out.push({ universeId: g.id, rootPlaceId: g.rootPlace?.id ?? 0, name: g.name });
    cursor = r.nextPageCursor ?? "";
  } while (cursor && out.length < max);
  return out.slice(0, max);
}

/**
 * Roblox's own "similar experiences" for a universe. Undocumented response shape;
 * parsed defensively and allowed to fail (callers fall back to tag search).
 */
export async function fetchSimilarGames(universeId: number, limit = 12): Promise<SearchHit[]> {
  const r = await robloxFetch<{ games?: Record<string, unknown>[] }>(
    `https://games.roblox.com/v1/games/recommendations/game/${universeId}?maxRows=${limit}`,
  );
  return (r.games ?? [])
    .map((g) => ({
      universeId: Number(g.universeId),
      rootPlaceId: Number(g.placeId ?? g.rootPlaceId),
      name: String(g.name ?? ""),
      playerCount: Number(g.playerCount ?? 0),
      upVotes: Number(g.totalUpVotes ?? 0),
      downVotes: Number(g.totalDownVotes ?? 0),
    }))
    .filter((g) => g.universeId && g.rootPlaceId);
}
