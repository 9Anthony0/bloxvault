# BloxVault

**A play-later vault and hidden-gem finder for Roblox. Think Letterboxd, but for Roblox games.**

You see a great-looking Roblox game in an Instagram Reel or a TikTok, save the clip, and never think about it again. Meanwhile Roblox's front page keeps pushing the same high-earning games, so the small, high-effort ones are hard to find.

BloxVault fixes both:

- **Save in two seconds from your phone.** Paste a Roblox link, a Reel or TikTok link, a caption, or just a game name. The game lands in your vault along with the clip you found it in.
- **Log and rate like Letterboxd.** Statuses, half-star ratings, and "Anti-Slop" meters for pay-to-win, grind and content depth.
- **Find hidden gems.** Live player counts and approval from Roblox, a Hidden Gem Score, vibe search ("co-op horror under 500 players"), and recommendations built from what you love.
- **Launch straight into the game** from your desktop with one click.

It runs locally on your computer. There are no accounts, no cloud, and nothing to download besides the npm packages.

---

## Contents

- [Quick start](#quick-start)
- [Using BloxVault](#using-bloxvault)
- [Configuration](#configuration)
- [Commands](#commands)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Limitations and roadmap](#limitations-and-roadmap)

---

## Quick start

**You need Node.js 22.13 or newer** (the current LTS is fine): [nodejs.org](https://nodejs.org). BloxVault uses the SQLite database built into Node, so there's no database to install.

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

The first `npm run dev` creates a `.env` file and the database (`./data/bloxvault.db`) automatically. Your vault starts empty. To fill it, either:

- click **Import Roblox favorites** in the header and enter your Roblox username (recommended), or
- run `npm run db:seed` to add 8 real demo games, or
- paste any Roblox link into the bar at the top.

> **Windows (PowerShell) users:** run the commands one per line. Older PowerShell doesn't support `&&` between commands. To unzip, right-click the zip in File Explorer and choose *Extract All*.

> You may see `ExperimentalWarning: SQLite is an experimental feature` in the terminal. That's Node labeling its built-in SQLite. It's harmless.

### Using it on your phone

Run the dev server so other devices on your Wi-Fi can reach it:

```bash
npm run dev -- -H 0.0.0.0
```

Then open `http://<your-computer's-local-IP>:3000` on your phone. Next.js prints this address as "Network" when it starts.

Two phone features need **HTTPS** and won't work over a plain local address:

- the **Paste** button (phones only allow clipboard access on secure pages; long-press the input and paste instead), and
- **appearing in the share sheet** (see [Saving from the share sheet](#saving-from-the-share-sheet)).

For those, run a production build behind HTTPS, for example `npm run build && npm start` exposed through a Cloudflare Tunnel or ngrok.

---

## Using BloxVault

### The bar: search or save

The bar at the top (at the bottom on phones) does two jobs, depending on what you put in it.

| You type or paste | What happens |
|---|---|
| A **game name** (*type soul*) or a **vibe** (*co-op horror under 500 players*) | A live dropdown of results appears as you type. **Nothing is saved until you pick a game.** |
| A **link**: Roblox, Instagram Reel, TikTok, YouTube Short | The bar shows **Enter to vault**. Press Enter and it's saved, with the link kept as "where you found it". |
| A **pasted caption** (long text, hashtags) | BloxVault works out which game the caption is about. If it's confident, it saves; if not, you pick from a short list. |

Press **`/`** anywhere to jump to the bar. Use **`↑` `↓`** to move through results, **Enter** to vault (or open, if it's already in your vault), and **Esc** to close.

### Vibe search

Describe what you want in plain English. BloxVault turns the parts it recognizes into filter chips, which you can remove by clicking them.

| You write | Becomes |
|---|---|
| *under 500 players*, *<2k*, *low player count* | a player cap |
| *solo*, *duo*, *with a friend*, *with friends*, *squad* | a party size |
| *highly rated*, *90%* | a minimum approval |
| *hidden gems*, *underrated* | only games that pass the gem gates |
| *horror*, *parry*, *tower defense*, *anime*, *fps*, *obby*… | mechanic tags |

Anything left over is searched as a name. So *bleach anime game* searches for "bleach" and treats "anime" as a filter, which surfaces Bleach-inspired games even when their titles don't say "Bleach".

Some examples:

- `co-op horror under 500 players`
- `solo parry games highly rated`
- `hidden gem tower defense`
- `fps with friends under 2k`

Results can be sorted by **Best match**, **Gems first** or **Fewest players**, and **Hide 5k+** removes front-page games. Games already in your vault appear first, under **In your vault**. Your last 8 searches show when you click into an empty bar.

### Saving from Reels and TikToks

- **TikTok and YouTube:** the caption is read automatically.
- **Instagram:** Instagram often hides captions behind a login. When it does, BloxVault asks you to paste the caption (or just type the game name) and keeps the Reel link attached.
- **Captions that include a Roblox link** are matched exactly.

After saving, a card shows the game with **Undo**. If the match was a guess, a **Not it?** row lets you swap to the right game; the clip link moves with it.

### Saving from the share sheet

Once BloxVault is installed to your phone's home screen (production build over HTTPS), it appears in the share menu. In Instagram or TikTok, tap **Share → BloxVault**, and the clip is saved without copying anything.

### Your vault

The **Play Later Vault** grid has filters in the left sidebar (in a **Filters** drawer on phones):

- **Status:** Vaulted (Play Later), Playing, Loved, Beaten, Dropped
- **Party size:** Solo, Duo, 4+ Squad (worked out from server size and tags)
- **Max players online:** a slider from "ghost town" to "front page"
- **Min approval**
- **Hidden gems only**
- **Mechanics & vibes:** tag chips (selected tags must all match)

Sort by recently vaulted, recently played, Hidden Gem Score, approval, fewest players, or your rating.

**Bulk actions:** click **Select** above the grid, tick games, then change their status, add them to a Drop, or remove them.

### Logging and rating

Click any game to open its review window:

- **Launch Game** opens the Roblox desktop app straight into the game.
- **Status** and a **0.5–5.0 star rating** in half-star steps.
- **Anti-Slop meters** (1–5 each):
  - **P2W Meter:** Cosmetic Only → Predatory
  - **Grindiness:** Casual Hop-In → Second Job
  - **Content Depth:** Quick One-Off → 100+ Hour Endgame
- **Notes**
- **Play log:** **Log a play** records a date and an optional note ("with Sam, got to floor 3"). Logging a Play Later game moves it to Playing.
- **Where you found it:** a link back to the original Reel or TikTok, with its caption.
- **Mechanics & vibes:** add or remove tags. Your edits are never overwritten.
- **Add to a Drop**
- **Hidden Gem Score breakdown** and live stats.

Everything saves as you go. The **⤢** button opens the game's full page.

### Game pages

Every game has a page at `/game/{universeId}` showing your log, the gem score breakdown, screenshots, tags, the Roblox description, and similar games you've already come across. Search results and recommendations link to these pages.

### Hidden gems for you

The recommendation shelf learns from games you mark **Loved** or rate **4★ or higher**, and it steers away from games you **Drop** or rate 2★ or lower. Each pick explains itself, for example: *Shares Parry Combat + Permadeath with Deepwoken · 94% approval · 150 playing*.

- **Not interested** hides a game for good and shows you fewer like it. You can undo it.
- **Dig deeper** pulls up to 24 new candidates from Roblox: games Roblox considers similar to your favorites, plus searches for your top mechanics. Click it a few times; it explores different favorites each time.

The shelf can only recommend games BloxVault already knows about (your vault, imports and Dig deeper finds). That's why importing your favorites and digging deeper a couple of times makes it much better.

### Importing your Roblox favorites

Click **Import Roblox favorites** in the header.

1. Enter your Roblox **username**, **user ID**, or **profile link**. No password is needed.
2. Choose **how many**: 10, 25, 50, 100, 200, All, or a custom number. Your most recently favorited games come first.
3. Add them as **Loved** (trains your recommendations) or **Play Later** (just saves them).
4. Optionally tick **Remove the 8 demo games first**.

Games already in your vault keep their status and ratings. Your username is remembered, so next time you can click **Re-sync** to add anything you've favorited since.

Your favorites must be visible to everyone in your Roblox privacy settings. If they're private, the import tells you.

### Drops (shareable lists)

Drops are themed lists, like Letterboxd lists: *"5 Underrated 2AM Co-op Horror Games Under 300 Players"*. Create one from a game's **Add to a Drop** menu or from bulk select. Each Drop has its own page at `/lists/{slug}`, where every game has a **Save to My Vault** button.

---

## Configuration

All settings are optional and live in `.env` (created automatically from `.env.example`).

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Turns on AI title extraction from captions and AI tagging. Without it, BloxVault uses its built-in rules, which work well for most games. |
| `LLM_MODEL` | `claude-haiku-5-5` | Which Claude model to use when a key is set. |
| `ROBLOX_SYNC_TTL_MINUTES` | `360` | How long cached player counts and votes count as fresh before they're re-fetched. |
| `BLOXVAULT_DB` | `./data/bloxvault.db` | Where the database file lives. |

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app at http://localhost:3000. Creates `.env` and the database if they're missing. |
| `npm run build` / `npm start` | Production build and server. |
| `npm run db:seed` | Add 8 real demo games with live data from Roblox (needs internet). Safe to re-run. |
| `npm run db:fresh` | Delete the database. It's recreated empty on the next start. |
| `npm run db:reset` | `db:fresh` plus `db:seed`. |
| `npm run typecheck` | Type-check the project. |

The demo games are Deepwoken, The Mimic, Notoriety, Entry Point, Arcane Odyssey, Blair, Rogue Lineage and Decaying Winter. Deepwoken starts as Loved and The Mimic as rated 4★, so recommendations have something to work with. Rogue Lineage and Decaying Winter are left out of the vault so they can appear as recommendations.

---

## How it works

### Tech stack

- **Next.js 16** (App Router) with **React 19**
- **Tailwind CSS 4** and **Lucide** icons
- **SQLite via `node:sqlite`**, built into Node, with no native modules or downloaded database engine
- **Zod** for validating API input
- Optional **Claude** (Anthropic API) for caption reading and tagging

### Talking to Roblox

Roblox's web APIs block requests from browsers, so **every Roblox call happens on the server** (Next.js route handlers in `src/app/api`). To turn a Roblox link into a game:

```
placeId  ──▶  apis.roblox.com/universes/v1/places/{placeId}/universe   → universeId
universeId ──▶ games.roblox.com/v1/games?universeIds=…                 → name, creator, live players, visits, server size, last update, genre
           ──▶ games.roblox.com/v1/games/votes?universeIds=…           → likes / dislikes
           ──▶ thumbnails.roblox.com/v1/games/icons?…512x512           → icon
           ──▶ thumbnails.roblox.com/v1/games/multiget/thumbnails?…    → 3 screenshots (768×432)
```

These endpoints accept many games at once, so loading N games costs 4 requests in total. Results are cached for `ROBLOX_SYNC_TTL_MINUTES`, and stale games refresh in the background each time the app loads (or when you click ⟳ in the header).

Other Roblox endpoints used:

| Purpose | Endpoint |
|---|---|
| Search | `apis.roblox.com/search-api/omni-search` (the one roblox.com uses) |
| Username → user | `users.roblox.com/v1/usernames/users`, `users.roblox.com/v1/users/{id}` |
| Favorites | `games.roblox.com/v2/users/{id}/favorite/games` |
| Similar games (Dig deeper) | `games.roblox.com/v1/games/recommendations/game/{universeId}` |

The search and similar-games endpoints are undocumented, so their responses are read defensively. Search falls back to games stored locally if Roblox's search fails.

### Search ranking

Live search runs in two phases (`src/lib/search.ts`):

1. **Fast:** one Roblox search plus one icon request. Results appear almost instantly, together with matches from your vault.
2. **Full:** about a second later, the top 10–16 results are fetched in full so their **descriptions** can be read. Tags are inferred, vibe filters applied, and the list re-ranked.

For name searches, each game is scored on title similarity, how many of your words appear in its title or description, Roblox's own rank, approval, and popularity. Distinctive words (like *bleach*) count fully; genre words (like *anime*) count a quarter. A game that never mentions any distinctive word is scored down. For vibe searches, tag matches and the Hidden Gem Score lead the ranking.

### Tags

There are **36 tags**:

> Parry Combat · Battlegrounds & Fighting · Permadeath · Roguelike · Hardcore Difficulty · PvP · Horror · Ghost Hunting · Killer vs Survivors · Co-op · Tactical Shooter · Movement Shooter · Battle Royale · Wave Survival · Stealth · Heist · Open-World RPG · Turn-Based · Magic & Builds · Anime-Inspired · Sailing & Naval · Story-Driven · Exploration · Atmospheric Showcase · Survival Crafting · Puzzle · Obby & Parkour · Tower Defense · Racing & Driving · Sports · Social Deduction · Party & Minigames · Roleplay · Building & Sandbox · Tycoon & Idle · Music & Rhythm

Each game gets up to 5 tags. They come from:

1. **Roblox's own genre and subgenre** (for example *RPG / Action RPG* or *Strategy / Tower Defense*). These are set by creators or Roblox staff, so they're the strongest signal.
2. **Whole-word keyword matches** in the game's name, description and the caption you saved it from. "Race" in an RPG's character list no longer makes it a racing game.

Weak signals are dropped rather than padded out, so a vague game gets fewer tags instead of wrong ones. With an `ANTHROPIC_API_KEY`, Claude chooses the tags, limited to the same list.

When the tagging rules improve, automatic tags are rebuilt on the next app load. Tags you edited yourself and the curated demo-game tags are never changed.

### Hidden Gem Score

A score from 0 to 100 for how much of a hidden gem a game is:

```
score = 100 × (0.50·Quality + 0.30·Obscurity + 0.20·Freshness) × Sample × Popularity

Quality    Likes ratio, adjusted for how many votes there are (Wilson lower bound, 95%).
           Mapped so 70% → 0 and 95% → 1. A game with 12 likes and 0 dislikes
           doesn't beat one with 40,000 likes and 2,000 dislikes.
Obscurity  Highest across roughly 25–600 players online; lower for near-empty games
           (hard to find a lobby); falls to 0 around 6,000 players.
Freshness  1.0 if updated in the last 30 days, falling to 0 at 18 months.
Sample     Scales the score down when there are fewer than 500 votes in total.
Popularity 1.0 up to 2,000 players online, easing to 0.4 at 20,000+, so front-page
           hits can't score like hidden gems on quality and freshness alone.
```

The **gem badge** needs all three: **approval ≥ 85%**, **5 to 1,999 players online** (enough to find a lobby, few enough to be hidden), and **at least 100 votes**.

### Recommendations (Taste Graph)

1. **Build a taste profile** as a weight for each tag:
   - **Loved:** +1.25 × (stars ÷ 5), or ×0.9 if unrated
   - **Rated 4★ or higher:** + stars ÷ 5
   - **Dropped, or rated 2★ or lower:** −0.5
   - **Not interested:** −0.35 on that game's tags
   - Each contribution is multiplied by how confident the tag is.
2. **Score every known game not in your vault:** `0.55 × taste match + 0.45 × Hidden Gem Score`, then
   - ×1.15 if it passes the gem gates,
   - ×0.6 if 2,000+ players are online,
   - ×0.7 if approval is under 85%.
3. **Mix the shelf:** each pick is scored down for tags the shelf already shows, so one taste (say, horror) can't fill it.

### Matching a caption to a game

When you save a caption or a clip:

1. A Roblox link inside the caption wins outright.
2. Otherwise, title guesses are pulled from patterns like `game: X`, `called X`, quoted names, hashtags such as `#TheMimic`, and runs of Title Case words. With an API key, Claude makes the first guess.
3. The guesses are searched on Roblox and ranked as described in [Search ranking](#search-ranking).
4. If the best match is clearly right, it's saved, and you get a **Not it?** row to swap. Otherwise you get a short list to pick from, and nothing is saved until you choose.

---

## Project structure

```
bloxvault/
├─ scripts/
│  ├─ ensure-env.mjs        Runs before dev/setup: checks the Node version, creates/repairs .env
│  ├─ seed.ts               8 demo games with live Roblox data, curated tags, a starter Drop
│  └─ reset-db.mjs          npm run db:fresh
├─ public/
│  ├─ icon.svg              App icon
│  └─ sw.js                 Minimal service worker (needed to install the app / share sheet)
└─ src/
   ├─ app/
   │  ├─ page.tsx           The main app (AppShell)
   │  ├─ layout.tsx · globals.css · icon.svg
   │  ├─ manifest.ts        PWA manifest + share target (/?url=…&text=…)
   │  ├─ game/[universeId]/ Game pages
   │  ├─ lists/[slug]/      Public Drop pages
   │  └─ api/               Server routes (see API reference)
   ├─ lib/
   │  ├─ store.ts           The only code that touches the database: schema, migrations, queries
   │  ├─ roblox.ts          Roblox API client: batching, retries, URL parsing, search, favorites
   │  ├─ ingest.ts          Saving pipeline: classify input → match → fetch → tag → vault
   │  ├─ search.ts          Two-phase live search
   │  ├─ vibe.ts            Plain-English query → filters (runs in the browser too)
   │  ├─ social.ts          Input types, oEmbed/OpenGraph caption fetching, title guessing, similarity
   │  ├─ tagger.ts          Tag classifier (rules + optional Claude)
   │  ├─ scoring.ts         Hidden Gem Score
   │  ├─ recommend.ts       Taste Graph and Dig deeper
   │  ├─ favorites.ts       Roblox favorites import
   │  ├─ llm.ts             Claude API helper (does nothing without a key)
   │  ├─ constants.ts       Statuses, tag list, genre → tag map, launch URL
   │  ├─ dto.ts · lists.ts  Shapes sent to the browser
   │  ├─ filters.ts         Vault filtering and sorting
   │  └─ client-api.ts · format.ts · http.ts
   └─ components/
      ├─ AppShell.tsx           Layout: phone tabs vs. desktop sidebar + grid
      ├─ QuickDropBar.tsx       The search/save bar
      ├─ SearchDropdown.tsx     Live search results
      ├─ VaultFilters.tsx       Sidebar filters
      ├─ GameCard.tsx           Vault cards and phone list rows
      ├─ GameDetailModal.tsx    Review window: rating, meters, play log, tags, Drops
      ├─ RecommendationShelf.tsx
      ├─ ImportFavoritesModal.tsx
      ├─ BulkBar.tsx            Multi-select actions
      └─ ui.tsx · DropParts.tsx · SaveToVaultButton.tsx · RegisterSW.tsx
```

---

## Data model

One SQLite file (`./data/bloxvault.db`). The schema is created on first run, and older databases are upgraded automatically.

| Table | Holds |
|---|---|
| `games` | One row per Roblox experience, keyed by `universe_id`: root place ID, name, description, creator, genre/subgenre, icon and screenshots, live players, visits, server size, likes/dislikes, approval %, Hidden Gem Score, Roblox's last-update time, and when BloxVault last synced it |
| `tags` | The tag list (slug and label) |
| `game_tags` | Which tags each game has, with a confidence (0–1) and source (`heuristic`, `llm`, `user` or `seed`) |
| `vault_entries` | Your log for each saved game: status, star rating, P2W / grind / depth scores, notes, source link and caption, timestamps |
| `play_logs` | Play sessions: date and note per vault entry |
| `curated_lists` / `curated_list_items` | Drops and their games, in order, with an optional blurb each |
| `dismissed` | Games you marked "Not interested" |
| `meta` | Schema and tagger versions |

All database access goes through `src/lib/store.ts`. To move to Postgres or Supabase later, re-implement that one file.

---

## API reference

All routes are under `/api`, accept and return JSON, and run on the server. Errors come back as `{ "error": "…", "code": "…" }` with a matching HTTP status.

### Saving

| Method & path | Body / query | Does |
|---|---|---|
| `POST /ingest` | `{ input }` (link, caption or name), or `{ universeId }` / `{ placeId }`. Optional: `sourceUrl`, `caption`, `status`, `replaceEntryId` | Saves a game. Returns `{ needsPick: false, entry, game, candidates, … }`, or `{ needsPick: true, candidates }` when it isn't sure. `replaceEntryId` swaps a wrong match, keeping its source link. |
| `POST /import/roblox-favorites` | `{ user, status?, max?, clearDemo? }` | Imports a user's Roblox favorites (`max` 1–500, default 200) |

### Search and Roblox

| Method & path | Body / query | Does |
|---|---|---|
| `GET /search` | `?q=…&phase=fast\|full&off=maxCcu,tag:co-op` | Live search. Read-only: never saves. `off` removes parsed filters. |
| `GET /roblox/search` | `?q=…` | Raw Roblox search results |
| `GET /roblox/game/{placeId}` | `?force=1` to skip the cache | Fetches and caches a game, plus its gem score breakdown, without saving it |
| `POST /sync` | — | Refreshes stale games' live data |

### Vault

| Method & path | Body / query | Does |
|---|---|---|
| `GET /vault` | — | All vault entries, newest first, plus tag counts |
| `PATCH /vault/{id}` | Any of `status`, `starRating`, `p2wScore`, `grindScore`, `depthScore`, `notes`, `sourceUrl`, `tags` | Updates an entry. `tags` replaces the game's tags with your own. |
| `DELETE /vault/{id}` | — | Removes an entry |
| `GET /vault/{id}/plays` | — | The play log |
| `POST /vault/{id}/plays` | `{ playedOn?: "YYYY-MM-DD", note? }` | Logs a session (defaults to today) |
| `DELETE /vault/{id}/plays` | `?logId=…` | Deletes a session |
| `POST /vault/bulk` | `{ action: "status", ids, status }`, `{ action: "remove", ids }` or `{ action: "drop", ids, slug? \| newTitle? }` | Acts on many entries at once |

### Recommendations

| Method & path | Body / query | Does |
|---|---|---|
| `GET /recommendations` | `?limit=12` (max 30) | The recommendation shelf |
| `POST /recommendations` | — | Dig deeper, then returns the updated shelf |
| `POST /recommendations/dismiss` | `{ universeId, undo? }` | Not interested (or undo) |

### Drops

| Method & path | Body / query | Does |
|---|---|---|
| `GET /lists` | — | All Drops |
| `POST /lists` | `{ title, description?, universeIds? }` | Creates a Drop |
| `GET /lists/{slug}` · `DELETE /lists/{slug}` | — | Reads or deletes a Drop |
| `POST /lists/{slug}/items` | `{ universeId, blurb? }` | Adds a game |
| `DELETE /lists/{slug}/items` | `?universeId=…` | Removes a game |

---

## Troubleshooting

**"BloxVault needs Node 22.13 or newer"**
Install the current LTS from [nodejs.org](https://nodejs.org), then open a new terminal.

**Searches, imports or saves say they can't reach Roblox**
Some school, work and public networks block Roblox's API. Try a different network (a phone hotspot is a quick test). BloxVault itself needs no other outside services.

**"That account's favorites are private"**
On Roblox, open Settings → Privacy and make your inventory/favorites visible to everyone, then import again.

**An Instagram link asks for the caption**
That's expected: Instagram usually hides captions from anything that isn't logged in. Paste the caption or just the game name, and the Reel link stays attached.

**The app saved the wrong game**
Use **Not it?** on the card that appears after saving, or open the game and remove it. Searching by name never saves anything until you pick.

**Recommendations all look the same**
Import your Roblox favorites as **Loved**, remove the demo games if you added them, and click **Dig deeper** a few times. Use **Not interested** on things you don't want.

**Launch Game doesn't open Roblox**
The Roblox desktop app has to be installed. If your Roblox version stops accepting the link format, change `robloxLaunchUrl()` in `src/lib/constants.ts` to use `roblox://experiences/start?placeId=…`.

**Start completely fresh**
`npm run db:fresh` deletes the database. It's recreated empty on the next `npm run dev`.

**`npm audit` warnings after installing**
They don't affect running the app locally. Avoid `npm audit fix --force`; it can upgrade packages to versions that break the app.

---

## Limitations and roadmap

- **Single user.** There are no accounts. Adding auth means adding a user ID to vault entries and Drops.
- **Local only.** BloxVault is built to run on your own computer. Hosting it means swapping SQLite for a hosted database (only `store.ts` needs to change) and adding auth.
- **Undocumented Roblox endpoints.** Search and similar-games may change without notice. The code handles failures gracefully, but results could degrade until it's updated.
- **Recommendations draw from games BloxVault knows about.** Imports and Dig deeper grow that pool.

Ideas for later:

- Accounts, plus sharing Drops between people
- Following friends' vaults and ratings
- Year-in-review stats from the play log
- Price and game-pass tracking to back up the P2W meter
