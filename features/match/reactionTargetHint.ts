import { ARCHETYPE_LABELS, chosenTargetFilter, getCardDefinition } from "@/game";

/**
 * Consigne de ciblage d'une réaction en attente. Le moteur refuse une
 * cible hors filtre (`ChosenUnitFilter`) : autant dire au joueur ce qu'il
 * cherche plutôt que de le laisser cliquer au hasard et se faire éconduire.
 *
 * L'archétype est une donnée de moteur, jamais affichée SUR une carte
 * (décision du 2026-09-14) — mais le texte de la carte le nomme déjà
 * ("choisissez un Cra-Poiscail") : le répéter dans la consigne ne révèle
 * rien de plus.
 */
export function reactionTargetHint(cardId: string | undefined, abilityIndex: number): string {
  // La source a pu quitter le plateau entre-temps : consigne générique
  // plutôt qu'une exception sur un `cardId` inconnu.
  const effects = cardId ? (getCardDefinition(cardId).abilities?.[abilityIndex]?.effects ?? []) : [];
  const filter = chosenTargetFilter(effects);
  if (!filter?.archetype) return "Choisissez une cible sur le plateau.";
  const family = ARCHETYPE_LABELS[filter.archetype];
  return filter.excludeSource
    ? `Choisissez un AUTRE ${family} sur votre plateau.`
    : `Choisissez un ${family} sur votre plateau.`;
}
