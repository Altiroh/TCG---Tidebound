import type { CardType } from "@/game";
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
