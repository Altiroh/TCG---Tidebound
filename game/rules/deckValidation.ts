import { getCardDefinition } from "@/game/cards/sets/core";
import { getMaxCopies } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import { RULES } from "@/game/rules/constants";
import { fail, ok, type ValidationResult } from "@/game/rules/validation";
import type { DeckList } from "@/game/cards/decks/preconstructed";

/**
 * Valide un deck personnel côté serveur (cadrage "Règles & mécaniques
 * verrouillées", section "Deck & main", et `TCG_DATABASE.md` : "ne jamais
 * faire confiance à un `is_valid` envoyé par le client").
 *
 * - Taille entre `RULES.DECK_SIZE_MIN` et `RULES.DECK_SIZE_MAX`.
 * - Navire valide.
 * - Chaque carte existe et respecte SA limite d'exemplaires
 *   (`getMaxCopies` — jamais dérivée de la rareté).
 *
 * Ne vérifie PAS la possession réelle des cartes par le joueur (collection
 * hors périmètre du moteur pour l'instant) ni le statut actif/autorisé des
 * cartes dans le format courant.
 */
export function validateDeckList(deck: DeckList): ValidationResult {
  if (deck.cardIds.length < RULES.DECK_SIZE_MIN || deck.cardIds.length > RULES.DECK_SIZE_MAX) {
    return fail(
      `Le deck doit contenir entre ${RULES.DECK_SIZE_MIN} et ${RULES.DECK_SIZE_MAX} cartes (actuellement ${deck.cardIds.length}).`
    );
  }

  try {
    getShipDefinition(deck.shipId);
  } catch {
    return fail(`Navire inconnu: ${deck.shipId}`);
  }

  const counts = new Map<string, number>();
  for (const cardId of deck.cardIds) {
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }

  for (const [cardId, count] of counts) {
    let def;
    try {
      def = getCardDefinition(cardId);
    } catch {
      return fail(`Carte inconnue: ${cardId}`);
    }
    const max = getMaxCopies(def);
    if (count > max) {
      return fail(`"${def.name}" est limitée à ${max} exemplaire(s) dans un deck (${count} trouvés).`);
    }
  }

  return ok();
}
