/** Paliers de rareté — mêmes valeurs que l'enum SQL `public.card_rarity`. */
export type CardRarity = "common" | "uncommon" | "rare" | "abyssal";

/** Ordre croissant de rareté — sert aussi de repli quand un palier est vide. */
export const RARITY_ORDER: readonly CardRarity[] = ["common", "uncommon", "rare", "abyssal"];

/**
 * Règle d'un slot de booster — miroir d'une ligne de `booster_slots`.
 * Exactement l'un des deux champs est renseigné (contrainte SQL
 * `booster_slot_has_rule`).
 */
export interface BoosterSlotRule {
  slotIndex: number;
  /**
   * Rareté EXACTE garantie pour ce slot.
   *
   * Le cadrage dit « Rare ou mieux garantie » pour le slot 7 : la garantie
   * porte sur un minimum, et une Rare exacte la satisfait (« Le slot 7
   * garantit au minimum une Rare »). Le slot 7 est donc `rare` exact, et
   * toute la tension Abyssale reste concentrée sur le slot Profondeur + le
   * pity — pondérer le slot 7 avec les poids de palier (12/5) mettrait une
   * Abyssale dans ~29 % des boosters, incompatible avec un pity calibré sur
   * 10/20. Lecture VALIDÉE par le design le 2026-09-12.
   */
  guaranteedRarity?: CardRarity | null;
  /** Pondération multi-rareté (slot Profondeur). Poids relatifs, pas des pourcentages. */
  weightedRarities?: Partial<Record<CardRarity, number>> | null;
}

/** Une carte éligible au booster (miroir d'une ligne de `cards` filtrée). */
export interface BoosterPoolCard {
  id: string;
  rarity: CardRarity;
}

export interface DrawBoosterInput {
  /** Règles de slots, dans l'ordre d'ouverture. */
  slots: readonly BoosterSlotRule[];
  /** Cartes éligibles — déjà filtrées sur `is_collectible`/`is_enabled` par l'appelant. */
  pool: readonly BoosterPoolCard[];
  /** Collection actuelle du joueur — sert à la protection Abyssale. */
  ownedCardIds: ReadonlySet<string>;
  /** Compteur de pity : boosters ouverts depuis la dernière Abyssale, pour CE type de booster. */
  packsSinceAbyssal: number;
  /** Graine du RNG déterministe (`game/rng.ts`). */
  seed: number;
}

export interface DrawnCard {
  slotIndex: number;
  cardId: string;
  rarity: CardRarity;
  /** `true` si le joueur ne possédait pas encore cette carte avant l'ouverture. */
  isNew: boolean;
}

export interface DrawBoosterResult {
  cards: DrawnCard[];
  abyssalPulled: boolean;
  /** Compteur de pity à persister après cette ouverture. */
  nextPacksSinceAbyssal: number;
  /** Graine du RNG après tous les tirages. */
  nextSeed: number;
}
