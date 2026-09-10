/**
 * Modèle de l'environnement partagé : la Marée actuelle. Le sous-système
 * des Eaux (paquet séparé, révélation, effet environnemental parallèle à
 * la Marée) a été abandonné par le design (Notion "Règles & mécaniques
 * verrouillées", 2026-09-10) : ses anciennes fonctions sont absorbées par
 * la Marée elle-même — son état, sa durée, et son **orientation**.
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

/**
 * Orientation de la Marée (cadrage 2026-09-10) : Montante progresse d'un
 * état vers les Abysses à la prochaine transition, Descendante progresse
 * d'un état vers le Calme. La Marée oscille entre Calme et Abysses plutôt
 * que de boucler — voir `naturalOrientationFor`.
 */
export type TideOrientation = "montante" | "descendante";

/**
 * État suivant selon l'orientation courante : Montante avance vers les
 * Abysses, Descendante recule vers le Calme. Contrairement à l'ancien
 * modèle cyclique, la progression ne boucle jamais silencieusement sur
 * elle-même : elle est bornée (`Math.min`/`Math.max`) à Abysses/Calme,
 * l'inversion naturelle d'orientation à ces bornes étant gérée séparément
 * par `naturalOrientationFor`.
 */
export function advanceTideState(state: TideStateName, orientation: TideOrientation): TideStateName {
  const index = TIDE_STATES_ORDER.indexOf(state);
  const nextIndex =
    orientation === "montante"
      ? Math.min(index + 1, TIDE_STATES_ORDER.length - 1)
      : Math.max(index - 1, 0);
  return TIDE_STATES_ORDER[nextIndex]!;
}

/**
 * Orientation naturelle imposée par un état borne : à Calme elle devient
 * Montante, à Abysses elle devient Descendante (cadrage 2026-09-10).
 * Dans tout autre état, l'orientation courante est conservée telle quelle
 * (`fallback`) — seules les bornes du cycle la réinitialisent d'office.
 */
export function naturalOrientationFor(state: TideStateName, fallback: TideOrientation): TideOrientation {
  if (state === "calme") return "montante";
  if (state === "abysses") return "descendante";
  return fallback;
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
  /** Sens de la prochaine transition — visible des deux joueurs (cadrage 2026-09-10). */
  tideOrientation: TideOrientation;
  tideIntensity: number;
  pendingTideModifiers: PendingTideModifier[];
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
