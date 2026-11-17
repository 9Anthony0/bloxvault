// Shared, client-safe constants (no server imports here).

export const VAULT_STATUSES = ["VAULTED", "PLAYING", "LOVED", "BEATEN", "DROPPED"] as const;
export type VaultStatus = (typeof VAULT_STATUSES)[number];

export const STATUS_META: Record<VaultStatus, { label: string; short: string; color: string }> = {
  VAULTED: { label: "Vaulted (Play Later)", short: "Vaulted", color: "text-sky-300 bg-sky-500/10 ring-sky-500/30" },
  PLAYING: { label: "Playing", short: "Playing", color: "text-amber-300 bg-amber-500/10 ring-amber-500/30" },
  LOVED: { label: "Loved", short: "Loved", color: "text-rose-300 bg-rose-500/10 ring-rose-500/30" },
  BEATEN: { label: "Beaten", short: "Beaten", color: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/30" },
  DROPPED: { label: "Dropped", short: "Dropped", color: "text-zinc-400 bg-zinc-500/10 ring-zinc-500/30" },
};

export const PARTY_SIZES = ["SOLO", "DUO", "SQUAD"] as const;
export type PartySize = (typeof PARTY_SIZES)[number];
export const PARTY_META: Record<PartySize, string> = { SOLO: "Solo", DUO: "Duo", SQUAD: "4+ Squad" };

export const SUB_RATINGS = {
  p2wScore: { label: "P2W Meter", low: "Cosmetic Only", high: "Predatory", invert: true },
  grindScore: { label: "Grindiness", low: "Casual Hop-In", high: "Second Job", invert: true },
  depthScore: { label: "Content Depth", low: "Quick One-Off", high: "100+ Hour Endgame", invert: false },
} as const;
export type SubRatingKey = keyof typeof SUB_RATINGS;

/** Hidden gem gates from the product spec. */
export const GEM_MIN_APPROVAL = 85; // %
export const GEM_MAX_CCU = 2000;
/** Below this many total votes the approval % is noise — not eligible for the gem badge. */
export const GEM_MIN_VOTES = 100;

export function passesGemGates(g: { approvalPercentage: number; ccu: number; upVotes: number; downVotes: number }) {
  return g.approvalPercentage >= GEM_MIN_APPROVAL && g.ccu < GEM_MAX_CCU && g.upVotes + g.downVotes >= GEM_MIN_VOTES;
}

/**
 * Mechanic / vibe taxonomy. `kw` are lowercase substrings/regex sources matched against
 * name + description + caption by the heuristic classifier; weight `w` scales the hit.
 * The LLM classifier is constrained to these slugs too, so tags stay filterable.
 */
export interface TagDef {
  slug: string;
  label: string;
  kw: string[];
  w?: number;
}

export const TAG_TAXONOMY: TagDef[] = [
  // Combat & difficulty
  { slug: "parry-combat", label: "Parry Combat", kw: ["parry", "parrying", "parries", "block timing", "deflect", "posture", "souls-like", "soulslike", "deepwoken"], w: 1.4 },
  { slug: "battlegrounds", label: "Battlegrounds & Fighting", kw: ["battlegrounds", "fighting game", "combo", "combos", "moveset", "movesets", "ultimate move", "m1"], w: 1.2 },
  { slug: "permadeath", label: "Permadeath", kw: ["permadeath", "perma death", "permanent death", "permanent character loss", "lose your character", "lives before"], w: 1.5 },
  { slug: "roguelike", label: "Roguelike", kw: ["roguelike", "rogue-like", "roguelite", "rogue-lite", "procedurally generated", "procedural", "every run", "each run"], w: 1.3 },
  { slug: "hardcore", label: "Hardcore Difficulty", kw: ["hardcore", "unforgiving", "punishing", "no hand holding", "enter at your own risk", "extremely difficult", "difficult game"], w: 1.1 },
  { slug: "pvp-arena", label: "PvP", kw: ["pvp", "player versus player", "duel", "duels", "ranked", "arena", "competitive"], w: 1.0 },
  // Horror & co-op
  { slug: "co-op-horror", label: "Horror", kw: ["horror", "jumpscare", "jumpscares", "jump scare", "scary", "haunted", "terrifying", "creepy", "nightmare", "flashing lights"], w: 1.3 },
  { slug: "ghost-hunting", label: "Ghost Hunting", kw: ["ghost hunting", "phasmophobia", "evidence", "emf", "spirit box", "paranormal", "ghost type", "ghost types"], w: 1.5 },
  { slug: "killer-vs-survivors", label: "Killer vs Survivors", kw: ["killer", "survivors", "1 vs all", "1v all", "asymmetric", "asymmetrical", "slasher"], w: 1.2 },
  { slug: "co-op", label: "Co-op", kw: ["co-op", "coop", "cooperative", "with friends", "team up", "your squad", "up to 4", "up to four", "with up to"], w: 1.1 },
  // Shooters
  { slug: "tactical-shooter", label: "Tactical Shooter", kw: ["tactical", "fps", "first person shooter", "first-person shooter", "loadout", "loadouts", "attachments", "milsim", "realistic gunplay"], w: 1.1 },
  { slug: "movement-shooter", label: "Movement Shooter", kw: ["movement shooter", "bhop", "bunny hop", "wallrun", "wall run", "slide hop", "air strafe"], w: 1.5 },
  { slug: "battle-royale", label: "Battle Royale", kw: ["battle royale", "last one standing", "last player standing", "storm closes"], w: 1.5 },
  { slug: "wave-survival", label: "Wave Survival", kw: ["waves of", "wave-based", "wave based", "horde", "hordes", "zombies", "zombie", "survive the night", "last stand"], w: 1.2 },
  // Stealth & heists
  { slug: "stealth", label: "Stealth", kw: ["stealth", "undetected", "sneak", "sneaking", "detection", "stay hidden"], w: 1.3 },
  { slug: "heist", label: "Heist", kw: ["heist", "heists", "bank", "robbery", "rob", "payday"], w: 1.3 },
  // RPG & worlds
  { slug: "open-world-rpg", label: "Open-World RPG", kw: ["open world", "open-world", "rpg", "mmorpg", "quests", "questline"], w: 1.0 },
  { slug: "turn-based", label: "Turn-Based", kw: ["turn-based", "turn based"], w: 1.5 },
  { slug: "magic-builds", label: "Magic & Builds", kw: ["magic", "spell", "spells", "elemental", "mana", "stat points", "talents"], w: 0.9 },
  { slug: "anime", label: "Anime-Inspired", kw: ["anime", "manga", "one piece", "naruto", "bleach", "jujutsu", "jjk", "demon slayer", "dragon ball", "hunter x hunter", "shinigami", "soul reaper", "devil fruit", "chakra", "breathing style", "cursed technique"], w: 1.3 },
  { slug: "sailing", label: "Sailing & Naval", kw: ["sail", "sailing", "ship", "ships", "naval", "seas", "ocean"], w: 1.1 },
  { slug: "story-driven", label: "Story-Driven", kw: ["chapter", "chapters", "storyline", "story mode", "narrative", "campaign", "cutscene", "cutscenes", "lore"], w: 0.9 },
  { slug: "exploration", label: "Exploration", kw: ["exploration", "explore", "discover", "secrets", "hidden areas", "backrooms", "liminal"], w: 0.7 },
  { slug: "atmospheric-showcase", label: "Atmospheric Showcase", kw: ["showcase", "atmospheric", "atmosphere", "headphones", "max graphics", "realistic lighting", "scenic"], w: 1.0 },
  { slug: "survival-crafting", label: "Survival Crafting", kw: ["crafting", "craft", "gather", "hunger", "base building", "resources"], w: 1.1 },
  // Casual & other genres
  { slug: "puzzle", label: "Puzzle", kw: ["puzzle", "puzzles", "riddle", "riddles", "escape room"], w: 1.2 },
  { slug: "parkour-platformer", label: "Obby & Parkour", kw: ["parkour", "obby", "platformer", "freerun", "speedrun", "tower of"], w: 1.1 },
  { slug: "tower-defense", label: "Tower Defense", kw: ["tower defense", "tower defence", "td", "place towers", "units"], w: 1.4 },
  { slug: "racing-driving", label: "Racing & Driving", kw: ["racing", "race track", "drift", "drifting", "car", "cars", "driving", "vehicle", "vehicles"], w: 1.0 },
  { slug: "sports", label: "Sports", kw: ["soccer", "football", "basketball", "volleyball", "hockey", "baseball", "tennis", "golf", "boxing"], w: 1.3 },
  { slug: "social-deduction", label: "Social Deduction", kw: ["impostor", "imposter", "traitor", "murder mystery", "deduction", "find the killer"], w: 1.4 },
  { slug: "minigames", label: "Party & Minigames", kw: ["minigame", "minigames", "mini games", "party game", "random rounds"], w: 1.2 },
  { slug: "roleplay", label: "Roleplay", kw: ["roleplay", "role-play", "rp", "life sim", "jobs", "dress up"], w: 1.0 },
  { slug: "sandbox-building", label: "Building & Sandbox", kw: ["sandbox", "build anything", "building", "creative mode", "physics"], w: 1.0 },
  { slug: "tycoon-sim", label: "Tycoon & Idle", kw: ["tycoon", "simulator", "idle", "rebirth", "rebirths", "incremental", "factory"], w: 1.0 },
  { slug: "rhythm", label: "Music & Rhythm", kw: ["rhythm", "funky friday", "notes", "beatmap"], w: 1.3 },
];

/**
 * Roblox's official genre / subgenre (games API genre_l1 / genre_l2) → tags.
 * These are assigned by creators/Roblox staff, so they're a strong signal.
 * Also covers legacy `genre` values (Horror, FPS, Naval, …) for older games.
 */
export const GENRE_TAG_MAP: Record<string, string[]> = {
  // Subgenres (genre_l2)
  "battlegrounds & fighting": ["battlegrounds", "pvp-arena"],
  "open world action": ["exploration"],
  "music & rhythm": ["rhythm"],
  exploration: ["exploration"],
  "scavenger hunt": ["exploration"],
  story: ["story-driven"],
  "showcase & hub": ["atmospheric-showcase"],
  "classic obby": ["parkour-platformer"],
  runner: ["parkour-platformer"],
  "tower obby": ["parkour-platformer"],
  minigame: ["minigames"],
  "childhood game": ["minigames"],
  quiz: ["minigames"],
  "escape room": ["puzzle"],
  "match & merge": ["puzzle"],
  word: ["puzzle"],
  "action rpg": ["open-world-rpg"],
  "open world & survival rpg": ["open-world-rpg"],
  "turn-based rpg": ["turn-based"],
  "morph roleplay": ["roleplay"],
  life: ["roleplay"],
  "battle royale": ["battle-royale"],
  "deathmatch shooter": ["pvp-arena", "tactical-shooter"],
  "pve shooter": ["wave-survival"],
  tycoon: ["tycoon-sim"],
  idle: ["tycoon-sim"],
  "incremental simulator": ["tycoon-sim"],
  sandbox: ["sandbox-building"],
  "physics sim": ["sandbox-building"],
  "vehicle sim": ["racing-driving"],
  racing: ["racing-driving"],
  sports: ["sports"],
  "tower defense": ["tower-defense"],
  "board & card games": ["minigames"],
  "1 vs all": ["killer-vs-survivors"],
  escape: ["co-op-horror"],
  // Genres (genre_l1) & legacy genre values
  "obby & platformer": ["parkour-platformer"],
  "party & casual": ["minigames"],
  puzzle: ["puzzle"],
  "roleplay & avatar sim": ["roleplay"],
  shooter: ["tactical-shooter"],
  rpg: ["open-world-rpg"],
  horror: ["co-op-horror"],
  fps: ["tactical-shooter"],
  military: ["tactical-shooter"],
  naval: ["sailing"],
  fighting: ["battlegrounds"],
  building: ["sandbox-building"],
  "town and city": ["roleplay"],
};

export const TAG_BY_SLUG = Object.fromEntries(TAG_TAXONOMY.map((t) => [t.slug, t]));

export function partySizesFor(maxPlayers: number, tagSlugs: string[] = []): PartySize[] {
  // Server size is a hint, not a guarantee: a 50-player server is still fine solo.
  // Co-op horror / heist games with tiny servers are explicitly squad games.
  const out = new Set<PartySize>();
  if (maxPlayers <= 1) out.add("SOLO");
  else {
    const coopOnly = tagSlugs.includes("ghost-hunting");
    if (!coopOnly) out.add("SOLO");
    if (maxPlayers >= 2) out.add("DUO");
    if (maxPlayers >= 4) out.add("SQUAD");
  }
  return [...out];
}

export function robloxLaunchUrl(placeId: number | string) {
  // Spec'd legacy protocol. Roblox also accepts roblox://experiences/start?placeId=… (newer deep link);
  // swap here in one place if your client stops honoring the legacy form.
  return `roblox://placeId=${placeId}`;
}

export function robloxWebUrl(placeId: number | string) {
  return `https://www.roblox.com/games/${placeId}`;
}

/** Root place IDs of the demo games added by `npm run db:seed` (used by "remove demo games"). */
export const DEMO_PLACE_IDS = [4111023553, 6243699076, 21532277, 740581508, 3272915504, 6137321701, 3016661674, 13438553315];
export const DEMO_DROP_SLUG = "underrated-hardcore-co-op-nights";
