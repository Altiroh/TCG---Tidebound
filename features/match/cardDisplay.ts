import { ARCHETYPE_LABELS } from "@/game/cards/archetypes";
import type { CardRarity } from "@/game/boosters/types";
import type { CardType, GraveyardCause } from "@/game";
import type { TideStateName } from "@/game";

/**
 * Contour de texte épais (halo sombre multi-couches) — pour tout texte
 * blanc posé directement sur une illustration ou un fond texturé,
 * plutôt qu'un simple `drop-shadow` fin. Utilisé sur le nom/coût/
 * statistiques de `CardTile` et sur les en-têtes de page qui reprennent
 * la même charte.
 */
export const THICK_TEXT_OUTLINE =
  "0 0 6px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,1), 0 2px 4px rgba(0,0,0,0.9)";

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  marin: "Marin",
  creature: "Créature",
  equipement: "Équipement",
  structure: "Structure",
  objet: "Objet",
  anomalie: "Anomalie",
};

export const TIDE_STATE_LABELS: Record<TideStateName, string> = {
  calme: "Calme",
  houle: "Houle",
  tempete: "Tempête",
  abysses: "Abysses",
};

export const TIDE_STATE_COLORS: Record<TideStateName, string> = {
  calme: "text-sky-300",
  houle: "text-cyan-300",
  tempete: "text-amber-300",
  abysses: "text-fuchsia-300",
};

/** Cause de sortie vers le cimetière (`CardInstance.graveyardCause`) — vue de défausse (`GraveyardViewer`). */
export const GRAVEYARD_CAUSE_LABELS: Record<GraveyardCause, string> = {
  discarded: "Défaussée",
  destroyed: "Détruite",
  scuttled: "Sabordée",
  expired: "Expirée",
  assembled: "Assemblée",
};

export const GRAVEYARD_CAUSE_COLORS: Record<GraveyardCause, string> = {
  discarded: "text-slate-300",
  destroyed: "text-rose-300",
  scuttled: "text-amber-300",
  expired: "text-cyan-300",
  assembled: "text-violet-300",
};

/**
 * Raretés de COLLECTION (`game/boosters/cardRarity.ts` → `CardRarity`).
 * Elles ne vivent pas dans `CardDefinition` — le moteur ne les lit jamais —
 * d'où ce libellé côté affichage uniquement.
 */
export const CARD_RARITY_LABELS: Record<CardRarity, string> = {
  common: "Commune",
  uncommon: "Peu commune",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
  abyssal: "Abyssale",
};

/**
 * Mots-clés universels — libellé affiché et règle associée.
 *
 * La règle est reprise MOT POUR MOT du cadrage verrouillé (README,
 * "Combat, Sabordage et Garde"), pas réécrite : une fiche de carte qui
 * paraphrase une règle finit par la contredire. Un mot-clé absent de cette
 * table reste affiché (son identifiant, capitalisé) mais sans info-bulle —
 * mieux vaut pas de définition qu'une définition inventée.
 */
export const KEYWORD_LABELS: Record<string, string> = {
  garde: "Garde",
};

export const KEYWORD_DESCRIPTIONS: Record<string, string> = {
  garde:
    "Tant que vous contrôlez un permanent portant Garde, une attaque adverse visant votre Navire doit d'abord viser ce permanent.",
};

/** Libellé d'un mot-clé, avec repli sur l'identifiant capitalisé pour un mot-clé pas encore documenté. */
export function keywordLabel(keyword: string): string {
  return KEYWORD_LABELS[keyword] ?? keyword.charAt(0).toUpperCase() + keyword.slice(1);
}

/**
 * Vocabulaire de jeu mis en valeur dans le texte d'une carte
 * (`CardDetailEffect`). Chaque entrée vient d'une source RÉELLE du projet,
 * jamais d'une liste écrite à la main pour faire joli :
 *   - les états de Marée        → `TIDE_STATE_LABELS` (ci-dessus) ;
 *   - les mots-clés             → `KEYWORD_LABELS` ;
 *   - les archétypes            → `ARCHETYPE_LABELS` (`game/cards/archetypes.ts`) ;
 *   - les grandeurs de gameplay → statistiques et ressources du moteur
 *     (`game/cards/stats.ts`, `game/state`), telles qu'elles sont écrites
 *     dans les textes du catalogue.
 */
export const GAME_TERMS: readonly string[] = [
  ...Object.values(TIDE_STATE_LABELS),
  ...Object.values(KEYWORD_LABELS),
  ...Object.values(ARCHETYPE_LABELS),
  "Puissance",
  "Résistance",
  "Raison",
  "Navire",
  "Marée",
];
