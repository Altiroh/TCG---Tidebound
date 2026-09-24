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

import type { EffectDefinition } from "@/game/effects/types";
import type { GamePhase } from "@/game/state/types";

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
  /**
   * Effets de tour de la Marée reportés à la FIN du tour en cours (Ancre de
   * Dérive, Sabordée au changement d'état) : dégâts d'Ancrage/Raison, choc
   * d'entrée des Abysses, maladie de la Houle. Appliqués puis effacés par
   * `endTurn` (`applyTideTurnEffects`).
   */
  deferredTideEffects?: { previousTideState: TideStateName; tideState: TideStateName; intensity: number };
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
 * Capacité activable portée par le NAVIRE lui-même (0 ou 1 par Navire,
 * cf. Notion "Collection des Navires" — « 1 passif principal, 0 ou 1
 * capacité activable, 0 ou 1 faiblesse explicite »).
 *
 * Elle n'est ni un Objet, ni un Équipement, ni une carte du plateau : sa
 * source est le Navire, son suivi "déjà utilisée ce tour" vit donc sur le
 * JOUEUR (`PlayerState.shipAbility`) et non sur une `CardInstance`.
 *
 * Deux formes, et une seule primitive pour les deux :
 *  - **en un geste** — `onActivateEffects` résout tout de suite (un actif
 *    qui pioche, qui soigne l'Ancrage, qui pousse la Marée…) ;
 *  - **en deux temps** — `armedShot` : l'activation ne fait qu'ARMER, et
 *    c'est le tir, plus tard dans le tour, qui porte l'effet (Le Goliath —
 *    Canon de proue). Le coût se paie à l'armement : un canon armé et non
 *    tiré a coûté sa Raison pour rien.
 *
 * Les deux peuvent coexister sur une même capacité (un actif qui pioche
 * ET arme quelque chose) — rien ne l'interdit ici.
 */
export interface ShipActivatableAbility {
  /** Nom imprimé, tel qu'il apparaît sur la fiche du Navire (ex: « Canon de proue »). */
  name: string;
  /** Texte imprimé de la capacité — source de vérité, comme pour une carte. */
  text: string;
  /** Coût payé à l'ACTIVATION (jamais au tir : voir `armedShot`). */
  cost: { reason?: number };
  /** Phases pendant lesquelles l'activation est permise, sur le tour de son contrôleur. */
  activationPhases: readonly GamePhase[];
  /**
   * FENÊTRE spéciale d'activation, à la place des phases.
   *
   * `"tideAnnounced"` : la capacité ne s'active que pendant la fenêtre déjà
   * ouverte par le moteur entre l'ANNONCE d'une Marée et l'application de
   * ses effets (`GameState.pendingTideStep`) — celle de l'Ancre de Dérive.
   * C'est la seule façon d'écrire « après qu'une Marée a été annoncée mais
   * avant l'application de ses effets » (L'Errant — Changer de cap) sans
   * doubler le système de réaction : le Navire rejoint la file de priorité
   * de cette fenêtre, et s'y active ou s'y passe comme une carte.
   *
   * Absent : la capacité s'active normalement, pendant le tour de son
   * contrôleur et dans `activationPhases`.
   */
  activationWindow?: "tideAnnounced";
  /** Nombre d'activations autorisées par tour de son contrôleur. Défaut : 1. */
  activationsPerTurn?: number;
  /**
   * Nombre d'activations autorisées pour TOUTE LA PARTIE — la fréquence
   * « une fois par partie » des fiches Notion (Virage court, Changer de
   * cap, Tenir la ligne). Absent : aucune limite de partie, seule celle du
   * tour s'applique (Le Goliath).
   *
   * Compté par `game/state/oncePerGame.ts`, donc porté par l'état du
   * joueur et non par un drapeau maison : il survit à une reconnexion.
   */
  activationsPerGame?: number;
  /**
   * Nom de fichier dans `public/assets/ships/capacite/` — l'illustration du
   * hublot (ex: `goliath.webp`, la gueule du canon). Pour une capacité en
   * deux temps, c'est ce qu'on découvre sous les planches ; pour les
   * autres, elle est visible en permanence. Absent : fond de substitution.
   */
  illustration?: string;
  /**
   * FAMILLE de son jouée à l'activation — pas un fichier : deux capacités
   * qui font la même chose s'entendent pareil, et l'interface n'a jamais à
   * tester quel Navire est en jeu. Les fichiers sont dans `lib/sound.ts`.
   *
   * Une capacité en deux temps (`armedShot`) n'en porte pas : l'armement
   * est silencieux, c'est le TIR qui s'entend (impact d'attaque).
   */
  activationSound?: "heal" | "protect" | "tide";
  /** Effets résolus immédiatement à l'activation. Absent : l'activation ne fait qu'armer. */
  onActivateEffects?: EffectDefinition[];
  /** Tir différé : l'activation arme, un second geste tire. Absent : capacité en un seul geste. */
  armedShot?: ShipArmedShot;
}

/**
 * Le second temps d'une capacité en deux temps : une fois le Navire armé,
 * son contrôleur peut tirer — ou ne pas tirer. L'armement ne survit pas au
 * tour (il est horodaté, cf. `PlayerState.shipAbility`), et le tir le
 * consomme : au tour suivant, il faut re-payer et ré-armer.
 */
export interface ShipArmedShot {
  /** Phases pendant lesquelles le tir est permis. */
  phases: readonly GamePhase[];
  /**
   * Règles de ciblage du tir. `"attackRules"` : exactement celles d'une
   * attaque (`assertValidDefender`) — Garde à viser en priorité, Navire
   * adverse ciblable à défaut de Garde, permanent sans Résistance (un
   * Objet) exclu. Seul mode existant ; la clé est là pour que le jour où
   * un autre Navire vise autrement, ça se lise dans la donnée.
   */
  targeting: "attackRules";
  /**
   * Effets portés par le tir. Leur cible est `{ kind: "shotTarget" }` :
   * le permanent désigné, ou le Navire adverse si le joueur n'en a désigné
   * aucun. Ce sont des effets de CAPACITÉ, pas de combat — résolus par
   * `resolveEffect` et non par le pipeline d'attaque : donc aucune riposte,
   * aucune faiblesse d'attaque directe, et l'attaque d'aucune unité n'est
   * consommée.
   */
  effects: EffectDefinition[];
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
  /** Nom de fichier dans `public/assets/ships/illu/` (ex: `le-courlis.webp`) — absent tant que l'illustration n'existe pas encore. */
  illustration?: string;
  text?: string;
  passiveText?: string;
  /**
   * Capacité activable, en TEXTE seul — pour les Navires dont la capacité
   * n'est pas encore exprimable (toutes les « une fois par partie » :
   * Virage court, Changer de cap, Tenir la ligne). Purement informatif :
   * le moteur n'en applique rien. Une capacité réellement câblée passe par
   * `activatableAbility`, qui porte son propre texte.
   */
  capacityText?: string;
  /**
   * Capacité activable réellement appliquée par le moteur. Exclusive de
   * `capacityText` : un Navire n'en a qu'une, soit câblée, soit en attente.
   */
  activatableAbility?: ShipActivatableAbility;
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
  /** Réduction des dégâts d'Ancrage de Déraison (réglés une seule fois par tour, donc équivaut à "la première fois par tour"). Ex: Pénitence de La Religieuse. */
  deraisonDamageReduction?: number;
}
