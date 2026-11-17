import { z } from "zod";
import { VAULT_STATUSES } from "@/lib/constants";
import { importRobloxFavorites, removeDemoData } from "@/lib/favorites";
import { fail, ok } from "@/lib/http";
import { RobloxApiError } from "@/lib/roblox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  user: z.string().min(1).max(200), // username, user ID, or profile URL
  status: z.enum(VAULT_STATUSES).default("LOVED"),
  max: z.number().int().min(1).max(500).default(200),
  /** Delete the 8 seeded demo games first */
  clearDemo: z.boolean().default(false),
});

/** POST /api/import/roblox-favorites  { user: "builderman", status: "LOVED" } */
export async function POST(req: Request) {
  try {
    const { user, status, max, clearDemo } = Body.parse(await req.json());
    const demoRemoved = clearDemo ? await removeDemoData() : 0;
    return ok({ ...(await importRobloxFavorites(user, status, max)), demoRemoved });
  } catch (err) {
    if (err instanceof RobloxApiError && (err.status === 403 || err.status === 401)) {
      return ok({ error: "That account's favorites are private. On Roblox: Settings → Privacy → set who can see your inventory to Everyone, then try again.", code: "PRIVATE" }, { status: 403 });
    }
    return fail(err);
  }
}
