import { nextFloat, type RngState } from "@/game/rng";

/**
 * FINITIONS DE CARTE (16/10/2026) — des versions TRÈS RARES d'une carte,
 * qui ne changent RIEN au jeu : seulement l'illustration, retravaillée par
 * des filtres (aucun visuel supplémentaire à produire, comme la brillance
 * des Légendaires et le reflet des Abyssales).
 *
 *  - Classique  — l'illustration originale (toute carte, toujours) ;
 *  - Monochrome — noir et blanc ;
 *  - Star Foil  — éclats étoilés holographiques ;
 *  - Prismatic  — reflets prismatiques ;
 *  - Negative   — couleurs inversées.
 *
 * N'IMPORTE QUELLE carte peut sortir d'un booster dans une finition rare :
 * le tirage a lieu APRÈS celui des cartes (`drawBooster`), carte par carte,
 * indépendamment de leur rareté. Une finition est une donnée de COLLECTION
 * (table `player_card_finishes`), jamais de partie : le moteur ne la lit pas.
 */
export type CardFinish = "classique" | "monochrome" | "star-foil" | "prismatic" | "negative";

/** Les finitions RARES, de la moins rare à la plus rare. */
export type RareCardFinish = Exclude<CardFinish, "classique">;

export const CARD_FINISHES: readonly CardFinish[] = ["classique", "monochrome", "star-foil", "prismatic", "negative"];
export const RARE_CARD_FINISHES: readonly RareCardFinish[] = ["monochrome", "negative", "star-foil", "prismatic"];

export const CARD_FINISH_LABELS: Record<CardFinish, string> = {
  classique: "Classique",
  monochrome: "Monochrome",
  "star-foil": "Star Foil",
  prismatic: "Prismatic",
  negative: "Negative",
};

export const CARD_FINISH_DESCRIPTIONS: Record<CardFinish, string> = {
  classique: "Illustration originale",
  monochrome: "Noir et blanc",
  "star-foil": "Éclats étoilés holographiques",
  prismatic: "Reflets prismatiques",
  negative: "Couleurs inversées",
};

/**
 * Chance qu'UNE carte tirée sorte dans chaque finition rare. TRÈS rare par
 * construction : environ 1 carte sur 260 a une finition rare, soit un
 * booster de huit cartes sur trente-trois environ ; une Prismatic, la plus
 * rare, un booster sur trois cents. À ajuster ici seulement.
 */
export const CARD_FINISH_ODDS: Record<RareCardFinish, number> = {
  monochrome: 1 / 600,
  negative: 1 / 900,
  "star-foil": 1 / 1500,
  prismatic: 1 / 2500,
};

/** Chance totale qu'une carte tirée ait une finition rare. */
export function rareFinishChance(): number {
  return RARE_CARD_FINISHES.reduce((sum, finish) => sum + CARD_FINISH_ODDS[finish], 0);
}

/**
 * Tire la finition d'une carte — un seul nombre pour toutes les finitions,
 * donc jamais deux à la fois. `undefined` : la carte est Classique.
 */
export function rollCardFinish(state: RngState): { finish: RareCardFinish | undefined; nextState: RngState } {
  const draw = nextFloat(state);
  let seuil = 0;
  // De la plus rare à la moins rare : l'ordre ne change pas les chances, il
  // garde seulement les plus rares en tête du segment tiré.
  for (const finish of [...RARE_CARD_FINISHES].reverse()) {
    seuil += CARD_FINISH_ODDS[finish];
    if (draw.value < seuil) return { finish, nextState: draw.nextState };
  }
  return { finish: undefined, nextState: draw.nextState };
}

/** Rang de rareté d'une finition (Classique 0, Prismatic 4) : la collection montre la plus rare possédée. */
export function finishRank(finish: CardFinish): number {
  return finish === "classique" ? 0 : RARE_CARD_FINISHES.indexOf(finish) + 1;
}

/** La finition la plus rare d'une liste, Classique si elle est vide. */
export function rarestFinish(finishes: readonly CardFinish[] | undefined): CardFinish {
  return (finishes ?? []).reduce<CardFinish>((best, f) => (finishRank(f) > finishRank(best) ? f : best), "classique");
}

export function isCardFinish(value: unknown): value is CardFinish {
  return typeof value === "string" && (CARD_FINISHES as readonly string[]).includes(value);
}
