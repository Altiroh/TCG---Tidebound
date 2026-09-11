import type { EffectDefinition } from "@/game/effects/types";
import type { TideAffinity, TideStateName } from "@/game/environment/types";
import type { TriggerType } from "@/game/triggers/types";

export type CardId = string;

/**
 * Taxonomie verrouillée par le cadrage (`TCG_DATABASE.md` + "Règles &
 * mécaniques verrouillées", verrouillage du 2026-09-08) : Marin et
 * Créature sont des permanents "unité" (attaquent, défendent) ; Équipement
 * est permanent par défaut mais peut être consommable (`permanent: false`) ;
 * Structure, Objet et Anomalie sont des permanents non-unité.
 *
 * **Action et Réaction n'existent PAS comme types de carte** — changement
 * de cadrage : les effets ponctuels sont désormais portés par des
 * **Objets**, des permanents autonomes toujours visibles qui occupent un
 * Slot et se **brisent** (`game/actions/breakObject.ts`) pour résoudre
 * leur effet. Briser ≠ Saborder : ça ne déclenche ni `onDeath` ni
 * `onSaborde` sauf texte contraire.
 */
export type CardType = "marin" | "creature" | "equipement" | "structure" | "objet" | "anomalie";

/** Types de carte considérés comme des unités (peuvent occuper un Slot de combat, attaquer). */
export const UNIT_CARD_TYPES: readonly CardType[] = ["marin", "creature"];

/** Types de permanent qu'un Équipement peut cibler pour s'y attacher — jamais un autre Équipement/Objet/Anomalie (cadrage confirmé). */
export const EQUIPPABLE_CARD_TYPES: readonly CardType[] = ["marin", "creature", "structure"];

/** Types de carte qui restent en jeu comme permanents (par défaut) après résolution. */
export const PERMANENT_CARD_TYPES: readonly CardType[] = [
  "marin",
  "creature",
  "equipement",
  "structure",
  "objet",
  "anomalie",
];

/** Une capacité déclenchée : "quand X se produit, résous ces effets". */
export interface TriggeredAbility {
  trigger: TriggerType;
  effects: EffectDefinition[];
  /** Texte optionnel affiché dans l'UI ; pas de logique attachée. */
  description?: string;
  /** Filtre supplémentaire pour `onTideStateEntered` : ne se déclenche que pour cet état. */
  condition?: { tideState?: TideStateName };
  /**
   * "auto" (défaut) : résolution automatique par le moteur, aucune
   * décision du joueur (Notion "Moteur de partie", "Effets déclenchés
   * obligatoires"). "optional" : capacité facultative/réaction — ne se
   * résout JAMAIS automatiquement ; son contrôleur doit l'activer via une
   * fenêtre de réaction (`activateReaction`, `game/reactions/`) tant
   * qu'elle reste éligible, ou passer.
   */
  mode?: "auto" | "optional";
  /**
   * Coût à payer pour activer une capacité `optional` (ex: "tu peux
   * dépenser 1 Raison : ..."). Sans effet sur une capacité `auto`.
   */
  cost?: { reason?: number };
}

/**
 * Octroi conditionnel d'un mot-clé, réévalué en direct (jamais posé/retiré
 * explicitement) — `hasEffectiveKeyword` (`game/rules/validation.ts`) le
 * combine avec les mots-clés statiques (`CardDefinition.keywords`). Les
 * deux conditions sont indépendantes ; si les deux sont fournies, TOUTES
 * doivent être vraies (ET logique).
 */
export interface ConditionalKeywordGrant {
  keyword: string;
  /** Le CONTRÔLEUR de la carte (pas un joueur quelconque) a au plus cette Raison. */
  controllerReasonAtMost?: number;
  /** La Marée courante doit être l'un de ces états. */
  tideStateIn?: TideStateName[];
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
  /** Sous-catégorie optionnelle et extensible (ex: "poisson" pour une Créature, "Abyssal" pour un Marin/Créature). */
  subtype?: string;
  cost: number;
  /** Texte d'ambiance / règles, affiché tel quel dans l'UI. */
  text?: string;

  // Statistiques de base : Puissance/Résistance pour les unités (Marin/
  // Créature) ; Résistance seule pour Structure/Objet (`attack` absent).
  attack?: number;
  health?: number;

  /**
   * Pour les Équipements uniquement : `true` (par défaut) = reste en jeu
   * indéfiniment ; `false` = consommable, part au cimetière après son
   * effet.
   */
  permanent?: boolean;

  /** Mots-clés universels extensibles (ex: "garde" — redirige les attaques visant le Navire). */
  keywords?: string[];

  /**
   * Mots-clés obtenus seulement tant qu'une condition dynamique reste
   * vraie (ex: Chose des Hauts-Fonds, "Tant que vous avez 5 Raison ou
   * moins, elle gagne Garde") — jamais gravés dans `keywords`, réévalués à
   * chaque vérification (`hasEffectiveKeyword`, `game/rules/validation.ts`)
   * plutôt que posés/retirés explicitement à un moment précis.
   */
  conditionalKeywords?: ConditionalKeywordGrant[];

  /** Symétrique de `conditionalKeywords` : supprime un mot-clé STATIQUE (`keywords`) tant que la condition reste vraie (ex: Crabe de Fer, "Garde. Perd Garde pendant Calme."). */
  conditionalKeywordSuppressions?: ConditionalKeywordGrant[];

  /**
   * Pour une unité ATTAQUANTE : états de Marée pendant lesquels elle peut
   * attaquer le Navire adverse directement même si un permanent adverse
   * porte Garde (ex: Raie des Fosses pendant Abysses, Bat-Marin pendant
   * Tempête/Abysses). `undefined`/tableau vide = jamais de contournement.
   */
  bypassesGardeTideStateIn?: TideStateName[];

  /**
   * Pour un Équipement uniquement : la PREMIÈRE fois que le permanent
   * équipé (`CardInstance.attachedToInstanceId`) devrait être détruit,
   * détruit CET Équipement à la place et inflige un malus permanent de
   * Résistance au permanent sauvé (ex: Plaque de Fortune, -1). Consommé
   * naturellement : l'Équipement quitte le plateau, ne peut donc pas se
   * redéclencher. Traité dans `game/state/processDeaths.ts`, AVANT la
   * collecte normale des morts.
   */
  destructionSubstitute?: { healthPenalty: number };

  /**
   * Étiquettes libres utilisées par les Eaux et Navires pour cibler des
   * familles de cartes sans coupler le moteur à une liste fermée de
   * catégories (ex: "equipement", "brume", "abyssal", "observation").
   */
  tags?: string[];

  /** Variation de statistiques/activité selon l'état de Marée courant. */
  tideAffinity?: TideAffinity;

  /** Effets résolus immédiatement lorsque la carte est jouée. */
  onPlayEffects?: EffectDefinition[];

  /**
   * Pour un Équipement uniquement : types de permanent qu'il peut cibler
   * pour s'y attacher (`attachEquipment`). `undefined` = `EQUIPPABLE_CARD_TYPES`
   * (Marin/Créature/Structure). Certains Équipements restreignent
   * davantage leur texte imprimé (ex: "Équipez une Structure" → `["structure"]`)
   * — jamais un autre Équipement/Objet/Anomalie, quel que soit ce champ.
   */
  equipTargetTypes?: CardType[];

  /**
   * Pour les Objets uniquement : effets résolus quand l'Objet est brisé
   * (`game/actions/breakObject.ts`). L'Objet quitte alors le board — ce
   * n'est ni une mort (`onDeath`) ni un Sabordage (`onSaborde`).
   */
  onBreakEffects?: EffectDefinition[];

  /** Capacités déclenchées par des événements de jeu ultérieurs. */
  abilities?: TriggeredAbility[];

  /**
   * Pour Structure/Objet uniquement : durée de vie en tours JOUÉS (tous
   * joueurs confondus, même convention que `RULES.TIDE_STATE_DURATION`).
   * `undefined` = reste en jeu indéfiniment (jusqu'à destruction/Sabordage/
   * bris). Décompté par `game/environment/resolveEnvironment.ts` ; à 0, la
   * carte quitte le board (expiration — ni mort ni Sabordage).
   */
  durationTurns?: number;

  /**
   * Pour Structure uniquement : liste des états de Marée pendant lesquels
   * cette Structure est visible pour l'adversaire. `undefined` = toujours
   * visible (comportement par défaut, y compris pour tous les autres
   * types de carte). Le propriétaire la voit toujours ; elle occupe son
   * Slot et continue d'exister même invisible.
   */
  visibleDuringTide?: TideStateName[];

  /**
   * Restreint les états de Marée pendant lesquels cette carte peut être
   * jouée (ex: "Ne peut être jouée que pendant Tempête ou Abysses").
   * `undefined` = jouable en toute circonstance.
   */
  requiresTideState?: TideStateName[];

  /**
   * Restreint la POSE de cette carte à un plafond de Raison du contrôleur
   * (ex: Ce Qui Suit le Navire, "5 Raison ou moins"). Vérifié AVANT le
   * paiement du coût, sur la Raison courante.
   */
  requiresControllerReasonAtMost?: number;

  /**
   * Restreint la POSE de cette carte à une Raison du contrôleur EXACTEMENT
   * égale à cette valeur (ex: variante Abyssale de Ce Qui Suit le Navire,
   * "exactement 5 Raison" — pas "5 ou moins"). Vérifié AVANT le paiement du
   * coût. Mutuellement exclusif avec `requiresControllerReasonAtMost` en
   * pratique (jamais les deux sur la même carte).
   */
  requiresControllerReasonExactly?: number;

  /**
   * Remplace `cost` par une autre valeur quand la Marée courante est l'un
   * de ces états (ex: Choppe !, "coûte 0 Raison pendant Calme"). Vérifié à
   * la pose, AVANT paiement — `cost` reste la valeur imprimée/affichée par
   * défaut ailleurs (fiche carte, etc.).
   */
  costOverrideWhenTideStateIn?: { tideStateIn: TideStateName[]; cost: number };

  /**
   * Pour un Objet uniquement : restreint l'activation de `onBreakEffects`
   * (`game/actions/breakObject.ts`) à ces états de Marée (ex: Choppe !,
   * activable seulement pendant Calme). `undefined` = brisable en toute
   * circonstance.
   */
  requiresTideStateForBreak?: TideStateName[];

  /**
   * Pour une unité ATTAQUANTE (ou l'Équipement qui l'équipe, via
   * `CardInstance.attachedToInstanceId`) : dégâts supplémentaires infligés
   * quand la CIBLE de l'attaque est de ce type (ex: Barracuda/Poisson-Scie
   * Gris +1 contre une Structure, Corde de Remorquage +1 à l'unité
   * équipée). Recalculé à chaque combat, jamais stocké comme modificateur
   * permanent — sans effet sur une attaque directe du Navire (pas de
   * cible-carte).
   */
  bonusDamageVsTargetType?: { type: CardType; amount: number };

  /**
   * Nombre maximum d'exemplaires de cette carte dans un deck personnel —
   * donnée propre à chaque carte, jamais dérivée de la rareté (cadrage
   * `TCG_DATABASE.md` "max_copies canonique"). Défaut : 3.
   */
  maxCopies?: number;
}

export const DEFAULT_MAX_COPIES = 3;

/**
 * Statut "MALADE" (Notion "Moteur de partie", section "Malus globaux des
 * Marées — verrouillé") : posé aléatoirement par la Houle, perd 1 PV/
 * Résistance par tour tant qu'il reste actif, retiré automatiquement dès
 * que la Marée quitte la Houle (`game/environment/resolveEnvironment.ts`).
 */
export const STATUS_MALADE = "malade";

/**
 * Statut "IMMOBILISÉ" : la carte ne peut ni attaquer ni utiliser ses
 * capacités tant qu'il reste actif — même famille que `STATUS_MALADE`,
 * pas encore posé par aucun effet du moteur (préparation du système
 * générique de statuts, le câblage effet → statut viendra avec le moteur
 * d'effets data-driven).
 */
export const STATUS_IMMOBILISE = "immobilise";

/**
 * Statut "SILENCE" : les capacités déclenchées et effets d'arrivée de la
 * carte sont désactivés tant qu'il reste actif — même remarque que
 * `STATUS_IMMOBILISE`.
 */
export const STATUS_SILENCE = "silence";

/**
 * Cause de sortie vers le cimetière (Notion "Moteur de partie", section
 * "Défausse — consultation et traçabilité") : posée au moment où une carte
 * rejoint `PlayerState.graveyard`, pour qu'une future vue de défausse
 * puisse distinguer défausse/destruction/sabordage/expiration.
 */
export type GraveyardCause = "discarded" | "destroyed" | "scuttled" | "expired";

export function getMaxCopies(def: CardDefinition): number {
  return def.maxCopies ?? DEFAULT_MAX_COPIES;
}

/**
 * Une carte résolue reste-t-elle en jeu comme permanent, ou part-elle
 * directement au cimetière après résolution (Équipement explicitement
 * `permanent: false`) ?
 */
export function isPermanentCard(def: CardDefinition): boolean {
  if (!PERMANENT_CARD_TYPES.includes(def.type)) return false;
  if (def.type === "equipement") return def.permanent !== false;
  return true;
}

/** Une Structure/Objet est-elle actuellement visible pour l'adversaire selon la Marée ? */
export function isVisibleDuringTide(def: CardDefinition, tideState: TideStateName): boolean {
  if (!def.visibleDuringTide) return true;
  return def.visibleDuringTide.includes(tideState);
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

  /**
   * Pour Structure/Objet avec `durationTurns` : tours restants avant
   * expiration. Fixé à `def.durationTurns` à l'entrée en jeu, décompté une
   * fois par tour joué (tous joueurs confondus). `undefined` si la carte
   * n'a pas de durée limitée.
   */
  turnsRemaining?: number;

  /** Statuts ponctuels actifs sur cette instance (ex: `STATUS_MALADE`). Absent = aucun. */
  statuses?: string[];

  /** Posée uniquement une fois la carte dans un cimetière : cause de sa sortie de jeu. */
  graveyardCause?: GraveyardCause;

  /**
   * Pour un Équipement uniquement : `instanceId` du permanent (Marin/
   * Créature/Structure, jamais un autre Équipement/Objet/Anomalie) sur
   * lequel il est attaché — posé par l'effet `attachEquipment` à la pose.
   * `undefined` = pas (encore) attaché. Toujours revalidé en le résolvant
   * sur le plateau au moment de l'usage plutôt que synchronisé activement :
   * si la cible a quitté le jeu, la référence devient simplement caduque
   * (aucun nettoyage à faire ailleurs).
   */
  attachedToInstanceId?: string;
}

export interface StatModifier {
  id: string;
  source: CardId | "unknown";
  attack: number;
  health: number;
  /** "temporary" retiré en fin de tour, "permanent" persiste. */
  duration: "temporary" | "permanent";
}
