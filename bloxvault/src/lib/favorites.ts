import "server-only";
import { games, lists, vault } from "./store";
import { DEMO_DROP_SLUG, DEMO_PLACE_IDS, type VaultStatus } from "./constants";
import { upsertSnapshot } from "./ingest";
import { fetchFavoriteGames, hydrateUniverses, resolveRobloxUser } from "./roblox";

export interface ImportSummary {
  user: { id: number; name: string; displayName: string };
  found: number;
  added: number;
  alreadyInVault: number;
  failed: number;
  addedNames: string[];
}

/** Run async work with bounded concurrency (tagging may call an LLM per game). */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/**
 * Import a Roblox user's favorited games into the vault.
 * - Hydration is batched (4 Roblox calls per 50 games).
 * - Games already in the vault keep their status/rating; only new ones are added.
 * - Default status LOVED, because favoriting is a strong taste signal for the Taste Graph.
 */
export async function importRobloxFavorites(input: string, status: VaultStatus = "LOVED", max = 200): Promise<ImportSummary> {
  const user = await resolveRobloxUser(input);
  const favs = await fetchFavoriteGames(user.id, max);
  const summary: ImportSummary = { user, found: favs.length, added: 0, alreadyInVault: 0, failed: 0, addedNames: [] };
  if (!favs.length) return summary;

  const snaps = await hydrateUniverses(favs.map((f) => f.universeId));
  const byId = new Map(snaps.map((s) => [s.universeId, s]));
  const sourceUrl = `https://www.roblox.com/users/${user.id}/favorites`;

  await pool(favs, 4, async (f) => {
    const snap = byId.get(f.universeId);
    if (!snap) {
      summary.failed++;
      return;
    }
    try {
      const game = await upsertSnapshot(snap);
      const existing = vault.getByGame(game.universeId);
      if (existing) {
        summary.alreadyInVault++;
        return;
      }
      vault.create(game.universeId, { status, sourceUrl, sourceCaption: `Favorited on Roblox by @${user.name}` });
      summary.added++;
      summary.addedNames.push(game.name);
    } catch (e) {
      console.warn(`[favorites] ${f.name}:`, (e as Error).message);
      summary.failed++;
    }
  });
  return summary;
}

/** Remove the seeded demo games (and their vault entries, tags, Drop items) so they stop steering recommendations. */
export async function removeDemoData() {
  try {
    lists.delete(DEMO_DROP_SLUG);
  } catch {
    /* already gone */
  }
  return games.deleteByRootPlaceIds(DEMO_PLACE_IDS);
}
