import { z } from "zod";
import { VAULT_STATUSES } from "@/lib/constants";
import { fail, ok } from "@/lib/http";
import { lists, transaction, vault } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), ids: z.array(z.string()).min(1).max(1000), status: z.enum(VAULT_STATUSES) }),
  z.object({ action: z.literal("remove"), ids: z.array(z.string()).min(1).max(1000) }),
  z.object({ action: z.literal("drop"), ids: z.array(z.string()).min(1).max(1000), slug: z.string().optional(), newTitle: z.string().min(3).max(120).optional() }),
]);

/** POST /api/vault/bulk — act on many vault entries at once */
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const entries = body.ids.map((id) => vault.get(id)).filter((e) => e !== null);
    if (body.action === "status") {
      transaction(() => entries.forEach((e) => vault.update(e.id, { status: body.status })));
      return ok({ updated: entries.length });
    }
    if (body.action === "remove") {
      transaction(() => entries.forEach((e) => vault.delete(e.id)));
      return ok({ removed: entries.length });
    }
    let slug = body.slug;
    if (!slug && body.newTitle) {
      slug = `${body.newTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "drop"}-${Math.random().toString(36).slice(2, 7)}`;
      lists.create({ slug, title: body.newTitle });
    }
    if (!slug) return ok({ error: "Choose a Drop or give a new title" }, { status: 400 });
    for (const e of entries) lists.addItem(slug, e.gameUniverseId);
    return ok({ added: entries.length, slug });
  } catch (err) {
    return fail(err);
  }
}
