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
 * Le module porte aussi les trois RÉPONSES aux Landes, arrivées le même
 * jour : Lever l'Ancre, Cartographe Opalin méfiant, Zone de repli.
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

  // --- Réponses aux Landes (Notion, Catalogue « Mini-lot anti-Terrain » et
  // Boosters « Réponses aux Terrains », 05/10/2026). Réparties dans trois
  // pools pour que la réponse ne dépende pas d'un seul produit. Le texte de
  // Notion dit « Terrain » : le type s'appelle Lande depuis le même jour.
  {
    id: "lever-lancre",
    name: "Lever l'Ancre",
    type: "objet",
    setCode: "necessaire-du-marin",
    cost: 3,
    maxCopies: 2,
    text: "Brisez cet Objet : détruisez la Lande active.",
    onBreakEffects: [{ type: "destroyLande", target: { kind: "allPlayers" } }],
  },
  {
    // Première carte de la famille Opalin, qui se lit sur la carte
    // (`showsArchetype`, « Créature · Opalin »). Notion écrit
    // « Cratographe » ; nom et illustration retenus le 05/10/2026 :
    // Cartographe.
    id: "cartographe-opalin-mefiant",
    name: "Cartographe Opalin méfiant",
    type: "creature",
    subtypes: ["mythique"],
    archetype: "opalin",
    showsArchetype: true,
    cost: 3,
    attack: 2,
    health: 4,
    text: "À son arrivée, si une Lande est active, réduisez de 1 sa durée restante.",
    onPlayEffects: [{ type: "shortenLande", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    // « Le joueur décide » : la fenêtre `onLandeStrike` s'ouvre juste avant
    // que la Lande n'agisse (coup de la Vallée de verre ; entame de tour
    // pour une Lande qui retire des mots-clés), et le joueur y désigne le
    // permanent épargné. Décision du 05/10/2026.
    id: "zone-de-repli",
    name: "Zone de repli",
    type: "structure",
    cost: 3,
    health: 4,
    maxCopies: 2,
    text: "La première fois à chaque tour qu'une Lande devrait affecter un permanent que vous contrôlez, ignorez cet effet pour ce permanent.",
    abilities: [
      {
        trigger: "onLandeStrike",
        mode: "optional",
        oncePerTurnKey: "zoneDeRepli",
        description: "Désignez un permanent que vous contrôlez : la Lande l'ignore ce tour-ci.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit" },
            amount: { kind: "flat", value: 0 },
            duration: "endOfTurn",
            ignoresLande: true,
          },
        ],
      },
    ],
  },
];
