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

/**
 * Bleu foncé classique de la charte (bandeau de nom des cadres Standard,
 * `FRAME_STANDARD_*.png`, échantillonné à #002756) — bordure de la valeur
 * de Coût (Raison), Puissance, Résistance et du nom, pour les détacher
 * nettement du fond derrière elles.
 */
export const CLASSIC_DARK_BLUE = "#002756";
export const STAT_VALUE_BORDER = `3px solid ${CLASSIC_DARK_BLUE}`;

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
