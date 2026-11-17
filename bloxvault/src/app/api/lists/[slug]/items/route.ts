import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { getOrHydrateByUniverse } from "@/lib/ingest";
import { toListDTO } from "@/lib/lists";
import { lists } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const Add = z.object({ universeId: z.coerce.number().int().positive(), blurb: z.string().max(500).default("") });

/** POST /api/lists/:slug/items — add a game to a Drop */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const { universeId, blurb } = Add.parse(await req.json());
    await getOrHydrateByUniverse(universeId); // make sure the Game row exists
    return ok({ list: toListDTO(lists.addItem(slug, universeId, blurb)) });
  } catch (err) {
    return fail(err);
  }
}

/** DELETE /api/lists/:slug/items?universeId=… */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const universeId = Number(new URL(req.url).searchParams.get("universeId"));
    return ok({ list: toListDTO(lists.removeItem(slug, universeId)) });
  } catch (err) {
    return fail(err);
  }
}
