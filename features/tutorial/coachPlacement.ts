import type { AnchorRect } from "@/features/tutorial/useAnchorRect";

export interface Viewport {
  width: number;
  height: number;
}

export interface CoachPlacement {
  left: number;
  top: number;
  /** Côté de l'ancre où la fiche s'est posée — oriente la flèche. */
  side: "top" | "bottom" | "left" | "right";
}

/** Marge entre la fiche et l'ancre, et entre la fiche et le bord de l'écran. */
export const COACH_GAP = 16;
const EDGE = 12;

/**
 * Place la fiche du guide À CÔTÉ de la zone où le joueur doit agir.
 *
 * Règle : on choisit le côté qui offre le plus de place, en préférant
 * au-dessus / en dessous quand l'ancre est large (la main, la piste de
 * Marée) et à gauche / à droite quand elle est haute (la colonne de
 * droite). La fiche est ensuite ramenée dans l'écran — mieux vaut un
 * chevauchement partiel qu'une consigne hors champ.
 *
 * Fonction PURE : c'est elle qui est testée, pas le composant.
 */
export function placeCoach(anchor: AnchorRect, panel: { width: number; height: number }, viewport: Viewport): CoachPlacement {
  const space = {
    top: anchor.top,
    bottom: viewport.height - (anchor.top + anchor.height),
    left: anchor.left,
    right: viewport.width - (anchor.left + anchor.width),
  };

  // À CÔTÉ avant AU-DESSUS, toujours. Une fiche posée au-dessus d'une zone
  // large retombe forcément sur la rangée voisine — au-dessus de la main,
  // elle masque précisément les emplacements où la carte doit atterrir.
  // Sur les côtés, elle ne couvre rien de la ligne qu'elle commente.
  //
  // Les zones larges n'ont souvent pas la place sur les côtés : elles
  // basculent alors en haut ou en bas, ce qui reste le meilleur choix
  // restant. Celles qui l'ont (la main, qui commence après le Navire)
  // gagnent une fiche qui ne gêne pas.
  const order: CoachPlacement["side"][] = ["left", "right", "top", "bottom"];

  const needed = (side: CoachPlacement["side"]) =>
    (side === "top" || side === "bottom" ? panel.height : panel.width) + COACH_GAP;

  const side = order.find((candidate) => space[candidate] >= needed(candidate)) ?? bestSide(space, order);

  const centreX = anchor.left + anchor.width / 2 - panel.width / 2;
  const centreY = anchor.top + anchor.height / 2 - panel.height / 2;

  const raw =
    side === "top"
      ? { left: centreX, top: anchor.top - panel.height - COACH_GAP }
      : side === "bottom"
        ? { left: centreX, top: anchor.top + anchor.height + COACH_GAP }
        : side === "left"
          ? { left: anchor.left - panel.width - COACH_GAP, top: centreY }
          : { left: anchor.left + anchor.width + COACH_GAP, top: centreY };

  return {
    left: clamp(raw.left, EDGE, Math.max(EDGE, viewport.width - panel.width - EDGE)),
    top: clamp(raw.top, EDGE, Math.max(EDGE, viewport.height - panel.height - EDGE)),
    side,
  };
}

/** Aucun côté ne suffit : on prend le moins mauvais, celui qui a le plus de place. */
function bestSide(space: Record<CoachPlacement["side"], number>, order: CoachPlacement["side"][]): CoachPlacement["side"] {
  return order.reduce((best, candidate) => (space[candidate] > space[best] ? candidate : best), order[0]!);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
