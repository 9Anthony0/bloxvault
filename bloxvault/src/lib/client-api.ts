"use client";
import type { CandidateDTO, GameDTO, PlayLogDTO, VaultEntryDTO } from "./dto";
import type { ListDTO } from "./lists";
import type { VaultStatus } from "./constants";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code, data);
  return data as T;
}

export interface PickResponse {
  needsPick: true;
  kind: string;
  query: string;
  method: string;
  candidates: CandidateDTO[];
  sourceUrl: string | null;
  caption: string | null;
}

export interface IngestResponse {
  needsPick: false;
  kind: string;
  entry: VaultEntryDTO;
  game: GameDTO;
  alreadyVaulted: boolean;
  confidence: number;
  method: string;
  candidates: CandidateDTO[];
}

export interface RecommendationDTO {
  game: GameDTO;
  score: number;
  match: number;
  matchedTags: { slug: string; label: string }[];
  because: string[];
  why: string;
}

export type EntryPatch = Partial<Pick<VaultEntryDTO, "status" | "starRating" | "p2wScore" | "grindScore" | "depthScore" | "notes" | "sourceUrl">> & { tags?: string[] };

export interface ImportFavoritesResponse {
  user: { id: number; name: string; displayName: string };
  found: number;
  added: number;
  alreadyInVault: number;
  failed: number;
  addedNames: string[];
  demoRemoved: number;
}

export interface SearchResponse {
  query: string;
  phase: "fast" | "full";
  parsed: import("./vibe").ParsedQuery | null;
  vault: CandidateDTO[];
  results: CandidateDTO[];
}

export const api = {
  search: (q: string, phase: "fast" | "full", off: string[], signal?: AbortSignal) =>
    call<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&phase=${phase}${off.length ? `&off=${encodeURIComponent(off.join(","))}` : ""}`, { signal }),
  importFavorites: (body: { user: string; status: VaultStatus; clearDemo: boolean; max: number }) =>
    call<ImportFavoritesResponse>("/api/import/roblox-favorites", { method: "POST", body: JSON.stringify(body) }),
  ingest: (body: { input?: string; universeId?: number; placeId?: number; sourceUrl?: string | null; caption?: string | null; status?: VaultStatus; replaceEntryId?: string }) =>
    call<IngestResponse | PickResponse>("/api/ingest", { method: "POST", body: JSON.stringify(body) }),
  /** Direct save by id — always returns a saved entry */
  vaultById: (body: { universeId: number; sourceUrl?: string | null; caption?: string | null; replaceEntryId?: string }) =>
    call<IngestResponse>("/api/ingest", { method: "POST", body: JSON.stringify(body) }),
  vault: () => call<{ entries: VaultEntryDTO[]; tagFacets: { slug: string; label: string; count: number }[] }>("/api/vault"),
  patchEntry: (id: string, patch: EntryPatch) => call<{ entry: VaultEntryDTO }>(`/api/vault/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteEntry: (id: string) => call<{ deleted: string }>(`/api/vault/${id}`, { method: "DELETE" }),
  recommendations: () => call<{ items: RecommendationDTO[]; seeds: string[]; topTags: string[] }>("/api/recommendations"),
  digDeeper: () => call<{ added: number; items: RecommendationDTO[]; seeds: string[]; topTags: string[] }>("/api/recommendations", { method: "POST" }),
  plays: (id: string) => call<{ entry: VaultEntryDTO; logs: PlayLogDTO[] }>(`/api/vault/${id}/plays`),
  logPlay: (id: string, playedOn: string, note = "") => call<{ entry: VaultEntryDTO; logs: PlayLogDTO[] }>(`/api/vault/${id}/plays`, { method: "POST", body: JSON.stringify({ playedOn, note }) }),
  deletePlay: (id: string, logId: string) => call<{ entry: VaultEntryDTO; logs: PlayLogDTO[] }>(`/api/vault/${id}/plays?logId=${encodeURIComponent(logId)}`, { method: "DELETE" }),
  bulk: (body: { action: "status"; ids: string[]; status: VaultStatus } | { action: "remove"; ids: string[] } | { action: "drop"; ids: string[]; slug?: string; newTitle?: string }) =>
    call<{ updated?: number; removed?: number; added?: number; slug?: string }>("/api/vault/bulk", { method: "POST", body: JSON.stringify(body) }),
  dismiss: (universeId: number, undo = false) => call<{ universeId: number; dismissed: boolean }>("/api/recommendations/dismiss", { method: "POST", body: JSON.stringify({ universeId, undo }) }),
  sync: () => call<{ refreshed: number }>("/api/sync", { method: "POST" }),
  lists: () => call<{ lists: ListDTO[] }>("/api/lists"),
  createList: (title: string, description = "", universeIds: number[] = []) => call<{ list: ListDTO }>("/api/lists", { method: "POST", body: JSON.stringify({ title, description, universeIds }) }),
  addToList: (slug: string, universeId: number, blurb = "") => call<{ list: ListDTO }>(`/api/lists/${slug}/items`, { method: "POST", body: JSON.stringify({ universeId, blurb }) }),
};
