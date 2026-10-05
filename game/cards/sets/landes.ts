import type { CardDefinition } from "@/game/cards/types";

/**
 * LANDES — premières cartes du type (Notion « Boosters & économie de
 * collection » § Terrains Légendaires, et Roadmap « Système de Terrain »,
 * 05/10/2026 ; le type s'appelle Lande).
 *
 * Une Lande se pose dans l'emplacement PARTAGÉ du centre du plateau, pas
 * dans un Slot : une seule pour les deux joueurs, la nouvelle chasse
 * l'ancienne au Cimetière de son propriétaire. Ses règles valent pour les
 * deux camps (`CardDefinition.lande`, `game/rules/lande.ts`).
 *
 * Légendaires, ×2 par deck : leur rareté dit qu'elles transforment la
 * partie, la limite évite qu'une partie devienne une suite de Landes. Elles
 * sont semées dans trois pools différents plutôt que dans un booster dédié.
 *
 * Coûts décidés le 05/10/2026 (absents de Notion jusque-là) : Vallée de
 * verre 4, Chaîne de construction 3, Pluie corrosive 3.
 *
 * Fichier à part : ces définitions ne dépendent que des types, et `core.ts`
 * les verse dans `CORE_SET`. Les lots de diffusion sont écrits ici en
 * toutes lettres — importer `core.ts` créerait un cycle au chargement.
 */
export const LANDES_SET: CardDefinition[] = [
  {
    id: "pluie-corrosive",
    name: "Pluie corrosive",
    type: "lande",
    cost: 3,
    maxCopies: 2,
    text: "Durée : 3 tours de table. Les permanents perdent Garde.",
    lande: { durationTableTurns: 3, removesKeywords: ["garde"] },
  },
  {
    id: "chaine-de-construction",
    name: "Chaîne de construction",
    type: "lande",
    setCode: "necessaire-du-marin",
    cost: 3,
    maxCopies: 2,
    text:
      "Durée : 3 tours de table. Chaque joueur ne peut invoquer qu'un seul Marin ou une seule Créature par tour. " +
      "Aucun effet ne peut dépasser cette limite.",
    lande: { durationTableTurns: 3, unitArrivalsPerTurn: 1 },
  },
  {
    id: "vallee-de-verre",
    name: "Vallée de verre",
    type: "lande",
    setCode: "eclats-en-selle",
    cost: 4,
    maxCopies: 2,
    text: "Durée : 2 tours de table. À la fin de chaque tour de table, tous les permanents en jeu subissent 1 dégât.",
    lande: { durationTableTurns: 2, damageAllPermanentsEachTableTurn: 1 },
  },
];
