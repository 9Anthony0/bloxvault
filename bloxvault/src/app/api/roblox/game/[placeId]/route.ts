import { fail, ok } from "@/lib/http";
import { toGameDTO } from "@/lib/dto";
import { getOrHydrateByPlace } from "@/lib/ingest";
import { computeHiddenGem } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/roblox/game/:placeId[?force=1] — resolve + hydrate + cache, without vaulting. */
export async function GET(req: Request, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const id = Number(placeId);
    if (!Number.isSafeInteger(id) || id <= 0) return ok({ error: "Invalid placeId" }, { status: 400 });
    const force = new URL(req.url).searchParams.get("force") === "1";
    const game = await getOrHydrateByPlace(id, { force });
    const gem = computeHiddenGem({ upVotes: game.upVotes, downVotes: game.downVotes, ccu: game.ccu, lastUpdated: game.lastUpdated });
    return ok({ game: toGameDTO(game), gemBreakdown: gem });
  } catch (err) {
    return fail(err);
  }
}
