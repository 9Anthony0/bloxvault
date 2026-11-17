import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { toListDTO } from "@/lib/lists";
import { getOrHydrateByUniverse } from "@/lib/ingest";
import { lists } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ lists: lists.all().map(toListDTO) });
  } catch (err) {
    return fail(err);
  }
}

const Create = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).default(""),
  universeIds: z.array(z.coerce.number().int().positive()).max(100).default([]),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function POST(req: Request) {
  try {
    const body = Create.parse(await req.json());
    const base = slugify(body.title) || "drop";
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    for (const id of body.universeIds) await getOrHydrateByUniverse(id); // make sure Game rows exist
    const list = lists.create({ slug, title: body.title, description: body.description, items: body.universeIds.map((universeId) => ({ universeId })) });
    return ok({ list: toListDTO(list) }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
