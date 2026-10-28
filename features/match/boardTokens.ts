import { MARKER_RULES, type CardInstance, type MarkerId } from "@/game";

/**
 * JETONS d'une carte en jeu — ce qui ne dépend pas du rendu : comment ils
 * s'empilent sur le plateau, et comment le détail les compte.
 */

/** Jetons par pile : au-delà, une nouvelle pile commence à côté. */
export const TOKENS_PER_PILE = 3;

/** Les piles que font `count` jetons d'un même genre : 4 Souillures → [3, 1], une pile pleine et le début d'une autre. */
export function tokenPiles(count: number): number[] {
  return Array.from({ length: Math.ceil(Math.max(0, count) / TOKENS_PER_PILE) }, (_, i) => Math.min(TOKENS_PER_PILE, count - i * TOKENS_PER_PILE));
}

/**
 * Chaque marqueur dans le détail d'une carte en jeu : même nom que le
 * glossaire des mots-clés, pour ne pas l'expliquer deux fois.
 */
const MARKER_LEGEND: Record<MarkerId, { label: string; description: string }> = {
  mort: { label: "Mort", description: "Elle est aussi Mort-vivant. Si elle devait aller au Cimetière, elle retourne sous la pioche et perd le marqueur." },
  souillure: { label: "Souillure", description: "Souillée tant qu'elle en porte au moins un. Sans effet propre : certaines cartes les comptent." },
  "plus-un": { label: "Marqueur +1/+1", description: "+1 Puissance et +1 Résistance par marqueur." },
};

/** Les lignes du détail pour ces marqueurs : le nombre exact, que le plateau ne chiffre pas (« Souillure ×4 »). */
export function markerLegend(markers: CardInstance["markers"]): Array<{ label: string; description: string }> {
  return (Object.entries(markers ?? {}) as Array<[MarkerId, number]>)
    .filter(([, count]) => count > 0)
    .map(([marker, count]) => {
      const { label, description } = MARKER_LEGEND[marker];
      return { label: MARKER_RULES[marker].max > 1 ? `${label} ×${count}` : label, description };
    });
}

/** Le terme d'une ligne du détail, sans son compte (« Souillure ×4 » → « Souillure ») : ce que le glossaire n'a pas à répéter. */
export function legendTerm(label: string): string {
  return label.replace(/ ×\d+$/, "");
}
