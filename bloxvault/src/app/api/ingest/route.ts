import { z } from "zod";
import { VAULT_STATUSES } from "@/lib/constants";
import { fail, ok } from "@/lib/http";
import { ingest } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    input: z.string().max(5000).optional(),
    universeId: z.coerce.number().int().positive().optional(),
    placeId: z.coerce.number().int().positive().optional(),
    sourceUrl: z.string().url().max(2000).nullish(),
    caption: z.string().max(5000).nullish(),
    status: z.enum(VAULT_STATUSES).optional(),
    replaceEntryId: z.string().optional(),
  })
  .refine((b) => b.input || b.universeId || b.placeId, { message: "Provide input, universeId, or placeId" });

/**
 * POST /api/ingest
 *   { input: "https://www.roblox.com/games/4111023553/Deepwoken" }
 *   { input: "https://www.instagram.com/reel/XYZ/" }
 *   { input: "that parry combat game deepwoken style" }   → { needsPick: true, candidates } unless it's a clear title match
 *   { universeId: 123, replaceEntryId: "…" }   // "Not it?" candidate swap
 */
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const result = await ingest(body);
    return ok(result, { status: result.needsPick || result.alreadyVaulted ? 200 : 201 });
  } catch (err) {
    return fail(err);
  }
}
