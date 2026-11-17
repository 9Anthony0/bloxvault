// Client-safe query parser for "vibe search": turns
//   "co-op horror under 500 players"  →  { tags: [co-op, co-op-horror], maxCcu: 500, text: "" }
//   "solo parry games highly rated"   →  { tags: [parry-combat], party: SOLO, minApproval: 85, text: "" }
//   "bleach anime game"               →  { tags: [anime], text: "bleach" }
import { TAG_TAXONOMY, type PartySize } from "./constants";

export interface ParsedQuery {
  raw: string;
  /** Leftover words after filters are removed (used as the Roblox search text) */
  text: string;
  tags: { slug: string; label: string }[];
  maxCcu: number | null;
  party: PartySize | null;
  minApproval: number | null;
  gemsOnly: boolean;
  /** True when the query is mostly a description of a vibe rather than a game name */
  isVibe: boolean;
}

export type FilterKey = "maxCcu" | "party" | "minApproval" | "gemsOnly" | `tag:${string}`;

const FILLER = new Set(
  "a an the that this some any game games roblox ones one with where you your is are for on in of to and or like kinda sorta style vibe vibes looking find me show give good fun really very".split(" "),
);

/** Extra phrasings people type that map to taxonomy tags (beyond each tag's own keywords/label). */
const SYNONYMS: Record<string, string> = {
  horror: "co-op-horror",
  scary: "co-op-horror",
  spooky: "co-op-horror",
  souls: "parry-combat",
  parry: "parry-combat",
  parrying: "parry-combat",
  battlegrounds: "battlegrounds",
  soulslike: "parry-combat",
  "souls-like": "parry-combat",
  fighting: "battlegrounds",
  fighter: "battlegrounds",
  shooter: "tactical-shooter",
  shooters: "tactical-shooter",
  fps: "tactical-shooter",
  gun: "tactical-shooter",
  guns: "tactical-shooter",
  rpg: "open-world-rpg",
  rpgs: "open-world-rpg",
  mmo: "open-world-rpg",
  "open world": "open-world-rpg",
  td: "tower-defense",
  obby: "parkour-platformer",
  obbies: "parkour-platformer",
  parkour: "parkour-platformer",
  racing: "racing-driving",
  cars: "racing-driving",
  driving: "racing-driving",
  coop: "co-op",
  "co-op": "co-op",
  cooperative: "co-op",
  zombies: "wave-survival",
  zombie: "wave-survival",
  waves: "wave-survival",
  heists: "heist",
  stealth: "stealth",
  story: "story-driven",
  pvp: "pvp-arena",
  puzzle: "puzzle",
  puzzles: "puzzle",
  roleplay: "roleplay",
  rp: "roleplay",
  tycoon: "tycoon-sim",
  simulator: "tycoon-sim",
  idle: "tycoon-sim",
  anime: "anime",
  magic: "magic-builds",
  sailing: "sailing",
  pirate: "sailing",
  pirates: "sailing",
  roguelike: "roguelike",
  roguelite: "roguelike",
  permadeath: "permadeath",
  hardcore: "hardcore",
  difficult: "hardcore",
  hard: "hardcore",
  showcase: "atmospheric-showcase",
  atmospheric: "atmospheric-showcase",
  pretty: "atmospheric-showcase",
  exploration: "exploration",
  minigames: "minigames",
  party: "minigames",
  sports: "sports",
  rhythm: "rhythm",
  killer: "killer-vs-survivors",
  asymmetric: "killer-vs-survivors",
  sandbox: "sandbox-building",
  building: "sandbox-building",
  "battle royale": "battle-royale",
  "tower defense": "tower-defense",
  "ghost hunting": "ghost-hunting",
  ghosts: "ghost-hunting",
  "turn based": "turn-based",
  "turn-based": "turn-based",
  "murder mystery": "social-deduction",
};

const BY_SLUG = Object.fromEntries(TAG_TAXONOMY.map((t) => [t.slug, t]));

function strip(s: string, re: RegExp) {
  return s.replace(re, " ");
}

export function parseQuery(raw: string, off: FilterKey[] = []): ParsedQuery {
  let s = ` ${raw.toLowerCase().replace(/[“”"]/g, " ")} `;
  const out: ParsedQuery = { raw, text: "", tags: [], maxCcu: null, party: null, minApproval: null, gemsOnly: false, isVibe: false };

  // --- player caps: "under 500 players", "<2k ccu", "less than 300 playing", "below 1,000"
  const cap = s.match(/(?:under|below|less than|fewer than|max|<|≤)\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:players?|ccu|playing|people|active|online)?/);
  if (cap) {
    out.maxCcu = Math.round(parseFloat(cap[1].replace(/,/g, "")) * (cap[2] ? 1000 : 1));
    s = strip(s, new RegExp(cap[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } else if (/\b(low[- ]?(?:player|pop(?:ulation)?|ccu)s?|small player ?base|niche|obscure)\b/.test(s)) {
    out.maxCcu = 500;
    s = strip(s, /\b(low[- ]?(?:player|pop(?:ulation)?|ccu)s?(?: count)?|small player ?base|niche|obscure)\b/g);
  }

  // --- hidden gems
  if (/\b(hidden gems?|underrated|unknown|under the radar|gems?)\b/.test(s)) {
    out.gemsOnly = true;
    s = strip(s, /\b(hidden gems?|underrated|unknown|under the radar|gems?)\b/g);
  }

  // --- approval
  const pct = s.match(/(\d{2})\s*%\s*(?:\+|or more|approval|rating|rated|liked|likes)?/);
  if (pct) {
    out.minApproval = Math.min(99, Number(pct[1]));
    s = strip(s, new RegExp(pct[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } else if (/\b(highly rated|well rated|top rated|best rated|best|great|amazing|good reviews|well liked)\b/.test(s)) {
    out.minApproval = 85;
    s = strip(s, /\b(highly rated|well rated|top rated|best rated|best|great|amazing|good reviews|well liked)\b/g);
  }

  // --- party size
  if (/\b(solo|single[- ]?player|alone|by myself|1 player)\b/.test(s)) {
    out.party = "SOLO";
    s = strip(s, /\b(solo|single[- ]?player|alone|by myself|1 player)\b/g);
  } else if (/\b(duo|2[- ]?player|two[- ]?player|with a friend|me and a friend|with my (?:friend|gf|bf|partner))\b/.test(s)) {
    out.party = "DUO";
    s = strip(s, /\b(duo|2[- ]?player|two[- ]?player|with a friend|me and a friend|with my (?:friend|gf|bf|partner))\b/g);
  } else if (/\b(squad|group|4\+|four|4 friends|with friends|friend group|team)\b/.test(s)) {
    out.party = "SQUAD";
    s = strip(s, /\b(squad|group|4\+|four|4 friends|with friends|friend group|team)\b/g);
  }

  // --- tags: multi-word synonyms/labels first, then single words
  const found = new Set<string>();
  const phrases: [string, string][] = [
    ...Object.entries(SYNONYMS),
    ...TAG_TAXONOMY.map((t) => [t.label.toLowerCase(), t.slug] as [string, string]),
  ].sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, slug] of phrases) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "giu");
    if (re.test(s)) {
      found.add(slug);
      s = strip(s, re);
    }
  }
  out.tags = [...found].filter((slug) => BY_SLUG[slug]).map((slug) => ({ slug, label: BY_SLUG[slug].label }));

  // --- leftovers
  out.text = s
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .join(" ")
    .trim();

  // apply user-removed filters
  for (const k of off) {
    if (k === "maxCcu") out.maxCcu = null;
    else if (k === "party") out.party = null;
    else if (k === "minApproval") out.minApproval = null;
    else if (k === "gemsOnly") out.gemsOnly = false;
    else if (k.startsWith("tag:")) out.tags = out.tags.filter((t) => t.slug !== k.slice(4));
  }

  const filterCount = out.tags.length + (out.maxCcu ? 1 : 0) + (out.party ? 1 : 0) + (out.minApproval ? 1 : 0) + (out.gemsOnly ? 1 : 0);
  // Vibe = mostly filters. A leftover word like "bleach" still searches by name, filters just rank/trim.
  const nonTag = filterCount - out.tags.length;
  out.isVibe = filterCount > 0 && (out.text.length === 0 || nonTag >= 1);
  return out;
}

export function hasFilters(p: ParsedQuery) {
  return p.tags.length > 0 || p.maxCcu !== null || p.party !== null || p.minApproval !== null || p.gemsOnly;
}
