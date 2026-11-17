import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Gem, Pencil, ThumbsUp, Users } from "lucide-react";
import { GameArt, GemBadge, LaunchButton, StarRating, StatusPill, TagChip, WebLink } from "@/components/ui";
import { SaveToVaultButton } from "@/components/SaveToVaultButton";
import { SUB_RATINGS, type SubRatingKey, type VaultStatus } from "@/lib/constants";
import { toGameDTO, type GameDTO } from "@/lib/dto";
import { compact, relativeTime } from "@/lib/format";
import { getOrHydrateByUniverse } from "@/lib/ingest";
import { computeHiddenGem } from "@/lib/scoring";
import { games, plays, vault, type GameRecord } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ universeId: string }> };

async function load(id: number): Promise<GameRecord | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  // Known games render instantly from the local DB; unknown ones are fetched from Roblox once.
  return games.get(id) ?? (await getOrHydrateByUniverse(id).catch(() => null));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = games.get(Number((await params).universeId));
  return g ? { title: `${g.name} · BloxVault`, description: g.description.slice(0, 160) } : {};
}

function similarTo(g: GameRecord, limit = 6): GameDTO[] {
  const mine = new Set(g.tags.filter((t) => t.confidence >= 0.25).map((t) => t.slug));
  if (!mine.size) return [];
  return games
    .listSynced()
    .filter((o) => o.universeId !== g.universeId)
    .map((o) => ({ o, overlap: o.tags.filter((t) => t.confidence >= 0.25 && mine.has(t.slug)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.o.hiddenGemScore - a.o.hiddenGemScore)
    .slice(0, limit)
    .map((x) => toGameDTO(x.o));
}

export default async function GamePage({ params }: Props) {
  const rec = await load(Number((await params).universeId));
  if (!rec) notFound();
  const g = toGameDTO(rec);
  const entry = vault.getByGame(g.universeId);
  const logs = entry ? plays.list(entry.id) : [];
  const gem = computeHiddenGem({ upVotes: g.upVotes, downVotes: g.downVotes, ccu: g.ccu, lastUpdated: g.lastUpdated ? new Date(g.lastUpdated) : null });
  const similar = similarTo(rec);
  const hero = g.thumbnailUrls[0] ?? g.iconUrl;

  return (
    <div className="min-h-dvh pb-16">
      <div className="relative h-56 overflow-hidden bg-ink-900 lg:h-80">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" className="size-full object-cover opacity-80" />
        ) : (
          <div className="size-full bg-[radial-gradient(ellipse_at_top_left,rgba(167,139,250,0.25),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(0,210,106,0.15),transparent_60%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
        <Link href="/" className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs text-ink-100 backdrop-blur hover:bg-black/70">
          <ArrowLeft className="size-3.5" /> BloxVault
        </Link>
      </div>

      <div className="mx-auto -mt-20 max-w-5xl px-4 lg:-mt-24">
        <header className="relative flex flex-wrap items-end gap-4">
          <GameArt game={g} variant="icon" className="size-24 rounded-2xl ring-4 ring-ink-950 lg:size-32" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-2xl font-bold tracking-tight lg:text-4xl">{g.name}</h1>
            <p className="mt-1 text-sm text-ink-300">
              by {g.creatorName || "unknown"}
              {g.genre && <span className="text-ink-400"> · {[g.genre, rec.subgenre].filter(Boolean).join(" / ")}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <LaunchButton placeId={g.rootPlaceId} />
            {!entry && <SaveToVaultButton universeId={g.universeId} initiallyVaulted={false} />}
            <WebLink placeId={g.rootPlaceId} />
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <main className="space-y-8">
            {/* Your log */}
            {entry ? (
              <section className="rounded-2xl bg-ink-900 p-4 ring-1 ring-ink-800">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Your log</h2>
                  <Link href={`/?open=${entry.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-850 px-2.5 py-1.5 text-xs ring-1 ring-ink-700 hover:ring-ink-600">
                    <Pencil className="size-3.5" /> Edit review
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill status={entry.status as VaultStatus} />
                  {entry.starRating ? <StarRating value={entry.starRating} size={18} readOnly /> : <span className="text-xs text-ink-400">Not rated yet</span>}
                  <span className="text-xs text-ink-400">Saved {relativeTime(entry.createdAt.toISOString())}</span>
                </div>
                {(["p2wScore", "grindScore", "depthScore"] as SubRatingKey[]).some((k) => entry[k] !== null) && (
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    {(["p2wScore", "grindScore", "depthScore"] as SubRatingKey[]).map((k) => (
                      <div key={k} className="rounded-lg bg-ink-850 px-2.5 py-2">
                        <dt className="text-[10px] uppercase tracking-wide text-ink-400">{SUB_RATINGS[k].label}</dt>
                        <dd className="mt-0.5 font-semibold">{entry[k] ? `${entry[k]}/5` : "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {entry.notes && <p className="mt-3 whitespace-pre-line text-sm text-ink-300">{entry.notes}</p>}
                {logs.length > 0 && (
                  <div className="mt-3 border-t border-ink-800 pt-3">
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Played {logs.length}×</h3>
                    <ul className="space-y-1 text-xs">
                      {logs.slice(0, 5).map((l) => (
                        <li key={l.id} className="flex gap-3">
                          <span className="w-24 shrink-0 tabular-nums text-ink-300">{new Date(l.playedOn + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          <span className="truncate text-ink-400">{l.note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {entry.sourceUrl && (
                  <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 block truncate text-xs text-sky-300 hover:underline">
                    Found via {entry.sourceUrl}
                  </a>
                )}
              </section>
            ) : null}

            {/* Screens */}
            {g.thumbnailUrls.length > 1 && (
              <section className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4">
                {g.thumbnailUrls.map((t) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={t} src={t} alt="" className="aspect-video w-80 shrink-0 snap-start rounded-xl object-cover ring-1 ring-ink-800" loading="lazy" />
                ))}
              </section>
            )}

            {g.tags.length > 0 && (
              <section>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Mechanics & vibes</h2>
                <div className="flex flex-wrap gap-1.5">
                  {g.tags.map((t) => (
                    <TagChip key={t.slug} label={t.label} />
                  ))}
                </div>
              </section>
            )}

            {g.description && (
              <section>
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">From the Roblox page</h2>
                <p className="max-h-96 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink-300">{g.description}</p>
              </section>
            )}

            {similar.length > 0 && (
              <section>
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Similar games you&apos;ve come across</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {similar.map((s) => (
                    <Link key={s.universeId} href={`/game/${s.universeId}`} className="group overflow-hidden rounded-xl bg-ink-900 ring-1 ring-ink-800 hover:ring-ink-600">
                      <GameArt game={s} className="aspect-video w-full" />
                      <div className="p-2.5">
                        <div className="truncate text-sm font-semibold group-hover:underline">{s.name}</div>
                        <div className="mt-0.5 text-[11px] text-ink-400">
                          {compact(s.ccu)} playing · {s.approvalPercentage.toFixed(0)}%
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </main>

          <aside className="space-y-4">
            <div className="rounded-2xl bg-ink-900 p-4 ring-1 ring-ink-800">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Gem className="size-4 text-gem" /> Hidden Gem Score
                </span>
                <GemBadge game={g} />
              </div>
              {[
                ["Quality (vote-adjusted)", gem.quality],
                ["Obscurity (player sweet spot)", gem.obscurity],
                ["Freshness (last update)", gem.freshness],
              ].map(([label, v]) => (
                <div key={label as string} className="mb-2">
                  <div className="flex justify-between text-[11px] text-ink-400">
                    <span>{label}</span>
                    <span className="tabular-nums">{Math.round((v as number) * 100)}</span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full bg-gem" style={{ width: `${(v as number) * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-ink-400">{g.isHiddenGem ? "✓ Passes both gem gates (≥85% approval, under 2,000 players)." : "Doesn't pass both gem gates right now."}</p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {[
                ["Playing now", compact(g.ccu), <span key="i" className="mr-1 inline-block size-1.5 rounded-full bg-go align-middle" />],
                ["Approval", `${g.approvalPercentage.toFixed(1)}%`, <ThumbsUp key="i" className="mr-1 inline size-3" />],
                ["Likes / dislikes", `${compact(g.upVotes)} / ${compact(g.downVotes)}`, null],
                ["Visits", compact(g.visits), null],
                ["Server size", g.maxPlayers ? `${g.maxPlayers} max` : "—", <Users key="i" className="mr-1 inline size-3" />],
                ["Updated", relativeTime(g.lastUpdated), <CalendarClock key="i" className="mr-1 inline size-3" />],
              ].map(([k, v, icon]) => (
                <div key={k as string} className="rounded-xl bg-ink-900 px-3 py-2.5 ring-1 ring-ink-800">
                  <dt className="text-[10px] uppercase tracking-wide text-ink-400">{k}</dt>
                  <dd className="mt-0.5 truncate font-semibold tabular-nums">
                    {icon}
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}
