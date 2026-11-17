import "server-only";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * BloxVault data layer on Node's built-in SQLite (node:sqlite, Node ≥ 22.13).
 * Zero native modules, zero downloaded engines: works on locked-down networks.
 * The schema is created on first open; the file lives at ./data/bloxvault.db
 * (override with BLOXVAULT_DB=/path/to/file.db).
 *
 * To move to Postgres later, re-implement the functions in this file — nothing
 * else in the app talks to the database directly.
 */

/* ------------------------------------------------------------------ */
/* Connection + schema                                                  */
/* ------------------------------------------------------------------ */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
  universe_id         INTEGER PRIMARY KEY,
  root_place_id       INTEGER NOT NULL,
  name                TEXT    NOT NULL,
  description         TEXT    NOT NULL DEFAULT '',
  creator_name        TEXT    NOT NULL DEFAULT '',
  creator_type        TEXT    NOT NULL DEFAULT 'User',
  genre               TEXT,
  icon_url            TEXT,
  thumbnail_urls      TEXT    NOT NULL DEFAULT '[]',   -- JSON string[]
  ccu                 INTEGER NOT NULL DEFAULT 0,
  visits              INTEGER NOT NULL DEFAULT 0,
  max_players         INTEGER NOT NULL DEFAULT 0,
  up_votes            INTEGER NOT NULL DEFAULT 0,
  down_votes          INTEGER NOT NULL DEFAULT 0,
  approval_percentage REAL    NOT NULL DEFAULT 0,      -- 0–100
  hidden_gem_score    REAL    NOT NULL DEFAULT 0,      -- 0–100
  last_updated        TEXT,                            -- Roblox "updated" (ISO)
  last_synced_at      TEXT,                            -- our last telemetry pull (ISO)
  created_at          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS games_root_place ON games(root_place_id);
CREATE INDEX IF NOT EXISTS games_gem ON games(hidden_gem_score);

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  slug  TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_tags (
  game_universe_id INTEGER NOT NULL REFERENCES games(universe_id) ON DELETE CASCADE,
  tag_id           INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  confidence       REAL    NOT NULL DEFAULT 1,
  source           TEXT    NOT NULL DEFAULT 'heuristic', -- heuristic | llm | user | seed
  PRIMARY KEY (game_universe_id, tag_id)
);
CREATE INDEX IF NOT EXISTS game_tags_tag ON game_tags(tag_id);

CREATE TABLE IF NOT EXISTS vault_entries (
  id               TEXT PRIMARY KEY,
  game_universe_id INTEGER NOT NULL UNIQUE REFERENCES games(universe_id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'VAULTED',      -- VAULTED | PLAYING | LOVED | BEATEN | DROPPED
  star_rating      REAL,                                 -- 0.5–5.0
  p2w_score        INTEGER,                              -- 1–5
  grind_score      INTEGER,                              -- 1–5
  depth_score      INTEGER,                              -- 1–5
  notes            TEXT NOT NULL DEFAULT '',
  source_url       TEXT,
  source_caption   TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vault_status ON vault_entries(status);

CREATE TABLE IF NOT EXISTS curated_lists (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT 'You',
  is_public   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS curated_list_items (
  id               TEXT PRIMARY KEY,
  list_id          TEXT    NOT NULL REFERENCES curated_lists(id) ON DELETE CASCADE,
  game_universe_id INTEGER NOT NULL REFERENCES games(universe_id) ON DELETE CASCADE,
  position         INTEGER NOT NULL DEFAULT 0,
  blurb            TEXT    NOT NULL DEFAULT '',
  UNIQUE (list_id, game_universe_id)
);
CREATE INDEX IF NOT EXISTS list_items_pos ON curated_list_items(list_id, position);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function dbPath() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.BLOXVAULT_DB || path.join(process.cwd(), "data", "bloxvault.db"));
}

const g = globalThis as unknown as { __bvdb?: DatabaseSync };

/**
 * Additive migrations for databases created by older versions. Each runs once (tracked in meta.schema_version).
 * New installs get the full SCHEMA and then run these too, so each must be idempotent-safe.
 */
const MIGRATIONS: ((c: DatabaseSync) => void)[] = [
  // v1: games.subgenre (Roblox genre_l2)
  (c) => addColumn(c, "games", "subgenre", "TEXT"),
  // v2: play log, dismissed recommendations
  (c) =>
    c.exec(`
      CREATE TABLE IF NOT EXISTS play_logs (
        id         TEXT PRIMARY KEY,
        entry_id   TEXT NOT NULL REFERENCES vault_entries(id) ON DELETE CASCADE,
        played_on  TEXT NOT NULL,          -- YYYY-MM-DD
        note       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS play_logs_entry ON play_logs(entry_id, played_on);
      CREATE TABLE IF NOT EXISTS dismissed (
        universe_id INTEGER PRIMARY KEY,
        created_at  TEXT NOT NULL
      );`),
];

function addColumn(c: DatabaseSync, table: string, col: string, type: string) {
  const cols = (c.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((r) => r.name);
  if (!cols.includes(col)) c.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}

export function db(): DatabaseSync {
  if (!g.__bvdb) {
    const file = dbPath();
    mkdirSync(path.dirname(file), { recursive: true });
    const conn = new DatabaseSync(file);
    conn.exec(SCHEMA);
    const v = Number((conn.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get() as { value?: string } | undefined)?.value ?? 0);
    for (let i = v; i < MIGRATIONS.length; i++) MIGRATIONS[i](conn);
    conn.prepare(`INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(String(MIGRATIONS.length));
    g.__bvdb = conn;
  }
  return g.__bvdb;
}

export const meta = {
  get(key: string): string | null {
    const r = db().prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value: string } | undefined;
    return r?.value ?? null;
  },
  set(key: string, value: string) {
    db().prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  },
};

type Row = Record<string, SQLInputValue>;
const all = (sql: string, ...p: SQLInputValue[]) => db().prepare(sql).all(...p) as Row[];
const get = (sql: string, ...p: SQLInputValue[]) => db().prepare(sql).get(...p) as Row | undefined;
const run = (sql: string, ...p: SQLInputValue[]) => db().prepare(sql).run(...p);
const now = () => new Date().toISOString();
const qs = (n: number) => Array(n).fill("?").join(",");

export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Records                                                              */
/* ------------------------------------------------------------------ */

export interface TagLink {
  slug: string;
  label: string;
  confidence: number;
  source: string;
}

export interface GameRecord {
  universeId: number;
  rootPlaceId: number;
  name: string;
  description: string;
  creatorName: string;
  creatorType: string;
  genre: string | null;
  subgenre: string | null;
  iconUrl: string | null;
  thumbnailUrls: string[];
  ccu: number;
  visits: number;
  maxPlayers: number;
  upVotes: number;
  downVotes: number;
  approvalPercentage: number;
  hiddenGemScore: number;
  lastUpdated: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  tags: TagLink[];
}

export interface EntryRecord {
  id: string;
  gameUniverseId: number;
  status: string;
  starRating: number | null;
  p2wScore: number | null;
  grindScore: number | null;
  depthScore: number | null;
  notes: string;
  sourceUrl: string | null;
  sourceCaption: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** YYYY-MM-DD of the most recent play log, if any */
  lastPlayedOn: string | null;
  playCount: number;
  game: GameRecord;
}

export interface PlayLogRecord {
  id: string;
  entryId: string;
  playedOn: string; // YYYY-MM-DD
  note: string;
  createdAt: Date;
}

export interface ListRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  authorName: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: { position: number; blurb: string; game: GameRecord }[];
}

const d = (v: SQLInputValue) => (v == null ? null : new Date(String(v)));
const n = (v: SQLInputValue) => (v == null ? null : Number(v));

function tagsFor(ids: number[]): Map<number, TagLink[]> {
  const out = new Map<number, TagLink[]>();
  if (!ids.length) return out;
  // SQLite caps bound params (~32k); chunk to be safe
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const r of all(
      `SELECT gt.game_universe_id AS uid, t.slug, t.label, gt.confidence, gt.source
         FROM game_tags gt JOIN tags t ON t.id = gt.tag_id
        WHERE gt.game_universe_id IN (${qs(chunk.length)})
        ORDER BY gt.confidence DESC`,
      ...chunk,
    )) {
      const uid = Number(r.uid);
      if (!out.has(uid)) out.set(uid, []);
      out.get(uid)!.push({ slug: String(r.slug), label: String(r.label), confidence: Number(r.confidence), source: String(r.source) });
    }
  }
  return out;
}

function toGame(r: Row, tags: TagLink[] = []): GameRecord {
  let thumbs: string[] = [];
  try {
    thumbs = JSON.parse(String(r.thumbnail_urls ?? "[]"));
  } catch {}
  return {
    universeId: Number(r.universe_id),
    rootPlaceId: Number(r.root_place_id),
    name: String(r.name),
    description: String(r.description ?? ""),
    creatorName: String(r.creator_name ?? ""),
    creatorType: String(r.creator_type ?? "User"),
    genre: r.genre == null ? null : String(r.genre),
    subgenre: r.subgenre == null ? null : String(r.subgenre),
    iconUrl: r.icon_url == null ? null : String(r.icon_url),
    thumbnailUrls: thumbs,
    ccu: Number(r.ccu ?? 0),
    visits: Number(r.visits ?? 0),
    maxPlayers: Number(r.max_players ?? 0),
    upVotes: Number(r.up_votes ?? 0),
    downVotes: Number(r.down_votes ?? 0),
    approvalPercentage: Number(r.approval_percentage ?? 0),
    hiddenGemScore: Number(r.hidden_gem_score ?? 0),
    lastUpdated: d(r.last_updated),
    lastSyncedAt: d(r.last_synced_at),
    createdAt: d(r.created_at) ?? new Date(),
    tags,
  };
}

function hydrateGames(rows: Row[]): GameRecord[] {
  const tags = tagsFor(rows.map((r) => Number(r.universe_id)));
  return rows.map((r) => toGame(r, tags.get(Number(r.universe_id)) ?? []));
}

/* ------------------------------------------------------------------ */
/* Games                                                                */
/* ------------------------------------------------------------------ */

export const games = {
  get(universeId: number): GameRecord | null {
    const r = get(`SELECT * FROM games WHERE universe_id = ?`, universeId);
    return r ? hydrateGames([r])[0] : null;
  },
  getByRootPlace(placeId: number): GameRecord | null {
    const r = get(`SELECT * FROM games WHERE root_place_id = ?`, placeId);
    return r ? hydrateGames([r])[0] : null;
  },
  getMany(ids: number[]): GameRecord[] {
    if (!ids.length) return [];
    return hydrateGames(all(`SELECT * FROM games WHERE universe_id IN (${qs(ids.length)})`, ...ids));
  },
  listAll(): GameRecord[] {
    return hydrateGames(all(`SELECT * FROM games`));
  },
  listSynced(): GameRecord[] {
    return hydrateGames(all(`SELECT * FROM games WHERE last_synced_at IS NOT NULL`));
  },
  allIds(): Set<number> {
    return new Set(all(`SELECT universe_id FROM games`).map((r) => Number(r.universe_id)));
  },
  staleIds(olderThan: Date, limit: number): number[] {
    return all(`SELECT universe_id FROM games WHERE last_synced_at IS NULL OR last_synced_at < ? LIMIT ?`, olderThan.toISOString(), limit).map((r) => Number(r.universe_id));
  },
  searchLocal(q: string, limit = 8): GameRecord[] {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    return hydrateGames(all(`SELECT * FROM games WHERE name LIKE ? OR description LIKE ? LIMIT ?`, like, like, limit));
  },
  upsert(gm: Omit<GameRecord, "tags" | "createdAt" | "iconUrl" | "thumbnailUrls"> & { iconUrl: string | null; thumbnailUrls: string[] }) {
    run(
      `INSERT INTO games (universe_id, root_place_id, name, description, creator_name, creator_type, genre, subgenre, icon_url, thumbnail_urls,
                          ccu, visits, max_players, up_votes, down_votes, approval_percentage, hidden_gem_score, last_updated, last_synced_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(universe_id) DO UPDATE SET
         root_place_id=excluded.root_place_id, name=excluded.name, description=excluded.description,
         creator_name=excluded.creator_name, creator_type=excluded.creator_type, genre=excluded.genre, subgenre=excluded.subgenre,
         icon_url=COALESCE(excluded.icon_url, games.icon_url),
         thumbnail_urls=CASE WHEN excluded.thumbnail_urls = '[]' THEN games.thumbnail_urls ELSE excluded.thumbnail_urls END,
         ccu=excluded.ccu, visits=excluded.visits, max_players=excluded.max_players,
         up_votes=excluded.up_votes, down_votes=excluded.down_votes,
         approval_percentage=excluded.approval_percentage, hidden_gem_score=excluded.hidden_gem_score,
         last_updated=excluded.last_updated, last_synced_at=excluded.last_synced_at`,
      gm.universeId,
      gm.rootPlaceId,
      gm.name,
      gm.description,
      gm.creatorName,
      gm.creatorType,
      gm.genre,
      gm.subgenre,
      gm.iconUrl,
      JSON.stringify(gm.thumbnailUrls),
      gm.ccu,
      gm.visits,
      gm.maxPlayers,
      gm.upVotes,
      gm.downVotes,
      gm.approvalPercentage,
      gm.hiddenGemScore,
      gm.lastUpdated?.toISOString() ?? null,
      gm.lastSyncedAt?.toISOString() ?? null,
      now(),
    );
  },
  deleteByRootPlaceIds(placeIds: number[]): number {
    if (!placeIds.length) return 0;
    return Number(run(`DELETE FROM games WHERE root_place_id IN (${qs(placeIds.length)})`, ...placeIds).changes);
  },
};

/* ------------------------------------------------------------------ */
/* Tags                                                                 */
/* ------------------------------------------------------------------ */

export const tags = {
  ensure(slug: string, label: string): number {
    // Labels follow the taxonomy (e.g. "Co-op Horror" → "Horror" after a rename)
    run(`INSERT INTO tags (slug, label) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET label = excluded.label`, slug, label);
    return Number(get(`SELECT id FROM tags WHERE slug = ?`, slug)!.id);
  },
  count(universeId: number): number {
    return Number(get(`SELECT COUNT(*) AS c FROM game_tags WHERE game_universe_id = ?`, universeId)!.c);
  },
  /** Adds links; existing links for the same tag are kept as-is. */
  add(universeId: number, links: { slug: string; label: string; confidence: number; source: string }[]) {
    for (const l of links) {
      const id = tags.ensure(l.slug, l.label);
      run(`INSERT INTO game_tags (game_universe_id, tag_id, confidence, source) VALUES (?,?,?,?) ON CONFLICT DO NOTHING`, universeId, id, l.confidence, l.source);
    }
  },
  /** True if every tag on the game came from the auto-tagger (none from the user or the seed). */
  allAuto(universeId: number): boolean {
    return !get(`SELECT 1 FROM game_tags WHERE game_universe_id = ? AND source NOT IN ('heuristic','llm') LIMIT 1`, universeId);
  },
  /** Remove a game's tag links, optionally only those from certain sources. */
  clear(universeId: number, sources?: string[]) {
    if (sources?.length) run(`DELETE FROM game_tags WHERE game_universe_id = ? AND source IN (${qs(sources.length)})`, universeId, ...sources);
    else run(`DELETE FROM game_tags WHERE game_universe_id = ?`, universeId);
  },
};

/* ------------------------------------------------------------------ */
/* Vault entries                                                        */
/* ------------------------------------------------------------------ */

function hydrateEntries(rows: Row[]): EntryRecord[] {
  const gms = new Map(games.getMany([...new Set(rows.map((r) => Number(r.game_universe_id)))]).map((g) => [g.universeId, g]));
  const plays = new Map<string, { last: string; count: number }>();
  if (rows.length) {
    const ids = rows.map((r) => String(r.id));
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      for (const p of all(`SELECT entry_id, MAX(played_on) AS last, COUNT(*) AS c FROM play_logs WHERE entry_id IN (${qs(chunk.length)}) GROUP BY entry_id`, ...chunk))
        plays.set(String(p.entry_id), { last: String(p.last), count: Number(p.c) });
    }
  }
  return rows
    .filter((r) => gms.has(Number(r.game_universe_id)))
    .map((r) => ({
      id: String(r.id),
      gameUniverseId: Number(r.game_universe_id),
      status: String(r.status),
      starRating: n(r.star_rating),
      p2wScore: n(r.p2w_score),
      grindScore: n(r.grind_score),
      depthScore: n(r.depth_score),
      notes: String(r.notes ?? ""),
      sourceUrl: r.source_url == null ? null : String(r.source_url),
      sourceCaption: r.source_caption == null ? null : String(r.source_caption),
      createdAt: d(r.created_at)!,
      updatedAt: d(r.updated_at)!,
      lastPlayedOn: plays.get(String(r.id))?.last ?? null,
      playCount: plays.get(String(r.id))?.count ?? 0,
      game: gms.get(Number(r.game_universe_id))!,
    }));
}

export type EntryPatch = Partial<{
  status: string;
  starRating: number | null;
  p2wScore: number | null;
  grindScore: number | null;
  depthScore: number | null;
  notes: string;
  sourceUrl: string | null;
  sourceCaption: string | null;
}>;

const ENTRY_COLS: Record<keyof EntryPatch, string> = {
  status: "status",
  starRating: "star_rating",
  p2wScore: "p2w_score",
  grindScore: "grind_score",
  depthScore: "depth_score",
  notes: "notes",
  sourceUrl: "source_url",
  sourceCaption: "source_caption",
};

export const vault = {
  list(): EntryRecord[] {
    return hydrateEntries(all(`SELECT * FROM vault_entries ORDER BY created_at DESC`));
  },
  get(id: string): EntryRecord | null {
    const r = get(`SELECT * FROM vault_entries WHERE id = ?`, id);
    return r ? hydrateEntries([r])[0] ?? null : null;
  },
  getByGame(universeId: number): EntryRecord | null {
    const r = get(`SELECT * FROM vault_entries WHERE game_universe_id = ?`, universeId);
    return r ? hydrateEntries([r])[0] ?? null : null;
  },
  vaultedAmong(ids: number[]): Set<number> {
    if (!ids.length) return new Set();
    return new Set(all(`SELECT game_universe_id FROM vault_entries WHERE game_universe_id IN (${qs(ids.length)})`, ...ids).map((r) => Number(r.game_universe_id)));
  },
  create(universeId: number, data: EntryPatch = {}): EntryRecord {
    const id = randomUUID();
    const t = now();
    run(
      `INSERT INTO vault_entries (id, game_universe_id, status, star_rating, p2w_score, grind_score, depth_score, notes, source_url, source_caption, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      universeId,
      data.status ?? "VAULTED",
      data.starRating ?? null,
      data.p2wScore ?? null,
      data.grindScore ?? null,
      data.depthScore ?? null,
      data.notes ?? "",
      data.sourceUrl ?? null,
      data.sourceCaption ?? null,
      t,
      t,
    );
    return vault.get(id)!;
  },
  update(id: string, patch: EntryPatch): EntryRecord {
    const keys = (Object.keys(patch) as (keyof EntryPatch)[]).filter((k) => patch[k] !== undefined && ENTRY_COLS[k]);
    if (keys.length) {
      run(
        `UPDATE vault_entries SET ${keys.map((k) => `${ENTRY_COLS[k]} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
        ...keys.map((k) => (patch[k] ?? null) as SQLInputValue),
        now(),
        id,
      );
    }
    const e = vault.get(id);
    if (!e) throw new NotFoundError(`Vault entry ${id} not found`);
    return e;
  },
  delete(id: string) {
    const r = run(`DELETE FROM vault_entries WHERE id = ?`, id);
    if (!r.changes) throw new NotFoundError(`Vault entry ${id} not found`);
  },
};

/* ------------------------------------------------------------------ */
/* Curated lists ("Drops")                                              */
/* ------------------------------------------------------------------ */

function hydrateLists(rows: Row[]): ListRecord[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => String(r.id));
  const items = all(`SELECT * FROM curated_list_items WHERE list_id IN (${qs(ids.length)}) ORDER BY position ASC`, ...ids);
  const gms = new Map(games.getMany([...new Set(items.map((i) => Number(i.game_universe_id)))]).map((g) => [g.universeId, g]));
  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    description: String(r.description ?? ""),
    authorName: String(r.author_name ?? "You"),
    isPublic: Boolean(r.is_public),
    createdAt: d(r.created_at)!,
    updatedAt: d(r.updated_at)!,
    items: items
      .filter((i) => i.list_id === r.id && gms.has(Number(i.game_universe_id)))
      .map((i) => ({ position: Number(i.position), blurb: String(i.blurb ?? ""), game: gms.get(Number(i.game_universe_id))! })),
  }));
}

export const lists = {
  all(): ListRecord[] {
    return hydrateLists(all(`SELECT * FROM curated_lists ORDER BY updated_at DESC`));
  },
  bySlug(slug: string): ListRecord | null {
    const r = get(`SELECT * FROM curated_lists WHERE slug = ?`, slug);
    return r ? hydrateLists([r])[0] : null;
  },
  create(data: { slug: string; title: string; description?: string; authorName?: string; items?: { universeId: number; blurb?: string }[] }): ListRecord {
    return transaction(() => {
      const id = randomUUID();
      const t = now();
      run(`INSERT INTO curated_lists (id, slug, title, description, author_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, id, data.slug, data.title, data.description ?? "", data.authorName ?? "You", t, t);
      (data.items ?? []).forEach((it, i) =>
        run(`INSERT INTO curated_list_items (id, list_id, game_universe_id, position, blurb) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING`, randomUUID(), id, it.universeId, i, it.blurb ?? ""),
      );
      return lists.bySlug(data.slug)!;
    });
  },
  addItem(slug: string, universeId: number, blurb = ""): ListRecord {
    const l = get(`SELECT id FROM curated_lists WHERE slug = ?`, slug);
    if (!l) throw new NotFoundError(`Drop ${slug} not found`);
    const pos = Number(get(`SELECT COUNT(*) AS c FROM curated_list_items WHERE list_id = ?`, l.id)!.c);
    run(
      `INSERT INTO curated_list_items (id, list_id, game_universe_id, position, blurb) VALUES (?,?,?,?,?)
       ON CONFLICT(list_id, game_universe_id) DO UPDATE SET blurb = excluded.blurb`,
      randomUUID(),
      l.id,
      universeId,
      pos,
      blurb,
    );
    run(`UPDATE curated_lists SET updated_at = ? WHERE id = ?`, now(), l.id);
    return lists.bySlug(slug)!;
  },
  removeItem(slug: string, universeId: number): ListRecord {
    const l = get(`SELECT id FROM curated_lists WHERE slug = ?`, slug);
    if (!l) throw new NotFoundError(`Drop ${slug} not found`);
    run(`DELETE FROM curated_list_items WHERE list_id = ? AND game_universe_id = ?`, l.id, universeId);
    return lists.bySlug(slug)!;
  },
  delete(slug: string) {
    const r = run(`DELETE FROM curated_lists WHERE slug = ?`, slug);
    if (!r.changes) throw new NotFoundError(`Drop ${slug} not found`);
  },
};

/* ------------------------------------------------------------------ */
/* Play log                                                             */
/* ------------------------------------------------------------------ */

export const plays = {
  list(entryId: string): PlayLogRecord[] {
    return all(`SELECT * FROM play_logs WHERE entry_id = ? ORDER BY played_on DESC, created_at DESC`, entryId).map((r) => ({
      id: String(r.id),
      entryId: String(r.entry_id),
      playedOn: String(r.played_on),
      note: String(r.note ?? ""),
      createdAt: d(r.created_at)!,
    }));
  },
  add(entryId: string, playedOn: string, note = "") {
    run(`INSERT INTO play_logs (id, entry_id, played_on, note, created_at) VALUES (?,?,?,?,?)`, randomUUID(), entryId, playedOn, note, now());
  },
  delete(entryId: string, logId: string) {
    run(`DELETE FROM play_logs WHERE id = ? AND entry_id = ?`, logId, entryId);
  },
};

/* ------------------------------------------------------------------ */
/* "Not interested" (dismissed recommendations)                         */
/* ------------------------------------------------------------------ */

export const dismissed = {
  ids(): Set<number> {
    return new Set(all(`SELECT universe_id FROM dismissed`).map((r) => Number(r.universe_id)));
  },
  add(universeId: number) {
    run(`INSERT INTO dismissed (universe_id, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING`, universeId, now());
  },
  remove(universeId: number) {
    run(`DELETE FROM dismissed WHERE universe_id = ?`, universeId);
  },
};

export class NotFoundError extends Error {
  status = 404;
}
