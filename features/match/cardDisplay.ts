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
};

export const GRAVEYARD_CAUSE_COLORS: Record<GraveyardCause, string> = {
  discarded: "text-slate-300",
  destroyed: "text-rose-300",
  scuttled: "text-amber-300",
  expired: "text-cyan-300",
};
