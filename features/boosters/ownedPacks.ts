import type { BoosterInventoryEntry } from "@/features/boosters/actions";

/**
 * Un PAQUET, au sens de l'étagère : un exemplaire, pas un type.
 *
 * La base compte les boosters par type (`player_boosters.quantity`) ; le
 * joueur, lui, voit une pile de sachets. L'étagère montre donc un visuel
 * par exemplaire — c'est ce qui permet d'en attraper un et de le poser sur
 * le plan d'ouverture, geste qui n'a aucun sens sur un compteur.
 */
export interface OwnedPack {
  /** Clé stable pour le rendu : type + rang de l'exemplaire. */
  key: string;
  boosterId: string;
  name: string;
  cardCount: number;
  /** Rang de l'exemplaire dans sa pile, à partir de 1 — affiché quand on en a plusieurs. */
  copyIndex: number;
  /** Nombre total d'exemplaires de ce type. */
  copyCount: number;
  /** Date du dernier mouvement de la pile, en ISO ; `null` si la base ne la donne pas. */
  obtainedAt: string | null;
}

/** Une date absente ne doit jamais passer devant une date connue : elle est traitée comme la plus ancienne. */
function obtainedTime(entry: BoosterInventoryEntry): number {
  if (!entry.obtainedAt) return 0;
  const time = Date.parse(entry.obtainedAt);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * L'inventaire déplié en paquets individuels, DU PLUS RÉCENT AU PLUS
 * ANCIEN.
 *
 * La base ne date que la ligne du type (`updated_at`), pas chaque
 * exemplaire : les copies d'un même type se suivent donc, et c'est entre
 * TYPES que l'ordre se joue. À égalité de date (deux types obtenus dans la
 * même transaction, ou aucune date), on retombe sur le nom pour que
 * l'étagère ne change pas d'ordre d'un rendu à l'autre.
 */
export function ownedPacks(boosters: readonly BoosterInventoryEntry[]): OwnedPack[] {
  const held = boosters.filter((booster) => booster.owned > 0);

  const sorted = [...held].sort((a, b) => {
    const delta = obtainedTime(b) - obtainedTime(a);
    return delta !== 0 ? delta : a.name.localeCompare(b.name, "fr");
  });

  return sorted.flatMap((entry) =>
    Array.from({ length: entry.owned }, (_, index) => ({
      key: `${entry.boosterId}:${index}`,
      boosterId: entry.boosterId,
      name: entry.name,
      cardCount: entry.cardCount,
      copyIndex: index + 1,
      copyCount: entry.owned,
      obtainedAt: entry.obtainedAt,
    }))
  );
}
