import { fail, ok } from "@/lib/http";
import { expandCandidatePool, recommend } from "@/lib/recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/recommendations?limit=12 — Taste Graph results from the local game pool. */
export async function GET(req: Request) {
  try {
    const limit = Math.min(30, Number(new URL(req.url).searchParams.get("limit") ?? 12));
    return ok(await recommend({ limit }));
  } catch (err) {
    return fail(err);
  }
}

/** POST /api/recommendations — "Dig deeper": pull new candidates from Roblox for your top mechanics. */
export async function POST() {
  try {
    const expanded = await expandCandidatePool();
    return ok({ ...expanded, ...(await recommend({ limit: 12 })) });
  } catch (err) {
    return fail(err);
  }
}
