import type { EffectDefinition } from "@/game/effects/types";
import type { TideAffinity } from "@/game/environment/types";
import type { TriggerType } from "@/game/triggers/types";

export type CardId = string;

/**
 * Taxonomie verrouillée par le cadrage ("Mécaniques verrouillées" section
 * 12-19) : Marin et Créature sont des permanents "unité" (attaquent,
 * défendent) ; Équipement est permanent par défaut mais peut être
 * consommable (`permanent: false`) ; Structure et Anomalie sont des
 * permanents non-unité ; Action se résout puis part au cimetière ;
 * Réaction se joue en chaîne hors de son propre tour (système de
 * chaînes/réactions volontairement pas encore implémenté — voir
 * `game/effects/resolveEffect.ts`).
 */
export type CardType =
  | "marin"
  | "creature"
  | "equipement"
  | "structure"
  | "action"
  | "reaction"
  | "anomalie";

/** Types de carte considérés comme des unités (peuvent occuper un Slot de combat, attaquer). */
export const UNIT_CARD_TYPES: readonly CardType[] = ["marin", "creature"];

/** Types de carte qui restent en jeu comme permanents (par défaut) après résolution. */
export const PERMANENT_CARD_TYPES: readonly CardType[] = [
  "marin",
  "creature",
  "equipement",
  "structure",
  "anomalie",
];

/** Une capacité déclenchée : "quand X se produit, résous ces effets". */
export interface TriggeredAbility {
  trigger: TriggerType;
  effects: EffectDefinition[];
  /** Texte optionnel affiché dans l'UI ; pas de logique attachée. */
  description?: string;
  /** Filtre supplémentaire pour `onTideStateEntered` : ne se déclenche que pour cet état. */
  condition?: { tideState?: import("@/game/environment/types").TideStateName };
}

/**
 * Définition statique d'une carte : uniquement des données. Aucune carte
 * ne doit porter de logique spécifique en dur dans le code du moteur —
 * tout comportement passe par la combinaison d'effets génériques et de
 * triggers ci-dessous.
 */
export interface CardDefinition {
  id: CardId;
  name: string;
  type: CardType;
  /** Sous-catégorie optionnelle et extensible (ex: "poisson" pour une Créature). */
  subtype?: string;
  cost: number;
  /** Texte d'ambiance / règles, affiché tel quel dans l'UI. */
  text?: string;

  // Statistiques de base, uniquement pertinentes pour les unités (Marin/Créature).
  attack?: number;
  health?: number;

  /**
   * Pour les Équipements uniquement : `true` (par défaut) = reste en jeu
   * indéfiniment ; `false` = consommable, part au cimetière après son
   * effet (cadrage section 13/19).
   */
  permanent?: boolean;

  /** Mots-clés universels extensibles (ex: "garde" — redirige les attaques visant le Navire). */
  keywords?: string[];

  /**
   * Étiquettes libres utilisées par les Eaux et Navires pour cibler des
   * familles de cartes sans coupler le moteur à une liste fermée de
   * catégories (ex: "equipement", "brume", "abyssal", "observation").
   * Voir cadrage section 16 : catégories encore ouvertes.
   */
  tags?: string[];

  /** Variation de statistiques/activité selon l'état de Marée courant. */
  tideAffinity?: TideAffinity;

  /** Effets résolus immédiatement lorsque la carte est jouée. */
  onPlayEffects?: EffectDefinition[];

  /** Capacités déclenchées par des événements de jeu ultérieurs. */
  abilities?: TriggeredAbility[];
}

/**
 * Une carte résolue reste-t-elle en jeu comme permanent, ou part-elle
 * directement au cimetière après résolution (Action/Réaction, ou
 * Équipement explicitement `permanent: false`) ?
 */
export function isPermanentCard(def: CardDefinition): boolean {
  if (!PERMANENT_CARD_TYPES.includes(def.type)) return false;
  if (def.type === "equipement") return def.permanent !== false;
  return true;
}

export function hasKeyword(def: CardDefinition, keyword: string): boolean {
  return def.keywords?.includes(keyword) ?? false;
}

export interface CardInstance {
  /** Identifiant unique de cet exemplaire physique de carte, pour la partie en cours. */
  instanceId: string;
  cardId: CardId;
  ownerId: string;

  /**
   * Dégâts marqués sur l'unité. Les statistiques effectives (attaque/vie,
   * activité) se calculent à la volée via `computeEffectiveStats`
   * (`game/cards/stats.ts`) plutôt que d'être stockées ici, puisqu'elles
   * dépendent aussi de l'état de Marée courant.
   */
  damageMarked: number;

  /** Modificateurs temporaires/persistants appliqués à cette instance. */
  modifiers: StatModifier[];

  /** Indique si l'unité peut attaquer ce tour (invocation le tour même, etc.). */
  summoningSick: boolean;

  /** Remis à `false` au début de chaque tour du contrôleur. */
  hasAttackedThisTurn: boolean;
}

export interface StatModifier {
  id: string;
  source: CardId | "unknown";
  attack: number;
  health: number;
  /** "temporary" retiré en fin de tour, "permanent" persiste. */
  duration: "temporary" | "permanent";
}
