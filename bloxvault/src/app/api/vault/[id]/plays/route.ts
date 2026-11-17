import { z } from "zod";
import { toEntryDTO } from "@/lib/dto";
import { fail, ok } from "@/lib/http";
import { localToday } from "@/lib/format";
import { NotFoundError, plays, vault } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const Add = z.object({
  playedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().max(1000).default(""),
});

function respond(id: string) {
  const entry = vault.get(id);
  if (!entry) throw new NotFoundError(`Vault entry ${id} not found`);
  return ok({ entry: toEntryDTO(entry), logs: plays.list(id).map((l) => ({ id: l.id, playedOn: l.playedOn, note: l.note })) });
}

/** GET /api/vault/:id/plays — the play log for one game */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    return respond((await params).id);
  } catch (err) {
    return fail(err);
  }
}

/** POST /api/vault/:id/plays { playedOn?: "YYYY-MM-DD", note? } — log a session. A Play-Later game moves to Playing. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { playedOn, note } = Add.parse(await req.json());
    const entry = vault.get(id);
    if (!entry) throw new NotFoundError(`Vault entry ${id} not found`);
    plays.add(id, playedOn ?? localToday(), note); // the app runs on your machine, so server-local = your date
    if (entry.status === "VAULTED") vault.update(id, { status: "PLAYING" });
    return respond(id);
  } catch (err) {
    return fail(err);
  }
}

/** DELETE /api/vault/:id/plays?logId=… */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    plays.delete(id, new URL(req.url).searchParams.get("logId") ?? "");
    return respond(id);
  } catch (err) {
    return fail(err);
  }
}
