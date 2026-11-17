import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toListDTO } from "@/lib/lists";
import { lists, vault } from "@/lib/store";
import { SaveToVaultButton } from "@/components/SaveToVaultButton";
import { DropGameArt, DropStats, DropLaunch } from "@/components/DropParts";
import { GEM_MAX_CCU } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const list = lists.bySlug(slug);
  return list ? toListDTO(list) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const list = await load((await params).slug);
  return list ? { title: `${list.title} · BloxVault Drop`, description: list.description || `${list.items.length} Roblox games curated on BloxVault` } : {};
}

/** Public, shareable Drop page — each card has 1-click "Save to My Vault". */
export default async function DropPage({ params }: Props) {
  const { slug } = await params;
  const list = await load(slug);
  if (!list) notFound();
  const vaulted = vault.vaultedAmong(list.items.map((i) => i.game.universeId));
  const underCap = list.items.filter((i) => i.game.ccu < GEM_MAX_CCU).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
      <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100">
        <ArrowLeft className="size-3.5" /> BloxVault
      </Link>
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gem">A Drop by {list.authorName}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight lg:text-3xl">{list.title}</h1>
        {list.description && <p className="mt-2 text-sm leading-relaxed text-ink-300">{list.description}</p>}
        <p className="mt-3 text-xs text-ink-400">
          {list.items.length} games · {underCap} under {GEM_MAX_CCU.toLocaleString()} players right now
        </p>
      </header>

      <ol className="space-y-3">
        {list.items.map((item, i) => (
          <li key={item.game.universeId} className="flex gap-4 rounded-2xl bg-ink-900 p-3 ring-1 ring-ink-800">
            <span className="w-5 shrink-0 pt-1 text-right text-sm font-bold tabular-nums text-ink-600">{i + 1}</span>
            <DropGameArt game={item.game} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{item.game.name}</h2>
              <DropStats game={item.game} />
              {item.blurb && <p className="mt-1.5 text-sm leading-snug text-ink-300">{item.blurb}</p>}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <SaveToVaultButton universeId={item.game.universeId} initiallyVaulted={vaulted.has(item.game.universeId)} />
                <DropLaunch placeId={item.game.rootPlaceId} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
