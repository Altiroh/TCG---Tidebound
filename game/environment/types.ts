/**
 * Modèle de l'environnement partagé : la Marée et les Eaux actuelles.
 *
 * Modèle "durée + intensité" verrouillé par le cadrage de design
 * (`design/*.md` dans le projet, notamment "Mécaniques verrouillées"
 * section 20-21) : chaque état de Marée dure un nombre de tours donné,
 * et porte une Intensité qui multiplie ses effets. Les valeurs exactes
 * (durées, dégâts de base) restent explicitement provisoires — voir
 * `game/rules/constants.ts`.
 */

export type TideStateName = "calme" | "houle" | "tempete" | "abysses";

export const TIDE_STATES_ORDER: readonly TideStateName[] = [
  "calme",
  "houle",
  "tempete",
  "abysses",
];

/** État suivant dans le cycle (les Abysses referment le cycle sur le Calme). */
export function nextTideState(state: TideStateName): TideStateName {
  const index = TIDE_STATES_ORDER.indexOf(state);
  return TIDE_STATES_ORDER[(index + 1) % TIDE_STATES_ORDER.length]!;
}

/**
 * Modificateurs en attente posés par des cartes sur la progression de la
 * Marée : "maintenez cet état" (ne décompte pas ce tour-ci) ou "doublez
 * les prochains dégâts environnementaux".
 */
export interface PendingTideModifier {
  kind: "maintain" | "amplify";
  /** Nombre de résolutions de ce modificateur avant qu'il s'épuise. */
  remainingTriggers: number;
}

export interface EnvironmentState {
  tideState: TideStateName;
  /** Nombre de tours restants avant que la Marée progresse vers l'état suivant. */
  tideRemainingTurns: number;
  tideIntensity: number;
  pendingTideModifiers: PendingTideModifier[];

  currentWaterId: string;
  /** Nombre de tours restants avant un nouveau tirage d'Eaux. */
  waterRemainingTurns: number;
}

/**
 * Table de variation d'une carte selon l'état de Marée courant (ex: le
 * Poisson-Lanterne gagne en puissance à mesure que la mer se déchaîne).
 */
export interface TideAffinityEntry {
  attack?: number;
  health?: number;
  /** La carte ne peut ni attaquer ni utiliser ses capacités dans cet état. */
  inactive?: boolean;
  /** La carte est détruite dès que la Marée atteint cet état. */
  destroyed?: boolean;
}

export type TideAffinity = Partial<Record<TideStateName, TideAffinityEntry>>;

/**
 * Eaux : région maritime commune aux deux joueurs, changée automatiquement
 * par le moteur (jamais une carte de deck). Référence des `tags` de carte
 * plutôt que des cardId précis pour rester extensible.
 */
export interface WaterDefinition {
  id: string;
  name: string;
  text?: string;
  /** Durée par défaut avant un nouveau tirage (cadrage : ~2-3 tours). */
  duration: number;
  costModifierByTag?: Array<{ tag: string; delta: number }>;
  tideDamageModifierByState?: Partial<Record<TideStateName, number>>;
  statModifierByTag?: Array<{ tag: string; attack?: number; health?: number }>;
}

/**
 * Navire principal : carte fixe, choisie au deck-building, jamais piochée
 * ni jouée depuis la main. Définit l'Ancrage max, la Raison max et le
 * nombre de Slots (4, 5 ou 6 selon le cadrage "Navires, Slots et Raison").
 */
export interface ShipDefinition {
  id: string;
  name: string;
  startingAnchor: number;
  reasonMax: number;
  slotCount: number;
  text?: string;
  passiveText?: string;
  /** Capacité activable (0 ou 1 par Navire) — texte informatif uniquement tant qu'il n'existe pas de système de capacités activables/une-fois-par-partie dans le moteur. */
  capacityText?: string;
  weaknessText?: string;
  /** Réduction forfaitaire des dégâts d'Ancrage environnementaux de cet état, par joueur. */
  resistanceByState?: Partial<Record<TideStateName, number>>;
  /** Aggravation forfaitaire des dégâts d'Ancrage environnementaux de cet état, par joueur. */
  weaknessByState?: Partial<Record<TideStateName, number>>;
  /** Aggravation forfaitaire des pertes de Raison environnementales de cet état, par joueur. */
  reasonWeaknessByState?: Partial<Record<TideStateName, number>>;
  /** Ex: "défaussez une carte" quand le joueur subit des dégâts de Tempête. */
  onTideDamageTakenByState?: Partial<Record<TideStateName, { discardCount?: number }>>;
  /** Dégâts supplémentaires subis par CE Navire lors d'une attaque directe (pas de defenderInstanceId). */
  directAttackWeakness?: number;
}
