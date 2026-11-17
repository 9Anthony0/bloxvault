import { passesGemGates } from "./constants";

/**
 * Hidden Gem Score (0–100)
 * ------------------------------------------------------------
 *   score = 100 × (0.50·Q + 0.30·O + 0.20·F) × S × P
 *
 *   Q  Quality      Wilson lower bound (95%) of the like ratio, mapped so
 *                   70% → 0 and 95% → 1. Wilson stops a game with 12 likes / 0 dislikes
 *                   from outranking one with 40k likes / 2k dislikes.
 *   O  Obscurity    Peaks across the "healthy but hidden" band (≈25–600 CCU), eases off
 *                   toward dead (0 CCU = can't find lobbies) and falls to 0 at ~6k CCU.
 *   F  Freshness    1.0 if updated within 30 days, decays linearly to 0 at 18 months.
 *   S  Sample gate  Soft penalty for < 500 total votes (too little signal).
 *   P  Popularity   1.0 up to 2k CCU, easing to 0.4 at 20k+ CCU, so front-page hits
 *                   can't score like hidden gems on quality and freshness alone.
 *
 * `isHiddenGem` is the hard gate from the spec: approval ≥ 85% AND 5 ≤ CCU < 2,000 (and ≥100 votes so it isn't noise).
 */

export interface GemInputs {
  upVotes: number;
  downVotes: number;
  ccu: number;
  lastUpdated: Date | null;
  now?: Date;
}

export interface GemBreakdown {
  score: number;
  quality: number;
  obscurity: number;
  freshness: number;
  sample: number;
  popularity: number;
  approvalPercentage: number;
  wilson: number;
  isHiddenGem: boolean;
  daysSinceUpdate: number | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function approvalPct(up: number, down: number) {
  const total = up + down;
  return total === 0 ? 0 : (up / total) * 100;
}

/** Lower bound of Wilson score interval, z = 1.96 */
export function wilsonLowerBound(up: number, down: number, z = 1.96) {
  const n = up + down;
  if (n === 0) return 0;
  const p = up / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

export function obscurityFactor(ccu: number) {
  if (ccu <= 0) return 0.35; // possibly dead / between sessions
  const l = Math.log10(ccu + 1);
  const lo = Math.log10(25), hiStart = Math.log10(600), hiEnd = Math.log10(6000);
  if (l < lo) return 0.35 + 0.65 * (l / lo); // 1 → 25 CCU ramps up
  if (l <= hiStart) return 1;
  return clamp01(1 - (l - hiStart) / (hiEnd - hiStart));
}

/** 1.0 up to 2,000 CCU, then eases (log scale) to a floor of 0.4 at 20,000+ CCU. */
export function popularityPenalty(ccu: number) {
  if (ccu <= 2000) return 1;
  const t = clamp01((Math.log10(ccu) - Math.log10(2000)) / (Math.log10(20000) - Math.log10(2000)));
  return 1 - 0.6 * t;
}

export function freshnessFactor(lastUpdated: Date | null, now = new Date()) {
  if (!lastUpdated) return 0.5;
  const days = (now.getTime() - lastUpdated.getTime()) / 86_400_000;
  if (days <= 30) return 1;
  return clamp01(1 - (days - 30) / (540 - 30));
}

export function computeHiddenGem({ upVotes, downVotes, ccu, lastUpdated, now = new Date() }: GemInputs): GemBreakdown {
  const wilson = wilsonLowerBound(upVotes, downVotes);
  const quality = clamp01((wilson - 0.7) / 0.25);
  const obscurity = obscurityFactor(ccu);
  const freshness = freshnessFactor(lastUpdated, now);
  const votes = upVotes + downVotes;
  const sample = votes >= 500 ? 1 : 0.5 + 0.5 * (votes / 500);
  const popularity = popularityPenalty(ccu);
  const score = Math.round(100 * (0.5 * quality + 0.3 * obscurity + 0.2 * freshness) * sample * popularity * 10) / 10;
  const approvalPercentage = Math.round(approvalPct(upVotes, downVotes) * 10) / 10;
  return {
    score,
    quality,
    obscurity,
    freshness,
    sample,
    popularity,
    wilson,
    approvalPercentage,
    isHiddenGem: passesGemGates({ approvalPercentage, ccu, upVotes, downVotes }),
    daysSinceUpdate: lastUpdated ? Math.floor((now.getTime() - lastUpdated.getTime()) / 86_400_000) : null,
  };
}
