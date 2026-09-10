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

  // --- Raison (cadrage "Navires, Slots et Raison") -----------------------
  /** Emplacements par défaut si un Navire ne précise rien (les vrais Navires ont 4/5/6). */
  DEFAULT_SLOT_COUNT: 5,
  /** Raison max "standard" si un Navire ne la précise pas. */
  DEFAULT_REASON_MAX: 10,
  /** Récupération naturelle de Raison à chaque début de tour. Volontairement faible. */
  REASON_REGEN_PER_TURN: 1,
  /** Tant que la Raison d'un joueur est à 0, il perd ceci en Ancrage à chaque début de SON tour. */
  ANCHOR_LOSS_WHEN_REASON_ZERO: 1,
  /**
   * Échelle de coûts en Raison verrouillée par le cadrage : 1-5 = standard,
   * 6 = exceptionnel, 7 = extrême. Le moteur ne plafonne pas le coût d'une
   * carte à 7 (ce n'est pas une règle dure), c'est une convention de design.
   */
  COST_SCALE_MAX_STANDARD: 5,
  COST_SCALE_EXCEPTIONAL: 6,
  COST_SCALE_EXTREME: 7,

  // --- Marée (placeholders explicitement provisoires — cadrages listent
  // "durée définitive", "Intensité maximale", "dégâts standards" comme
  // encore ouverts) -------------------------------------------------------
  /** Durée (en tours JOUÉS, tous joueurs confondus) de chaque état avant progression. */
  TIDE_STATE_DURATION: { calme: 2, houle: 2, tempete: 1, abysses: 1 } as Record<TideStateName, number>,
  /** Intensité de départ à l'entrée dans un nouvel état de Marée. */
  TIDE_BASE_INTENSITY: 1,
  /**
   * Dégâts d'Ancrage infligés aux DEUX joueurs à CHAQUE tour où la Marée
   * est dans cet état, multipliés par l'Intensité courante (Calme/Houle :
   * pas de dégâts de base dans cette hypothèse).
   */
  TIDE_ANCHOR_DAMAGE: { tempete: 2, abysses: 3 } as Partial<Record<TideStateName, number>>,
  /** Perte de Raison infligée aux DEUX joueurs à chaque tour en Abysses (cadrage section 7 : "Abysses : perte de Raison"). */
  TIDE_REASON_DAMAGE: { abysses: 1 } as Partial<Record<TideStateName, number>>,
} as const;
