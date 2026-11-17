import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { IngestError } from "./ingest";
import { RobloxApiError } from "./roblox";
import { NotFoundError } from "./store";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(err: unknown) {
  if (err instanceof IngestError) return NextResponse.json({ error: err.message, code: err.code, ...err.extra }, { status: err.status });
  if (err instanceof NotFoundError) return NextResponse.json({ error: err.message, code: "NOT_FOUND" }, { status: 404 });
  if (err instanceof ZodError) return NextResponse.json({ error: "Invalid request", code: "BAD_REQUEST", issues: err.issues }, { status: 400 });
  if (err instanceof RobloxApiError) {
    const status = err.status === 404 ? 404 : err.status === 429 ? 429 : 502;
    return NextResponse.json({ error: err.status === 429 ? "Roblox is rate-limiting us — try again in a few seconds." : err.message, code: "ROBLOX_API" }, { status });
  }
  console.error(err);
  return NextResponse.json({ error: (err as Error)?.message ?? "Unexpected error", code: "INTERNAL" }, { status: 500 });
}
