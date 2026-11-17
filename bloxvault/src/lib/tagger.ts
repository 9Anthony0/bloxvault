import "server-only";
import { GENRE_TAG_MAP, TAG_BY_SLUG, TAG_TAXONOMY } from "./constants";
import { llmJson } from "./llm";

/** Bump when the taxonomy or heuristics change; stored auto-tags are rebuilt on next start. */
export const TAGGER_VERSION = 3;

export interface TagResult {
  slug: string;
  confidence: number;
  source: "heuristic" | "llm";
}

export interface TagInput {
  name: string;
  description: string;
  caption?: string;
  genre?: string | null;
  subgenre?: string | null;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word match (optionally plural), so "race" no longer matches "races" in an RPG's character list,
// and "td" doesn't match "std".
const wordRe = new Map<string, RegExp>();
function kwRe(kw: string) {
  let re = wordRe.get(kw);
  if (!re) {
    re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(kw.trim())}(?:s|es)?(?![\\p{L}\\p{N}])`, "giu");
    wordRe.set(kw, re);
  }
  return re;
}

/**
 * Heuristic classifier.
 *  - Roblox genre/subgenre → strong prior (subgenre +1.6, genre +0.8)
 *  - Keyword hits: name ×2, caption ×1.5, description ×1, capped at 3 per field, log-damped
 *  - Only tags that clear an absolute floor AND ≥33% of the best tag are kept (0–5 tags).
 *    No more filler tags: a game with weak signal gets fewer tags rather than wrong ones.
 */
export function classifyHeuristic(input: TagInput): TagResult[] {
  const fields: [string, number][] = [
    [input.name, 2],
    [input.description.slice(0, 4000), 1],
    [input.caption ?? "", 1.5],
  ];
  const scores = new Map<string, number>();

  for (const tag of TAG_TAXONOMY) {
    let hits = 0;
    for (const kw of tag.kw) {
      const re = kwRe(kw);
      for (const [text, fw] of fields) {
        if (!text) continue;
        const n = text.match(re)?.length ?? 0;
        if (n) hits += fw * Math.min(n, 3);
      }
    }
    if (hits > 0) scores.set(tag.slug, Math.log2(1 + hits) * (tag.w ?? 1));
  }

  const prior = (value: string | null | undefined, boost: number) => {
    const key = (value ?? "").toLowerCase().trim();
    for (const slug of GENRE_TAG_MAP[key] ?? []) scores.set(slug, (scores.get(slug) ?? 0) + boost);
  };
  prior(input.subgenre, 1.6);
  prior(input.genre, 0.8);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[1] ?? 0;
  const FLOOR = 1.0;
  return ranked
    .filter(([, s]) => s >= FLOOR && s >= top * 0.33)
    .slice(0, 5)
    .map(([slug, s]) => ({ slug, confidence: Math.round(Math.min(1, s / Math.max(top, 2.5)) * 100) / 100, source: "heuristic" as const }));
}

/** LLM classifier constrained to the taxonomy; falls back to heuristic on any failure. */
export async function classifyTags(input: TagInput): Promise<TagResult[]> {
  const allowed = TAG_TAXONOMY.map((t) => `${t.slug} (${t.label})`).join(", ");
  const out = await llmJson<{ tags: { slug: string; confidence: number }[] }>(
    `You tag Roblox games with gameplay mechanics and vibes for a discovery app. Only use slugs from this list: ${allowed}. Pick 2 to 5 that describe the actual gameplay. Skip anything you're unsure of — fewer accurate tags beat more vague ones.`,
    `Game: ${input.name}\nRoblox genre: ${input.genre ?? "unknown"}${input.subgenre ? ` / ${input.subgenre}` : ""}\nDescription:\n${input.description.slice(0, 2500)}\n${input.caption ? `\nSocial caption that recommended it:\n${input.caption.slice(0, 800)}` : ""}\n\nReturn {"tags":[{"slug":"...","confidence":0-1}]}`,
  );
  const valid = out?.tags?.filter((t) => TAG_BY_SLUG[t.slug]).slice(0, 5);
  if (valid && valid.length >= 1) {
    return valid.map((t) => ({ slug: t.slug, confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0.7)), source: "llm" }));
  }
  return classifyHeuristic(input);
}
