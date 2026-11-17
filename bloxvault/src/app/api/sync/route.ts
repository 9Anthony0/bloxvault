import { fail, ok } from "@/lib/http";
import { syncStaleGames } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/sync — refresh stale telemetry (CCU, votes, art). Called on app load; cron-able. */
export async function POST() {
  try {
    return ok(await syncStaleGames());
  } catch (err) {
    return fail(err);
  }
}
