import { fail, ok } from "@/lib/http";
import { searchFast, searchFull } from "@/lib/search";
import type { FilterKey } from "@/lib/vibe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=co-op+horror+under+500&phase=fast|full&off=maxCcu,tag:co-op
 * Read-only: never saves anything. Saving happens via POST /api/ingest { universeId }.
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const q = (u.searchParams.get("q") ?? "").trim().slice(0, 120);
    if (q.length < 2) return ok({ query: q, phase: "fast", vault: [], results: [], parsed: null });
    const off = (u.searchParams.get("off") ?? "").split(",").filter(Boolean) as FilterKey[];
    return ok(u.searchParams.get("phase") === "full" ? await searchFull(q, off) : await searchFast(q, off));
  } catch (err) {
    return fail(err);
  }
}
