import { getCardDefinition, SHIP_DATABASE } from "@/game";
import { cardIllustrationUrl } from "@/features/decks/cardArtUrl";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";

/**
 * L'illustration posée au fond de la plaque de nom du Deck Builder.
 *
 * Elle vient du deck lui-même : c'est sa carte la plus CHÈRE qui le
 * résume — la pièce autour de laquelle on l'a monté. À coût égal, l'ordre
 * alphabétique tranche, pour que la plaque ne change pas selon l'ordre
 * dans lequel les cartes ont été ajoutées.
 *
 * Fonction PURE et déterministe : deux listes identiques donnent la même
 * image, et retirer une carte moins chère que la vedette ne fait pas
 * clignoter le fond.
 *
 * Deck vide (ou dont aucune carte n'est connue du catalogue) : le Navire
 * prend le relais — un deck a toujours un Navire, il n'y a donc jamais de
 * plaque nue.
 */
export function nameplateArtUrl(cardIds: readonly string[], shipId: string): string | null {
  return plateArtUrl(signatureCardId(cardIds), shipId);
}

/**
 * Même chose à partir d'une carte DÉJÀ choisie — quand le choix vient du
 * serveur (`PlayerDeckSummary.artCardId`) et qu'on ne dispose pas de la
 * liste complète à l'écran.
 */
export function plateArtUrl(cardId: string | null, shipId: string): string | null {
  if (cardId) return cardIllustrationUrl(cardId);

  const ship = SHIP_DATABASE.get(shipId);
  return ship?.illustration ? shipIllustrationUrl(ship.illustration) : null;
}

// Les URLs vivent dans `cardArtUrl.ts`, sans dépendance au moteur ; elles
// restent exportées d'ici pour les appelants existants.
export { cardIllustrationThumbUrl, cardIllustrationUrl } from "@/features/decks/cardArtUrl";

/** La carte qui résume le deck : coût le plus élevé, puis nom, puis identifiant. */
export function signatureCardId(cardIds: readonly string[]): string | null {
  let best: { id: string; cost: number; name: string } | null = null;

  for (const cardId of new Set(cardIds)) {
    let def;
    try {
      def = getCardDefinition(cardId);
    } catch {
      // Une carte retirée du catalogue ne doit pas priver la plaque de fond.
      continue;
    }
    const candidate = { id: cardId, cost: def.cost, name: def.name };
    if (!best || beats(candidate, best)) best = candidate;
  }

  return best?.id ?? null;
}

function beats(candidate: { id: string; cost: number; name: string }, best: { id: string; cost: number; name: string }): boolean {
  if (candidate.cost !== best.cost) return candidate.cost > best.cost;
  const byName = candidate.name.localeCompare(best.name, "fr");
  if (byName !== 0) return byName < 0;
  return candidate.id < best.id;
}
