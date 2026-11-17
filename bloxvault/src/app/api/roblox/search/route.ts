import { fail, ok } from "@/lib/http";
import { searchGames } from "@/lib/roblox";
import { approvalPct } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/roblox/search?q=… — server-side proxy to Roblox omni-search. */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) return ok({ results: [] });
    const hits = await searchGames(q.slice(0, 100), 10);
    return ok({ results: hits.map((h) => ({ ...h, approvalPercentage: Math.round(approvalPct(h.upVotes, h.downVotes)) })) });
  } catch (err) {
    return fail(err);
  }
}
