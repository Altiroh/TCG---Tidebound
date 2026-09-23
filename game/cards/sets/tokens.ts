import type { CardDefinition } from "@/game/cards/types";

/**
 * Jetons ("Péons") — cartes créées UNIQUEMENT par un effet d'invocation.
 *
 * Volontairement hors de `CORE_SET` : c'est ce qui les exclut d'un seul
 * geste du seed `cards`, de la collection, du deckbuilding, des pools de
 * boosters et du garde-fou de rareté (`assertRarityCoverage`) — aucun de
 * ces systèmes n'a à connaître la notion de jeton, ils itèrent le
 * catalogue collectionnable. Elles restent en revanche dans
 * `CARD_DATABASE` (`sets/core.ts`), sans quoi `getCardDefinition` ne
 * saurait pas résoudre un jeton posé sur le plateau.
 *
 * Notion "Catalogue de cartes", Lot 10 : « Les Péons Cra-Poiscail de base
 * sont des 1/1 et ne comptent ni dans le deck ni dans la collection. Le
 * Péon Cra-Poiscail de base est destiné à utiliser plusieurs variantes
 * visuelles sous une même identité de gameplay. »
 */
export const TOKEN_SET: CardDefinition[] = [
  {
    id: "peon-cra-poiscail",
    name: "Péon Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    token: true,
    // Trois visuels pour une seule identité de gameplay : la variante est
    // tirée à l'invocation (RNG de la partie) et retenue sur l'instance,
    // cf. `CardInstance.illustrationVariant`.
    illustrationVariants: 3,
    cost: 0,
    attack: 1,
    health: 1,
  },
  // Lot 15 — Éclats en Selle. « Structure jeton — Résistance 1. Existe en
  // Rouge, Jaune, Bleu, Vert ou Violet. Compte comme cette couleur pour les
  // effets Chromatiques, mais n'émet aucun Signal. » Une carte par couleur :
  // la couleur est son identité de jeu, comme le Péon a la sienne.
  {
    id: "eclat-chromatique-rouge",
    name: "Éclat Chromatique Rouge",
    type: "structure",
    subtype: "eclat-chromatique",
    token: true,
    cost: 0,
    health: 1,
    chromatic: { colors: ["rouge"] },
    text: "Compte comme Rouge pour les effets Chromatiques. N'émet aucun Signal.",
  },
  {
    id: "eclat-chromatique-jaune",
    name: "Éclat Chromatique Jaune",
    type: "structure",
    subtype: "eclat-chromatique",
    token: true,
    cost: 0,
    health: 1,
    chromatic: { colors: ["jaune"] },
    text: "Compte comme Jaune pour les effets Chromatiques. N'émet aucun Signal.",
  },
  {
    id: "eclat-chromatique-bleu",
    name: "Éclat Chromatique Bleu",
    type: "structure",
    subtype: "eclat-chromatique",
    token: true,
    cost: 0,
    health: 1,
    chromatic: { colors: ["bleu"] },
    text: "Compte comme Bleu pour les effets Chromatiques. N'émet aucun Signal.",
  },
  {
    id: "eclat-chromatique-vert",
    name: "Éclat Chromatique Vert",
    type: "structure",
    subtype: "eclat-chromatique",
    token: true,
    cost: 0,
    health: 1,
    chromatic: { colors: ["vert"] },
    text: "Compte comme Vert pour les effets Chromatiques. N'émet aucun Signal.",
  },
  {
    id: "eclat-chromatique-violet",
    name: "Éclat Chromatique Violet",
    type: "structure",
    subtype: "eclat-chromatique",
    token: true,
    cost: 0,
    health: 1,
    chromatic: { colors: ["violet"] },
    text: "Compte comme Violet pour les effets Chromatiques. N'émet aucun Signal.",
  },
];
