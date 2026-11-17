import { fail, ok } from "@/lib/http";
import { toListDTO } from "@/lib/lists";
import { lists } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    const list = lists.bySlug(slug);
    if (!list) return ok({ error: "Not found" }, { status: 404 });
    return ok({ list: toListDTO(list) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { slug } = await params;
    lists.delete(slug);
    return ok({ deleted: slug });
  } catch (err) {
    return fail(err);
  }
}
