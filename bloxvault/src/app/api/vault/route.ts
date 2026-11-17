import { toEntryDTO } from "@/lib/dto";
import { fail, ok } from "@/lib/http";
import { vault } from "@/lib/store";
import { ensureTaggerVersion } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/vault — every entry, newest first, plus tag facets.
 * Filtering happens client-side for instant slider feedback; a personal vault is
 * hundreds of rows at most.
 */
export async function GET() {
  try {
    ensureTaggerVersion(); // one-time rebuild of auto-tags after a tagger upgrade
    const entries = vault.list().map(toEntryDTO);
    const facetMap = new Map<string, { slug: string; label: string; count: number }>();
    for (const e of entries)
      for (const t of e.game.tags) {
        const f = facetMap.get(t.slug) ?? { slug: t.slug, label: t.label, count: 0 };
        f.count++;
        facetMap.set(t.slug, f);
      }
    return ok({ entries, tagFacets: [...facetMap.values()].sort((a, b) => b.count - a.count) });
  } catch (err) {
    return fail(err);
  }
}
