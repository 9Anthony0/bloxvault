import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { dismissed } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ universeId: z.coerce.number().int().positive(), undo: z.boolean().default(false) });

/** POST /api/recommendations/dismiss { universeId, undo? } — "Not interested" */
export async function POST(req: Request) {
  try {
    const { universeId, undo } = Body.parse(await req.json());
    if (undo) dismissed.remove(universeId);
    else dismissed.add(universeId);
    return ok({ universeId, dismissed: !undo });
  } catch (err) {
    return fail(err);
  }
}
