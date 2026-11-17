import { z } from "zod";
import { VAULT_STATUSES } from "@/lib/constants";
import { toEntryDTO } from "@/lib/dto";
import { fail, ok } from "@/lib/http";
import { setGameTags } from "@/lib/ingest";
import { tags as tagStore, vault } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sub = z.number().int().min(1).max(5).nullable();
const Patch = z.object({
  status: z.enum(VAULT_STATUSES).optional(),
  starRating: z
    .number()
    .min(0.5)
    .max(5)
    .refine((v) => Number.isInteger(v * 2), "Half-star increments only")
    .nullable()
    .optional(),
  p2wScore: sub.optional(),
  grindScore: sub.optional(),
  depthScore: sub.optional(),
  notes: z.string().max(10_000).optional(),
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  /** Replace the game's tags with user-curated ones */
  tags: z.array(z.string()).max(8).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { tags, ...data } = Patch.parse(await req.json());
    let entry = vault.update(id, data);
    if (tags) {
      tagStore.clear(entry.gameUniverseId);
      await setGameTags(entry.gameUniverseId, tags.map((slug) => ({ slug, confidence: 1, source: "user" })));
      entry = vault.get(id)!;
    }
    return ok({ entry: toEntryDTO(entry) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    vault.delete(id);
    return ok({ deleted: id });
  } catch (err) {
    return fail(err);
  }
}
