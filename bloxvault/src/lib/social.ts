import "server-only";
import { extractPlaceId, isRobloxUrl } from "./roblox";
import { llmJson } from "./llm";

export type InputKind = "roblox_url" | "social_url" | "caption" | "search";

export interface ClassifiedInput {
  kind: InputKind;
  raw: string;
  placeId?: number | null;
  url?: string;
  platform?: "instagram" | "tiktok" | "youtube" | "other";
}

const SOCIAL_RE: [RegExp, ClassifiedInput["platform"]][] = [
  [/instagram\.com\/(reel|reels|p|tv)\//i, "instagram"],
  [/(vm\.|vt\.|www\.)?tiktok\.com\//i, "tiktok"],
  [/(youtube\.com\/(shorts|watch)|youtu\.be\/)/i, "youtube"],
];

export function classifyInput(raw: string): ClassifiedInput {
  const text = raw.trim();
  const firstUrl = text.match(/https?:\/\/\S+/i)?.[0];

  if (isRobloxUrl(text)) {
    return { kind: "roblox_url", raw: text, url: firstUrl ?? text, placeId: extractPlaceId(text) };
  }
  if (firstUrl) {
    for (const [re, platform] of SOCIAL_RE) if (re.test(firstUrl)) return { kind: "social_url", raw: text, url: firstUrl, platform };
    // Unknown URL – treat as social/OG page (Twitter/X, Reddit, etc.)
    return { kind: "social_url", raw: text, url: firstUrl, platform: "other" };
  }
  // A pasted caption tends to be long, multi-line, or full of hashtags/mentions.
  if (text.length > 90 || /\n/.test(text) || (text.match(/[#@]\w+/g)?.length ?? 0) >= 2) {
    return { kind: "caption", raw: text };
  }
  return { kind: "search", raw: text };
}

/* ------------------------------------------------------------------ */
/* Caption fetching                                                     */
/* ------------------------------------------------------------------ */

function decodeEntities(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function metaContent(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re) ?? html.match(re2);
  return m ? decodeEntities(m[1]) : null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 BloxVault" }, signal: AbortSignal.timeout(7000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function getHtml(url: string, ua: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(7000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export interface SocialMeta {
  caption: string;
  author?: string;
  thumbnail?: string;
  method: "oembed" | "opengraph" | "none";
}

/**
 * Server-side caption grab. TikTok & YouTube expose public oEmbed; Instagram doesn't
 * (without a Graph token), so we scrape OpenGraph as a link-preview bot would.
 * Instagram often serves a login wall — callers should invite the user to paste the caption.
 */
export async function fetchSocialMeta(url: string, platform: ClassifiedInput["platform"]): Promise<SocialMeta> {
  if (platform === "tiktok") {
    const o = await getJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (o?.title) return { caption: o.title, author: o.author_name, thumbnail: o.thumbnail_url, method: "oembed" };
  }
  if (platform === "youtube") {
    const o = await getJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (o?.title) {
      // oEmbed only has the title; try OG description for the full text
      const html = await getHtml(url, "Mozilla/5.0 (compatible; BloxVault/0.1)");
      const desc = html ? metaContent(html, "og:description") ?? metaContent(html, "description") : null;
      return { caption: [o.title, desc].filter(Boolean).join("\n"), author: o.author_name, thumbnail: o.thumbnail_url, method: "oembed" };
    }
  }

  // OpenGraph fallback (Instagram + anything else). The FB crawler UA gets OG tags more reliably.
  for (const ua of ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Mozilla/5.0 (compatible; BloxVault/0.1)"]) {
    const html = await getHtml(url, ua);
    if (!html) continue;
    const desc = metaContent(html, "og:description") ?? metaContent(html, "description") ?? "";
    const title = metaContent(html, "og:title") ?? "";
    // IG format: `1,234 likes, 56 comments - user on May 1, 2026: "the caption…"`
    const igQuoted = desc.match(/:\s*"([\s\S]+)"\s*\.?$/)?.[1];
    const caption = (igQuoted ?? [title, desc].filter(Boolean).join("\n")).trim();
    if (caption) return { caption, thumbnail: metaContent(html, "og:image") ?? undefined, method: "opengraph" };
  }
  return { caption: "", method: "none" };
}

/* ------------------------------------------------------------------ */
/* Title extraction                                                     */
/* ------------------------------------------------------------------ */

const GENERIC_TAGS = new Set(
  "roblox robloxgames robloxgame robloxedit robloxfyp fyp foryou foryoupage viral gaming gamer games game trending explore reels reel tiktok shorts youtubeshorts robloxhorror robloxshorts robloxtiktok robloxmemes funny meme memes edit underrated hiddengem gems pc mobile xbox ps5 playstation horror stealth rpg fps coop obby anime simulator pvp scary".split(" "),
);

const FILLER = new Set(
  "that this the a an game games roblox style like kinda sorta one with where you your is was it its of for on in to and or but some called named sort similar vibe vibes looking find me any underrated hidden gem gems".split(" "),
);

const VIBE_WORDS = new Set("so very really underrated good best fun insane crazy amazing goated fire peak lowkey highkey fr ngl pov literally".split(" "));

export function cleanSearchQuery(q: string) {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
  return words.join(" ").trim() || q.trim();
}

/** Genre words help Roblox's search a little but drown out the one word that matters ("bleach"). */
export const GENRE_WORDS = new Set(
  "anime horror rpg fps shooter simulator sim obby tycoon combat fighting fight pvp pve multiplayer coop co-op survival open world battleground battlegrounds roleplay rp sword swords magic action adventure".split(" "),
);

/** "bleach anime game" → ["bleach anime", "bleach anime game", "bleach"] */
export function queryVariants(raw: string): string[] {
  const cleaned = cleanSearchQuery(raw);
  const core = cleaned
    .split(" ")
    .filter((w) => !GENRE_WORDS.has(w))
    .join(" ");
  return [...new Set([cleaned, raw.trim(), core].filter((q) => q && q.length >= 2))];
}

function splitHashtag(tag: string) {
  return tag.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").trim();
}

/** Return ranked title guesses from caption text. */
export function extractTitleCandidatesHeuristic(caption: string): string[] {
  const out: string[] = [];
  const push = (s?: string | null) => {
    const v = s?.replace(/\s+/g, " ").replace(/^[\s:–—-]+|[\s:–—.,!-]+$/g, "").trim();
    if (!v || v.length < 2 || v.length > 60 || out.some((o) => o.toLowerCase() === v.toLowerCase())) return;
    // Reject guesses that are nothing but filler ("so", "is so underrated")
    const meaningful = v.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !FILLER.has(w) && !VIBE_WORDS.has(w));
    if (meaningful.length === 0) return;
    out.push(v);
  };

  // 1) Explicit markers. "game: X" / "game name - X" need punctuation (so "this game is so good" doesn't match);
  //    "called X" / "🎮 X" don't.
  const NAME = "[\"“'«]?([^\\n\"”'»#@|!?.,()]{2,50})";
  const strictRe = new RegExp(`(?:game\\s*name|game|name|title)\\s*[:=–—-]\\s*${NAME}`, "giu");
  const looseRe = new RegExp(`(?:called|named|🎮|🕹️|👉)\\s*(?:[:=–—-]\\s*)?${NAME}`, "giu");
  for (const m of caption.matchAll(strictRe)) push(m[1]);
  for (const m of caption.matchAll(looseRe)) push(m[1]);

  // 2) Quoted / bracketed names
  for (const m of caption.matchAll(/["“«]([^"”»\n]{2,50})["”»]/g)) push(m[1]);
  for (const m of caption.matchAll(/\[([^\]\n]{2,40})\]/g)) push(m[1]);

  // 3) Non-generic hashtags (#Deepwoken, #TheMimic → "The Mimic")
  for (const m of caption.matchAll(/#([\p{L}\p{N}_]{3,40})/gu)) {
    if (!GENERIC_TAGS.has(m[1].toLowerCase())) push(splitHashtag(m[1]));
  }

  // 4) Title-cased runs ("Arcane Odyssey", "Entry Point")
  for (const m of caption.matchAll(/\b([A-Z][\p{L}\p{N}']+(?:\s+(?:of|the|and|[A-Z][\p{L}\p{N}']+)){1,4})\b/gu)) push(m[1]);

  // 5) Fallback: cleaned first line
  const firstLine = caption.split("\n").find((l) => l.replace(/[#@]\S+/g, "").trim().length > 3) ?? caption;
  push(cleanSearchQuery(firstLine.replace(/[#@]\S+/g, "")).split(" ").slice(0, 6).join(" "));

  return out.slice(0, 6);
}

export async function extractTitleCandidates(caption: string): Promise<{ candidates: string[]; method: "llm" | "heuristic" }> {
  const llm = await llmJson<{ title: string | null; alternates?: string[] }>(
    "You read social media captions that recommend Roblox games and extract the exact Roblox game title being shown. If unsure, give your best guess plus alternates. Never invent a title not implied by the text.",
    `Caption:\n${caption.slice(0, 1500)}\n\nReturn {"title": string|null, "alternates": string[]}`,
    200,
  );
  if (llm?.title) {
    const merged = [llm.title, ...(llm.alternates ?? []), ...extractTitleCandidatesHeuristic(caption)];
    return { candidates: [...new Set(merged.map((s) => s.trim()).filter(Boolean))].slice(0, 6), method: "llm" };
  }
  return { candidates: extractTitleCandidatesHeuristic(caption), method: "heuristic" };
}

/* ------------------------------------------------------------------ */
/* Similarity                                                           */
/* ------------------------------------------------------------------ */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ") // drop "[UPDATE]" "(BETA)"
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function bigrams(s: string) {
  const t = ` ${s} `;
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    out.set(b, (out.get(b) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice on character bigrams, with a containment bonus. 0–1. */
export function titleSimilarity(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x), B = bigrams(y);
  let inter = 0, total = 0;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) ?? 0);
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  const dice = (2 * inter) / total;
  const contained = y.includes(x) || x.includes(y) ? 0.25 : 0;
  return Math.min(1, dice + contained);
}
