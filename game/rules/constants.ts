import type { TideStateName } from "@/game/environment/types";

/**
 * Constantes de règles du MVP.
 *
 * Ce fichier distingue deux catégories :
 *  - des valeurs VERROUILLÉES par le cadrage de design (`design/*.md` dans
 *    le projet) — Raison standard, échelle de coûts, tailles de deck/main,
 *    durées de Marée provisoires ;
 *  - des valeurs PLACEHOLDER, encore explicitement "à définir/à verrouiller"
 *    d'après ces mêmes documents (dégâts exacts de Marée, etc.) — retenues
 *    ici comme hypothèse de travail raisonnable, à ajuster dès que le
 *    cadrage correspondant arrive.
 */
export const RULES = {
  // --- Main / Deck (cadrage "Règles & mécaniques verrouillées" +
  // `TCG_DATABASE.md`, verrouillage du 2026-09-08) ------------------------
  STARTING_HAND_SIZE: 5,
  MAX_HAND_SIZE: 7,
  SECOND_PLAYER_EXTRA_CARD: 1,
  /** Deck personnel valide : 40 cartes minimum, 50 maximum (pas une taille fixe). */
  DECK_SIZE_MIN: 40,
  DECK_SIZE_MAX: 50,
  /**
   * La limite d'exemplaires est désormais définie CARTE PAR CARTE
   * (`CardDefinition.maxCopies`, voir `getMaxCopies` dans
   * `game/cards/types.ts`) et n'est jamais dérivée de la rareté. Cette
   * constante n'existe plus : ne pas la réintroduire comme limite globale.
   */

  // --- Raison (cadrage "Navires, Slots et Raison" + Notion "Moteur de
  // partie — déroulement, Raison & chaînes d'effets", verrouillage du
  // 2026-09-10) -------------------------------------------------------
  /** Emplacements par défaut si un Navire ne précise rien (les vrais Navires ont 4/5/6). */
  DEFAULT_SLOT_COUNT: 5,
  /** Raison max "standard" si un Navire ne la précise pas. */
  DEFAULT_REASON_MAX: 10,
  /**
   * Un joueur ne commence PAS à sa Raison maximale : départ à 50% de
   * `reasonMax` (arrondi à l'entier inférieur — l'arrondi exact reste
   * listé comme "à définir" par le cadrage, ceci est l'hypothèse de
   * travail retenue en attendant).
   */
  STARTING_REASON_RATIO: 0.5,
  /** Récupération naturelle de Raison à chaque début de tour. Volontairement faible. */
  REASON_REGEN_PER_TURN: 1,
  /** Tant que la Raison d'un joueur est à 0 à la FIN de son tour, il perd ceci en Ancrage. */
  ANCHOR_LOSS_WHEN_REASON_ZERO: 1,
  /**
   * Échelle de coûts en Raison verrouillée par le cadrage : 1-5 = standard,
   * 6 = exceptionnel, 7 = extrême. Le moteur ne plafonne pas le coût d'une
   * carte à 7 (ce n'est pas une règle dure), c'est une convention de design.
   */
  COST_SCALE_MAX_STANDARD: 5,
  COST_SCALE_EXCEPTIONAL: 6,
  COST_SCALE_EXTREME: 7,

  // --- Marée (durées : placeholders explicitement provisoires — cadrages
  // listent "durée définitive", "Intensité maximale" comme encore ouverts.
  // Les malus par état ci-dessous sont en revanche VERROUILLÉS par la
  // Notion "Moteur de partie — déroulement, Raison & chaînes d'effets",
  // section "Malus globaux des Marées", verrouillage du 2026-09-10)
  // -------------------------------------------------------------------
  /** Durée (en tours JOUÉS, tous joueurs confondus) de chaque état avant progression. */
  TIDE_STATE_DURATION: { calme: 2, houle: 2, tempete: 1, abysses: 1 } as Record<TideStateName, number>,
  /** Intensité de départ à l'entrée dans un nouvel état de Marée. */
  TIDE_BASE_INTENSITY: 1,
  /**
   * Dégâts d'Ancrage infligés aux DEUX joueurs à CHAQUE tour où la Marée
   * est dans cet état, multipliés par l'Intensité courante. Calme et
   * Houle n'ont pas de malus d'Ancrage direct (Houle agit via la
   * maladie, voir `HOULE_SICKNESS_*` ci-dessous) ; les Abysses n'ont
   * PLUS de dégâts par tour ici — leur malus est un choc unique à
   * l'entrée, voir `ABYSSES_ENTRY_ANCHOR_LOSS`.
   */
  TIDE_ANCHOR_DAMAGE: { tempete: 1 } as Partial<Record<TideStateName, number>>,
  /** Perte de Raison infligée aux DEUX joueurs à chaque tour pour cet état. Plus aucun état n'en inflige pour l'instant (Abysses migré vers un malus continu de Raison max, voir plus bas). */
  TIDE_REASON_DAMAGE: {} as Partial<Record<TideStateName, number>>,

  // --- Houle : maladie aléatoire ("MALADE") -------------------------------
  /** Chance (sur 100) que la Houle rende MALADE une carte aléatoire du board, une fois par tour tant qu'elle est active. */
  HOULE_SICKNESS_CHANCE_PERCENT: 10,
  /** Dégâts subis par tour par une carte MALADE (Puissance de Vie/Résistance), tant que la Houle reste active. */
  HOULE_SICKNESS_DAMAGE: 1,

  // --- Abysses : choc d'entrée + malus continu de Raison max --------------
  /** Perte d'Ancrage infligée une seule fois, au moment où la Marée ENTRE dans les Abysses (pas à chaque tour). */
  ABYSSES_ENTRY_ANCHOR_LOSS: 2,
  /** Réduction de Raison maximale tant que la Marée reste dans les Abysses ; restaurée à la sortie. */
  ABYSSES_REASON_MAX_PENALTY: 2,
} as const;
