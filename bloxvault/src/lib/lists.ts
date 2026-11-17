import type { ListRecord } from "./store";
import { toGameDTO, type GameDTO } from "./dto";

export interface ListDTO {
  id: string;
  slug: string;
  title: string;
  description: string;
  authorName: string;
  updatedAt: string;
  items: { position: number; blurb: string; game: GameDTO }[];
}

export function toListDTO(l: ListRecord): ListDTO {
  return {
    id: l.id,
    slug: l.slug,
    title: l.title,
    description: l.description,
    authorName: l.authorName,
    updatedAt: l.updatedAt.toISOString(),
    items: l.items.map((i) => ({ position: i.position, blurb: i.blurb, game: toGameDTO(i.game) })),
  };
}
