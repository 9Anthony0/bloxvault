/**
 * Seeds BloxVault with 8 high-effort, mostly under-the-radar Roblox experiences using REAL
 * place IDs, then live-hydrates each through the same pipeline the app uses
 * (place → universe → games / votes / icons / thumbnails), so first run shows live CCU & approval.
 *
 * Run: npm run db:seed   (needs internet; re-run any time to refresh)
 */
import { lists, tags as tagStore, vault } from "../src/lib/store";
import { getOrHydrateByPlace, setGameTags } from "../src/lib/ingest";
import { DEMO_DROP_SLUG, type VaultStatus } from "../src/lib/constants";

interface SeedGame {
  placeId: number;
  name: string; // for logs only — real name comes from Roblox
  tags: string[];
  vault?: {
    status: VaultStatus;
    starRating?: number;
    p2wScore?: number;
    grindScore?: number;
    depthScore?: number;
    notes?: string;
    sourceUrl?: string;
    sourceCaption?: string;
  };
}

const SEEDS: SeedGame[] = [
  {
    placeId: 4111023553,
    name: "Deepwoken",
    tags: ["parry-combat", "permadeath", "roguelike", "hardcore", "open-world-rpg"],
    vault: { status: "LOVED", starRating: 4.5, p2wScore: 2, grindScore: 4, depthScore: 5, notes: "The parry window is the whole game. Wipe #3 hurt." },
  },
  {
    placeId: 6243699076,
    name: "The Mimic",
    tags: ["co-op-horror", "story-driven", "puzzle", "atmospheric-showcase"],
    vault: { status: "BEATEN", starRating: 4, p2wScore: 1, grindScore: 1, depthScore: 3, notes: "Jealousy chapter's sound design is unreal with headphones." },
  },
  {
    placeId: 21532277,
    name: "Notoriety",
    tags: ["heist", "stealth", "tactical-shooter"],
    vault: { status: "PLAYING", starRating: 4, p2wScore: 2, grindScore: 3, depthScore: 4 },
  },
  {
    placeId: 740581508,
    name: "Entry Point",
    tags: ["stealth", "heist", "tactical-shooter", "story-driven"],
    vault: {
      status: "VAULTED",
      notes: "Example entry — shows how the original clip link is kept with the save.",
      sourceUrl: "https://www.instagram.com/reel/EXAMPLE_REPLACE_ME/",
      sourceCaption: "solo stealth runs in this are so clean 🤫 game: Entry Point #roblox #stealth #underrated",
    },
  },
  {
    placeId: 3272915504,
    name: "Arcane Odyssey",
    tags: ["open-world-rpg", "magic-builds", "sailing", "pvp-arena", "exploration"],
    vault: { status: "VAULTED" },
  },
  {
    placeId: 6137321701,
    name: "Blair",
    tags: ["ghost-hunting", "co-op-horror", "atmospheric-showcase", "puzzle"],
    vault: { status: "VAULTED" },
  },
  // In the database (and a Drop) but NOT vaulted — these feed the recommendation shelf on first run.
  {
    placeId: 3016661674,
    name: "Rogue Lineage",
    tags: ["permadeath", "parry-combat", "hardcore", "roguelike", "pvp-arena"],
  },
  {
    placeId: 13438553315,
    name: "Decaying Winter",
    tags: ["wave-survival", "co-op-horror", "hardcore", "tactical-shooter"],
  },
];

async function main() {
  console.log(`Seeding ${SEEDS.length} games with live Roblox hydration…\n`);
  const universeByPlace = new Map<number, number>();

  for (const s of SEEDS) {
    try {
      const game = await getOrHydrateByPlace(s.placeId, { force: true });
      universeByPlace.set(s.placeId, game.universeId);
      // Curated tags replace whatever the auto-classifier produced
      tagStore.clear(game.universeId);
      await setGameTags(game.universeId, s.tags.map((slug, i) => ({ slug, confidence: 1 - i * 0.08, source: "seed" })));

      if (s.vault) {
        const { status, ...rest } = s.vault;
        const existing = vault.getByGame(game.universeId);
        if (existing) vault.update(existing.id, { status, ...rest });
        else vault.create(game.universeId, { status, ...rest });
      }
      console.log(
        `  ✓ ${game.name.padEnd(34)} universe ${String(game.universeId).padEnd(11)} ${String(game.ccu).padStart(6)} CCU  ${game.approvalPercentage.toFixed(1)}%  gem ${game.hiddenGemScore}`,
      );
    } catch (err) {
      console.warn(`  ✗ ${s.name} (place ${s.placeId}): ${(err as Error).message}`);
    }
  }

  // A starter Drop, so the shareable list page and "Save to My Vault" have something to show
  const dropItems = [3016661674, 13438553315, 740581508, 6137321701]
    .map((p) => universeByPlace.get(p))
    .filter((u): u is number => u !== undefined);
  const blurbs = [
    "If Deepwoken's parry clicked for you, this is where that design started. Three lives, then gone.",
    "Brutal 4-stack wave survival. Comms mandatory; the perk system is deeper than it looks.",
    "Full solo-stealth heists with a real story. Freelancer's Cut is the remaster.",
    "Phasmophobia-style evidence hunting. Go in with 3 friends at 2AM.",
  ];
  try {
    lists.delete(DEMO_DROP_SLUG);
  } catch {}
  if (dropItems.length) {
    lists.create({
      slug: DEMO_DROP_SLUG,
      title: "Underrated Hardcore Co-op Nights",
      description: "High-effort Roblox games that don't show up on the front page. No simulators, no pet eggs.",
      authorName: "BloxVault",
      items: dropItems.map((u, i) => ({ universeId: u, blurb: blurbs[i] ?? "" })),
    });
    console.log(`\n  ✓ Drop "Underrated Hardcore Co-op Nights" → /lists/underrated-hardcore-co-op-nights`);
  }

  const failed = SEEDS.length - universeByPlace.size;
  console.log(failed ? `\nDone with ${failed} failure(s) — check your network and re-run \`npm run db:seed\`.` : "\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
