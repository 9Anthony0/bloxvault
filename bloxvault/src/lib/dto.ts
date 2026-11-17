// Client-safe DTO types + server-side serializers (BigInt → number; JSON strings → arrays).
import type { EntryRecord, GameRecord } from "./store";
import { partySizesFor, passesGemGates, type PartySize, type VaultStatus } from "./constants";

export interface TagDTO {
  slug: string;
  label: string;
  confidence: number;
  source: string;
}

export interface GameDTO {
  universeId: number;
  rootPlaceId: number;
  name: string;
  description: string;
  creatorName: string;
  genre: string | null;
  iconUrl: string | null;
  thumbnailUrls: string[];
  ccu: number;
  visits: number;
  maxPlayers: number;
  upVotes: number;
  downVotes: number;
  approvalPercentage: number;
  hiddenGemScore: number;
  isHiddenGem: boolean;
  partySizes: PartySize[];
  lastUpdated: string | null;
  lastSyncedAt: string | null;
  tags: TagDTO[];
}

export interface VaultEntryDTO {
  id: string;
  status: VaultStatus;
  starRating: number | null;
  p2wScore: number | null;
  grindScore: number | null;
  depthScore: number | null;
  notes: string;
  sourceUrl: string | null;
  sourceCaption: string | null;
  createdAt: string;
  updatedAt: string;
  lastPlayedOn: string | null;
  playCount: number;
  game: GameDTO;
}

export interface PlayLogDTO {
  id: string;
  playedOn: string;
  note: string;
}

export interface CandidateDTO {
  universeId: number;
  rootPlaceId: number;
  name: string;
  creatorName: string;
  iconUrl: string | null;
  description: string;
  playerCount: number;
  maxPlayers: number;
  approvalPercentage: number;
  hiddenGemScore: number;
  isHiddenGem: boolean;
  /** 0–1 title similarity to the query */
  similarity: number;
  /** 0–1 overall match score */
  score: number;
  /** Why it matched, e.g. 'Description mentions “bleach”' */
  reason: string | null;
  inVault: boolean;
  /** Vault entry id when inVault (lets search open it directly) */
  entryId?: string | null;
  /** Mechanic tags (stored for known games, inferred for fresh search hits) */
  tags?: { slug: string; label: string }[];
}

export function toGameDTO(g: GameRecord): GameDTO {
  return {
    universeId: g.universeId,
    rootPlaceId: g.rootPlaceId,
    name: g.name,
    description: g.description,
    creatorName: g.creatorName,
    genre: g.genre,
    iconUrl: g.iconUrl,
    thumbnailUrls: g.thumbnailUrls,
    ccu: g.ccu,
    visits: g.visits,
    maxPlayers: g.maxPlayers,
    upVotes: g.upVotes,
    downVotes: g.downVotes,
    approvalPercentage: g.approvalPercentage,
    hiddenGemScore: g.hiddenGemScore,
    isHiddenGem: g.lastSyncedAt !== null && passesGemGates(g),
    partySizes: partySizesFor(g.maxPlayers, g.tags.map((t) => t.slug)),
    lastUpdated: g.lastUpdated?.toISOString() ?? null,
    lastSyncedAt: g.lastSyncedAt?.toISOString() ?? null,
    tags: g.tags.map((t) => ({ slug: t.slug, label: t.label, confidence: t.confidence, source: t.source })),
  };
}

export function toEntryDTO(e: EntryRecord): VaultEntryDTO {
  return {
    id: e.id,
    status: e.status as VaultStatus,
    starRating: e.starRating,
    p2wScore: e.p2wScore,
    grindScore: e.grindScore,
    depthScore: e.depthScore,
    notes: e.notes,
    sourceUrl: e.sourceUrl,
    sourceCaption: e.sourceCaption,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    lastPlayedOn: e.lastPlayedOn,
    playCount: e.playCount,
    game: toGameDTO(e.game),
  };
}
