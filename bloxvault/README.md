# BloxVault

**Letterboxd + Play Later Vault + Hidden Gem Discovery Engine for Roblox.**
Save the game from a Reel in two seconds on your phone, then find and launch it later from your desktop.

Requires **Node 22.13+** (uses Node's built-in SQLite: no database engine to download, no native modules).

```bash
npm install
npm run dev          # http://localhost:3000  (creates .env + ./data/bloxvault.db automatically)
```

Optional:
- `npm run db:seed` adds 8 real demo games with live Roblox data (needs internet).
- `npm run db:fresh` deletes the database so it starts empty again.
- `npm run db:reset` does a fresh database plus the demo games.

You may see a one-line `ExperimentalWarning: SQLite is an experimental feature` in the terminal. That's Node labeling its built-in SQLite, and it's harmless.

---

## File structure

```
bloxvault/
├─ scripts/
│  ├─ seed.ts                  8 real place IDs → live hydration, curated tags, starter vault + Drop
│  ├─ ensure-env.mjs           Node version check + .env creation (runs before dev/setup)
│  └─ reset-db.mjs             npm run db:fresh
├─ public/
│  ├─ icon.svg                 App/PWA icon
│  └─ sw.js                    Minimal service worker (installability → share-sheet target)
└─ src/
   ├─ app/
   │  ├─ layout.tsx · globals.css · page.tsx
   │  ├─ manifest.ts           PWA manifest + share_target (/?url=&text=)
   │  ├─ lists/[slug]/page.tsx Public, shareable Drop page with "Save to My Vault"
   │  └─ api/
   │     ├─ ingest/route.ts            POST  — the unified Quick-Drop pipeline
   │     ├─ roblox/game/[placeId]      GET   — resolve + hydrate a place (no vaulting)
   │     ├─ roblox/search              GET   — server-side proxy to Roblox search
   │     ├─ vault/ · vault/[id]        GET / PATCH / DELETE vault entries
   │     ├─ recommendations/           GET Taste Graph · POST "Dig deeper"
   │     ├─ sync/                      POST  — refresh stale CCU/votes (called on load; cron-able)
   │     └─ lists/ · lists/[slug]/(items)  Drops CRUD
   ├─ lib/
   │  ├─ roblox.ts       SERVER-ONLY Roblox API service (retry/backoff, batching, URL parsing, search)
   │  ├─ ingest.ts       Pipeline orchestration, caching TTL, title matching, vault upsert
   │  ├─ social.ts       Input classifier, oEmbed/OpenGraph caption fetch, title extraction, similarity
   │  ├─ tagger.ts       Heuristic + LLM mechanic/vibe classifier (taxonomy-constrained)
   │  ├─ scoring.ts      Hidden Gem Score (pure; also used client-side for the breakdown)
   │  ├─ recommend.ts    Taste Graph + candidate-pool expansion
   │  ├─ llm.ts          Anthropic Messages API helper (no-op without a key)
   │  ├─ constants.ts    Statuses, party sizes, tag taxonomy, launch URL helper
   │  ├─ dto.ts · lists.ts   Serializers (BigInt → number) and shared types
   │  ├─ filters.ts      Client-side vault filtering/sorting
   │  ├─ store.ts        SERVER-ONLY data layer on node:sqlite: schema + migrations, games, tags, vault, play log, Drops, dismissed
   │  ├─ search.ts       Two-phase live search (fast → full), vault-first, vibe filters
   │  ├─ vibe.ts         Plain-English query → filters (client-safe)
   │  └─ client-api.ts · format.ts · http.ts
   └─ components/
      ├─ AppShell.tsx           Responsive shell: mobile tabs vs. desktop command center
      ├─ QuickDropBar.tsx       Sticky ingestion bar, paste-and-go, "Not it?" swap, undo
      ├─ VaultFilters.tsx       Status, party size, max-CCU slider, approval slider, tags, gems-only
      ├─ GameCard.tsx           Desktop grid card + mobile "Recently Vaulted" row
      ├─ GameDetailModal.tsx    Review log: status, ½-stars, Anti-Slop sliders, notes, source Reel, tags, Drops
      ├─ RecommendationShelf.tsx
      └─ ui.tsx · DropParts.tsx · SaveToVaultButton.tsx · RegisterSW.tsx
```

## Search (the bar at the top)

The bar does two different jobs depending on what you put in it:

| You type… | What happens |
|---|---|
| A name or a vibe (*type soul*, *co-op horror under 500 players*) | **Live dropdown** as you type. **Nothing is saved** until you pick a result. |
| A link (Roblox, TikTok, Reel, YouTube) or a pasted caption | Saved on **Enter** (the bar shows "Enter to vault") |

**How the dropdown works** (`GET /api/search`, read-only):
1. **Fast phase:** one Roblox search plus one icon call, shown instantly. Your vault's matches appear first under "In your vault".
2. **Full phase:** about a second later, the top 10–16 games are hydrated so their descriptions can be read. Tags are inferred, vibe filters are applied, and the list is re-ranked, with a "why it matched" line on each result.

**Vibe parsing** (`lib/vibe.ts`) turns plain English into removable filter chips:
- *under 500 players* / *<2k* → player cap
- *solo / duo / with friends* → party size
- *highly rated / 90%* → minimum approval
- *hidden gems / underrated* → gem gates
- genre words (*horror, parry, tower defense, anime…*) → tags

Anything left over (like *bleach*) is still searched as a name.

**Result controls:** Best match / Gems first / Fewest players, plus a "Hide 5k+" toggle.
**Recent searches** appear when you click into an empty bar.
**Keyboard:** `/` focuses the bar, `↑↓` moves, `Enter` vaults or opens, `Esc` closes.

## Tags

There are 36 tags. Each game's tags come from Roblox's own genre and subgenre (`genre_l1` / `genre_l2`, a strong signal), plus whole-word keyword matches in the name, description, and caption. Weak signals are dropped instead of padded with filler, so a vague game gets fewer tags rather than wrong ones. When the tagger improves (`TAGGER_VERSION`), stored auto-tags are rebuilt on the next app load. Tags you edited yourself, and the curated seed tags, are never touched.

## Logging, pages, bulk

- **Play log:** "Log a play" in a game's modal records a date and an optional note. Logging a Play Later game moves it to Playing. The vault can be sorted by **Recently played**, and the mobile Recent tab has a Vaulted/Played toggle.
- **Game pages** at `/game/{universeId}` show your log, the gem score breakdown, screenshots, tags, the Roblox description, and similar games you've come across. They're linked from search results, recommendations, and the modal (the ⤢ button).
- **Bulk:** click **Select** above the vault grid, pick games, then set their status, add them to a Drop (or a new one), or remove them.
- **Not interested** on a recommendation hides it for good and gently lowers the weight of its tags. You can undo it.

## Ingestion pipeline (`POST /api/ingest`)

| Input | What happens |
|---|---|
| `roblox.com/games/{placeId}/…`, `/games/start?placeId=`, `roblox://placeId=`, `ro.blox.com` short links | placeId → `apis.roblox.com/universes/v1/places/{id}/universe` → hydrate |
| Instagram Reel / TikTok / YouTube Short | TikTok + YouTube via public **oEmbed**; Instagram via **OpenGraph** scrape. If Instagram returns a login wall, the bar asks you to paste the caption and keeps the Reel link attached. |
| Pasted caption | A Roblox link inside the caption wins. Otherwise: LLM title extraction (if a key is set) plus heuristics (`game: X`, `called X`, quotes, non-generic hashtags like `#TheMimic`, Title Case runs) → search → rank |
| Fuzzy text ("that parry combat game deepwoken style") | Filler words stripped → Roblox search → ranked; alternatives returned |

Hydration batches four calls for N games: `games/v1/games`, `games/v1/games/votes`, `thumbnails …/icons` (512²), and `…/multiget/thumbnails` (768×432 ×3). Cached rows are reused for `ROBLOX_SYNC_TTL_MINUTES` (default 6 h), so re-saving a known game is instant.

**Matching is two-stage.**
1. Search Roblox with up to 3 variants of your text. For example, "bleach anime game" becomes "bleach anime", "bleach anime game", and "bleach" (genre words stripped).
2. Take the top 10 games across those searches and hydrate them, so their descriptions can be read. That's how Bleach-inspired games are found even though their titles never say "Bleach". Each game is then scored on title similarity, keyword coverage, Roblox's own rank, approval quality, and popularity. In the keyword score, distinctive words count fully and genre words (anime, horror, rpg…) count a quarter. A game that never mentions any distinctive word is scored ×0.6.

**When it saves automatically vs. asks you:**
- **Roblox links:** always save.
- **Exact titles** (≥0.9 similarity with a clear lead): save, with a "Not it?" row of alternatives so you can swap.
- **Everything else:** returns `needsPick: true` and opens a **picker** (icons, players, approval, gem badge, and why each game matched). Nothing is saved until you tap one.

**Auto-tagging:** 3–5 tags from a fixed 24-tag taxonomy, so filters stay consistent. When `ANTHROPIC_API_KEY` is set, Claude picks the tags (it can only choose slugs from the taxonomy). Without a key, a weighted keyword classifier does it (name ×2, caption ×1.5, description ×1, plus a genre prior). Tag edits you make in the UI are stored with `source: "user"` and are never overwritten.

## Hidden Gem Score

```
score = 100 × (0.50·Q + 0.30·O + 0.20·F) × S

Q  Quality    Wilson lower bound (95%) of the like ratio, mapped 70% → 0, 95% → 1
O  Obscurity  1.0 across ~25–600 CCU; eases toward 0.35 for dead games; 0 at ~6k CCU
F  Freshness  1.0 if updated ≤30 days ago, linear to 0 at 18 months
S  Sample     ×(0.5 → 1.0) below 500 total votes
```

The **gem badge** is the spec's hard gate: approval ≥ 85% **and** CCU < 2,000. I added a third condition, at least 100 votes, so a 12-like / 0-dislike game doesn't count as a gem.

## Taste Graph

Recommendations only come from games already in the local pool: seeded games, games you added, and games found by Dig deeper or imports. That's why a fresh install leans hardcore/horror, because the only taste signals are Deepwoken and The Mimic.

A tag-weight vector built from **Loved** games (+1.25 × stars/5) and any game rated 4★ or higher. **Dropped** games and anything rated 2★ or lower push those tags down (−0.5). Each game in the pool that isn't in your vault gets `0.55·tag match + 0.45·gem score`. That score is ×1.15 if the game passes the gem gates, ×0.6 at 2k+ CCU, and ×0.7 under 85% approval. The shelf is then **diversified**: each pick is penalized for tags the shelf already shows, so one taste can't fill it. **Dig deeper** asks Roblox for "similar experiences" to up to 6 of your Loved games (rotating each time) and searches your top 6 mechanics, one query each. It interleaves the results, hydrates up to 24 new games, and tags them.

## Import Roblox favorites

The **Import Roblox favorites** button in the header takes a username, user ID, or profile link. You choose how many to import (10 / 25 / 50 / 100 / 200 / All, or a custom number), and the most recently favorited come first. Your username is remembered for one-click **Re-sync**. It resolves the user (`users.roblox.com`), pages through `games.roblox.com/v2/users/{id}/favorite/games`, hydrates the games in batches, auto-tags them, and adds the new ones as **Loved** (this trains recommendations) or **Play Later**. Games already in your vault keep their status. Your favorites have to be publicly visible in your Roblox privacy settings. There's an optional checkbox to remove the 8 demo games first (`npm run db:fresh` wipes everything).

## Mobile capture

On a phone the Quick-Drop bar sits at the bottom of the screen. The **Paste** button reads the clipboard and submits in one tap. Install the app with Add to Home Screen; in production builds it then shows up in the share sheet (`share_target` → `/?url=…&text=…` auto-submits). Confident matches auto-dismiss after 6 seconds so you can get back to scrolling.

## Notes & next steps

- **Launch:** uses `roblox://placeId={rootPlaceId}` as specified. Roblox's newer deep link is `roblox://experiences/start?placeId=`. To switch, edit `robloxLaunchUrl()` in `lib/constants.ts`.
- **Search** uses Roblox's omni-search endpoint (the one roblox.com uses). It's undocumented, so the parsing is defensive, and the app falls back to a local name search if it fails.
- **Single user:** there's no auth yet. Add `userId` to `VaultEntry` and `CuratedList` when you add auth.
- **Database:** everything goes through `src/lib/store.ts` (SQLite file at `./data/bloxvault.db`, or set `BLOXVAULT_DB`). To move to Postgres/Supabase, re-implement that one file; nothing else touches SQL.
- The seed's Entry Point entry has a placeholder `sourceUrl` (`…/reel/EXAMPLE_REPLACE_ME/`) to show how the "where you found it" link looks.
