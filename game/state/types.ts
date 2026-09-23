import type { CardInstance, DestructionCause } from "@/game/cards/types";
import type { EnvironmentState } from "@/game/environment/types";
import type { GameEvent } from "@/game/events/types";
import type { RngState } from "@/game/rng";
import type { TriggerEvent } from "@/game/triggers/types";
import type { EffectDefinition } from "@/game/effects/types";

export type PlayerId = string;

export type Zone = "deck" | "hand" | "board" | "graveyard";

/**
 * Drapeau `PlayerState.statusFlags` : ce joueur ne peut récupérer aucune
 * Raison (régénération de début de tour incluse) tant qu'il reste posé (ex:
 * La Gueule Sous la Mer, "jusqu'au début de votre prochain tour, vous ne
 * pouvez pas récupérer de Raison") — retiré automatiquement à la toute
 * PROCHAINE régénération de son porteur (`game/actions/endTurn.ts`), qui
 * est donc celle bloquée, jamais les suivantes.
 */
export const STATUS_NO_REASON_GAIN = "noReasonGainUntilNextTurn";

export interface PlayerState {
  id: PlayerId;
  /** Navire principal choisi pour ce deck : fixe, jamais dans une zone de cartes. */
  shipId: string;
  /** Remplace la notion classique de points de vie (cadrage section 4). */
  anchor: number;
  /**
   * Raison : LA ressource unique du jeu (pas de mana séparé) — paie le coût
   * des cartes, et sa perte totale draine l'Ancrage tant qu'elle reste à 0
   * (cadrage "Navires, Slots et Raison"). Plafonnée par `reasonMax`, propre
   * au Navire choisi.
   */
  reason: number;
  /**
   * Plafond courant de la Raison. Propre au Navire choisi, mais peut être
   * temporairement réduit par un malus continu (ex: -2 pendant les
   * Abysses — Notion "Moteur de partie", section "Malus globaux des
   * Marées") ; restauré dès que le malus se termine.
   */
  reasonMax: number;
  /**
   * Plafond de DÉBUT DE PARTIE (Notion "Gameplay — Raison, Déraison…",
   * courbe 25 % → 50 % → 100 %) : la Raison ne peut pas dépasser
   * `min(reasonMax, reasonCap)`. Relevé au début de chacun des premiers
   * tours du joueur (`RULES.STARTING_REASON_CURVE`). Absent = aucun plafond
   * (parties créées avant cette règle, ou courbe terminée).
   */
  reasonCap?: number;
  deck: CardInstance[];
  hand: CardInstance[];
  board: CardInstance[];
  graveyard: CardInstance[];
  /**
   * Petits drapeaux ponctuels posés par des effets et consommés plus tard
   * (ex: "ignoreNext:abysses" pour "Bouchons de Cire"). Volontairement une
   * simple liste de chaînes plutôt qu'un système dédié : suffisant tant
   * que ces effets restent rares et ponctuels.
   */
  statusFlags: string[];
  /**
   * Réductions de coût en attente, posées par un effet et consommées par
   * la prochaine carte jouée qui correspond (Lot 11 — « la prochaine
   * Marionnette que vous jouez ce tour coûte 1 de moins »).
   *
   * Portées par le JOUEUR et non par la carte : le texte parle de la
   * prochaine carte jouée, laquelle est encore en main — et peut très bien
   * ne jamais être jouée. Nettoyées à la fin du tour où elles ont été
   * posées, comme leur texte l'exige.
   */
  costDiscounts?: CostDiscount[];
  /**
   * Unités posées par ce joueur depuis l'entame du tour de table courant,
   * remis à zéro au début de son tour. Lu par
   * `CostDiscount.appliesAfterUnitsPlayedThisTurn` — « après la troisième
   * unité jouée » n'a pas d'autre façon de se dire.
   */
  unitsPlayedThisTurn?: number;
  /**
   * Où en est la capacité activable du Navire
   * (`ShipDefinition.activatableAbility`) pour ce joueur. Absent : jamais
   * activée. Porté par le JOUEUR et non par une carte — le Navire n'est pas
   * sur le plateau, il n'a pas d'`oncePerTurnFlags` où s'inscrire.
   */
  shipAbility?: ShipAbilityState;
  /**
   * Usages déjà consommés des capacités « une fois par partie », par clé
   * (`game/state/oncePerGame.ts`). Compteur et non booléen : « deux fois
   * par partie » s'exprime sans rien réécrire. Porté par le JOUEUR, donc
   * sérialisé avec l'état — il survit à une reconnexion, et le navigateur
   * n'en est jamais l'autorité.
   */
  oncePerGameUses?: Record<string, number>;
  /**
   * Protections de destruction en cours (« vos Structures ne peuvent pas
   * être détruites par des effets environnementaux jusqu'à la fin de ce
   * tour », Brise-Lames — Tenir la ligne).
   *
   * Portées par le JOUEUR, comme `costDiscounts`, et pour la même raison :
   * elles valent pour des permanents qui ne sont pas encore posés autant
   * que pour ceux qui le sont. Datées plutôt que nettoyées — une protection
   * dont le tour est passé est inerte, sans avoir à passer derrière elle.
   */
  destructionProtections?: DestructionProtection[];
  /**
   * Échéances de tour manquées CONSÉCUTIVEMENT par ce joueur
   * (`game/rules/turnTimer.ts`). Remis à zéro dès qu'il rejoue : ce qui
   * compte, c'est « il n'est plus là », pas « il a été lent une fois il y a
   * dix tours ».
   */
  missedDeadlines?: number;
  /**
   * Attaques DÉCLARÉES par ce joueur depuis l'entame du tour de table
   * courant, remis à zéro au début de son tour (`endTurn`).
   *
   * Existe pour que « la troisième unité adverse attaque pendant un même
   * tour » (Cale Inondable, Lot 14) s'exprime sans qu'une carte ait à tenir
   * son propre compteur. Compté à la DÉCLARATION et non à la résolution :
   * une carte qui intercepte l'attaque doit savoir combien en ont déjà été
   * portées, celle-ci comprise.
   */
  attacksDeclaredThisTurn?: number;
  /**
   * Journal court des cartes ARRIVÉES au Cimetière, horodaté par tour de
   * table (Lot 13).
   *
   * Le contenu du Cimetière ne suffit pas à répondre à « si une carte Un
   * Dead a rejoint votre Cimetière ce tour » : il dit ce qui s'y trouve,
   * jamais QUAND ni d'où c'est venu — et une carte repêchée puis
   * redéfaussée n'y compterait que pour une. D'où ce journal, que TOUTE
   * voie vers le Cimetière alimente (`recordGraveyardArrival`, dans
   * `game/state/discard.ts`) et qui est élagué au début de chaque tour aux
   * trois derniers tours de table : « depuis votre dernier tour » remonte
   * jusqu'au tour précédent du contrôleur, pas seulement au tour adverse.
   */
  graveyardArrivals?: GraveyardArrival[];
}

/** Une arrivée au Cimetière, telle que la lisent les conditions du Lot 13. */
export interface GraveyardArrival {
  cardId: string;
  /** Tour de table de l'arrivée. */
  turnNumber: number;
  /** D'où venait la carte — « depuis votre main » est une condition à part entière. */
  fromZone: "hand" | "board" | "deck";
  /**
   * Arrivée survenue pendant l'entame du tour de son propriétaire, AVANT que
   * ses capacités de début de tour ne se déclenchent (effets de Marée). Sa
   * capacité « depuis votre dernier tour » l'a donc déjà vue à ce tour-là :
   * elle ne doit pas la recompter deux tours plus tard.
   */
  beforeOwnTurnStart?: boolean;
}

/**
 * Suivi de la capacité de Navire. Tout est HORODATÉ plutôt que remis à zéro
 * en fin de tour : un compteur qui porte son numéro de tour périme tout
 * seul, là où un drapeau booléen dépend d'un nettoyage qu'on finit toujours
 * par oublier quelque part.
 */
export interface ShipAbilityState {
  /** Tour de la dernière activation, et nombre d'activations faites CE tour-là. */
  activations: { turnNumber: number; count: number };
  /**
   * Tour où le Navire a été ARMÉ sans avoir encore tiré (capacité en deux
   * temps). Le tir l'efface ; un tour qui passe le périme — un canon armé
   * et non tiré ne reste pas chargé jusqu'au tour suivant.
   */
  armedOnTurn?: number;
}

/**
 * Une réduction de coût en attente. Aucune ne peut faire descendre un coût
 * sous `MIN_DISCOUNTED_COST` : c'est une règle générale du Lot 11 (« Aucun
 * effet de réduction ne peut faire descendre un coût sous 1 »), appliquée
 * au calcul et non carte par carte.
 */
export interface CostDiscount {
  /**
   * Raison retirée au coût imprimé — NÉGATIVE pour une MAJORATION
   * (« les unités supplémentaires coûtent +2 Raison », Pas Tous à la Fois !,
   * Lot 14).
   *
   * Un seul mécanisme pour les deux sens, à dessein : une majoration est
   * une réduction qui compte à l'envers, et en faire une structure à part
   * aurait doublé le chemin de lecture du coût — l'endroit exact où une
   * divergence passe inaperçue.
   */
  amount: number;
  /** Ne s'applique qu'aux cartes de ce sous-type (ex: "marionnette"). */
  subtype?: string;
  /** Ne s'applique qu'aux cartes de ces types. */
  cardTypes?: string[];
  /** Nombre de cartes encore concernées. Décrémenté à chaque usage. */
  uses: number;
  /**
   * Ne s'applique qu'À PARTIR de la N-ième unité posée par ce joueur dans
   * le tour (« après la troisième unité jouée par chaque joueur »). La
   * carte en cours compte : à 3, c'est la QUATRIÈME qui paie.
   */
  appliesAfterUnitsPlayedThisTurn?: number;
  /**
   * `uses` ne se décrémente pas : le modificateur vaut pour TOUTES les
   * cartes concernées jusqu'à son expiration. Une taxe dit « les unités
   * supplémentaires », pas « la prochaine ».
   */
  persistent?: boolean;
  /** Tour au-delà duquel la réduction est perdue (« ce tour »). */
  expiresAfterTurn: number;
}

/**
 * Une protection de destruction en cours.
 *
 * Volontairement exprimée en CAUSES (`DestructionCause`) et non en
 * mécaniques nommées : « détruite par un effet environnemental » est
 * exactement `causes: ["tide"]`, et le jour où une carte dira « ne peut pas
 * être détruite au combat ce tour », elle s'écrira `causes: ["combat"]`
 * sans une ligne de moteur en plus.
 */
export interface DestructionProtection {
  /** Types de cartes protégés (ex: `["structure"]`). Absent : tous les permanents du joueur. */
  cardTypes?: string[];
  /** Causes de destruction contre lesquelles elle protège. */
  causes: DestructionCause[];
  /** Dernier tour de table où elle vaut encore (« jusqu'à la fin de ce tour »). */
  expiresAfterTurn: number;
}

/** Plancher absolu d'un coût après réduction (Lot 11, règle générale). */
export const MIN_DISCOUNTED_COST = 1;

export type GamePhase =
  | "waitingForPlayers"
  | "mainPhase"
  | "combatPhase"
  /** Seconde Phase principale, après le combat : reposer, Saborder, Briser une fois l'attaque résolue. */
  | "mainPhase2"
  | "finished";

/**
 * Les deux Phases principales du tour. Tout ce qui est "réservé à la Phase
 * principale" (poser une carte, Saborder, Briser un Objet, activer une
 * capacité) vaut pour l'une comme pour l'autre : seul le COMBAT est
 * enfermé dans sa propre phase.
 */
export const MAIN_PHASES = ["mainPhase", "mainPhase2"] as const;

export function isMainPhase(phase: GamePhase): boolean {
  return (MAIN_PHASES as readonly GamePhase[]).includes(phase);
}

export interface GameState {
  id: string;
  createdAt: number;

  players: [PlayerState, PlayerState];

  turnNumber: number;
  activePlayerId: PlayerId;
  /** Le joueur qui a la priorité pour agir (utile plus tard pour les réponses). */
  priorityPlayerId: PlayerId;
  phase: GamePhase;

  rngState: RngState;

  /** État partagé de la Marée et des Eaux (cadrage sections 6-14). */
  environment: EnvironmentState;

  /** Journal complet et ordonné des événements de la partie. */
  eventLog: GameEvent[];

  /**
   * Posé quand un joueur tente de piocher dans un deck vide : au lieu
   * d'une défaite instantanée, la fin de la résolution en cours déclenche
   * le "Jugement de l'Océan" (comparaison de Résilience) — voir
   * `game/rules/oceanJudgment.ts`.
   */
  pendingOceanJudgment?: { playerId: PlayerId };

  /**
   * Fenêtre de réaction ouverte (Notion "Moteur de partie — déroulement,
   * Raison & chaînes d'effets", pipeline étapes 6-9) : au moins un joueur
   * a une capacité `mode: "optional"` actuellement éligible en réponse
   * aux `events` qui viennent de se produire. Tant que ce champ est posé,
   * `awaitingPlayerId` est le SEUL joueur autorisé à agir — uniquement
   * via `activateReaction` ou `passReaction` (`game/reactions/`) ; aucune
   * action normale n'est acceptée (cadrage : "tant qu'un effet, une
   * réaction ou une conséquence est en cours de résolution, aucune
   * nouvelle action normale ne peut être commencée").
   */
  pendingReaction?: PendingReactionState;

  /**
   * Choix forcé en attente pour `playerId` (Notion "Choix de joueur en
   * cours de résolution", ex: Le Fond Vous Regarde — "au début de chaque
   * tour, le joueur actif choisit : perdre X Raison, ou infliger X dégâts
   * d'Ancrage à son propre Navire"). Tant que ce champ est posé, `playerId`
   * est le SEUL joueur autorisé à agir, uniquement via `resolveChoice`
   * (`game/actions/resolveChoice.ts`) — même principe de blocage que
   * `pendingReaction`, mais pour un choix entre deux effets fixes plutôt
   * qu'une capacité facultative.
   */
  pendingChoice?: PendingChoice;

  /**
   * Attaque DÉCLARÉE mais pas encore résolue, suspendue le temps que le
   * défenseur réponde à sa fenêtre d'interception (grammaire des pièges,
   * 21/09/2026).
   *
   * L'attaque n'est pas coupée en deux : elle n'est simplement pas encore
   * commencée. Aucun dégât n'a été calculé, aucun bouclier consommé — seul
   * `hasAttackedThisTurn` est déjà posé, parce que déclarer une attaque
   * EST l'avoir menée, qu'elle soit interceptée ou non.
   *
   * Quand la fenêtre se referme (`dispatch`), l'attaque se résout avec
   * `intercepted` pour seule différence : les dégâts directs au Navire sont
   * annulés. Tout le reste du pipeline — contrecoup de l'attaquant, perte
   * de Raison infligée, déclencheurs — se déroule normalement : le coup a
   * bien eu lieu, il n'a simplement pas porté.
   */
  pendingAttack?: PendingAttack;

  /**
   * Entame de tour suspendue à l'ANNONCE de la Marée (Ancre de Dérive,
   * 21/09/2026). La nouvelle Marée est committée et annoncée, mais ses
   * effets de tour ne sont pas encore appliqués : la fenêtre
   * `onTideAnnounced` est ouverte et le joueur décide.
   *
   * Tant qu'il est posé, l'entame n'est pas finie — ni récupération de
   * Raison, ni pioche, ni `TURN_STARTED`. `dispatch` la reprend dès que la
   * fenêtre se referme, exactement comme une attaque suspendue.
   */
  pendingTideStep?: PendingTideStep;

  /**
   * Destruction suspendue le temps d'une fenêtre de SAUVETAGE (Lot 14).
   *
   * `processDeaths` s'arrête avant d'emporter ces permanents et rend la
   * main ; `dispatch` ouvre alors la fenêtre `onPermanentWouldBeDestroyed`,
   * puis relance la passe de morts dès qu'elle se referme. Ceux qui n'ont
   * pas été sauvés partent à ce moment-là.
   *
   * Même geste que `pendingAttack` et `pendingTideStep` : un point du
   * déroulement où le moteur s'arrête pour laisser quelqu'un décider.
   */
  pendingDestruction?: { instanceIds: string[]; turnNumber: number };

  /**
   * Bris d'Objet suspendu le temps de laisser quelqu'un en ANNULER l'effet
   * (Fausse Cargaison, Lot 14).
   *
   * L'Objet est déjà parti au Cimetière et son coût est payé : ce qui
   * attend, ce sont ses `onBreakEffects`. `dispatch` les résout dès que la
   * fenêtre se referme — ou les jette si `cancelled` a été levé.
   *
   * Posé UNIQUEMENT quand un adversaire a de quoi répondre : sans cette
   * garde, tous les Bris du jeu changeraient de rythme pour une carte.
   */
  pendingObjectBreak?: {
    playerId: PlayerId;
    instanceId: string;
    cardId: string;
    brokenFromHand: boolean;
    chosenTargetInstanceId?: string;
    chosenGraveyardInstanceId?: string;
    turnNumber: number;
    /** Un adversaire a annulé l'effet : il ne se résoudra pas. */
    cancelled?: boolean;
  };

  /**
   * DÉLAI DE TOUR : jusqu'à quand le joueur attendu a pour agir
   * (`game/rules/turnTimer.ts`).
   *
   * Dans l'état, donc persisté avec lui et rendu tel quel après une
   * reconnexion — et projeté aux deux joueurs, qui ont tous deux besoin de
   * voir le temps qui reste. Information PUBLIQUE : elle ne dit rien que
   * l'ordre du tour ne dise déjà.
   */
  turnTimer?: TurnTimerState;

  status: "active" | "finished";
  winnerId?: PlayerId;
}

/**
 * Le chrono en cours. `deadlineAt` est un horodatage absolu (ms epoch) posé
 * par le SERVEUR : le client s'en sert pour dessiner un décompte, jamais
 * pour décider quoi que ce soit — deux horloges ne tombent jamais d'accord,
 * et une seule fait autorité.
 */
export interface TurnTimerState {
  /** Joueur dont on attend l'action — `playerToAct` au moment où le chrono a été posé. */
  awaitingPlayerId: PlayerId;
  /** Ce qu'on attend de lui : son tour, une réponse à une fenêtre, ou un choix forcé. */
  kind: "turn" | "reaction" | "choice";
  /** Horodatage absolu (ms epoch) au-delà duquel l'échéance est manquée. */
  deadlineAt: number;
}

/**
 * Choix binaire forcé, toujours entre "perdre de la Raison" et "infliger
 * des dégâts d'Ancrage à son propre Navire" — les deux seules branches que
 * le catalogue actuel requiert (Le Fond Vous Regarde). Une carte future aux
 * branches différentes élargirait ce type plutôt que de le généraliser
 * prématurément à des effets arbitraires.
 */
/**
 * Entame de tour suspendue le temps de la fenêtre `onTideAnnounced`.
 *
 * Porte tout ce qu'il faut pour reprendre : de QUI c'est le tour, et la
 * Marée annoncée, dont les effets n'ont pas encore été appliqués. Le seul
 * champ que la fenêtre peut changer est `deferred` — l'effet générique
 * `deferTideEffects` le lève, et l'entame reportera alors ces effets à la
 * fin du tour au lieu de les appliquer tout de suite.
 */
export interface PendingTideStep {
  /** Joueur dont le tour commence : celui pour qui l'entame doit reprendre. */
  playerId: PlayerId;
  turnNumber: number;
  /** État quitté, pour les effets d'entrée/sortie que l'application doit encore jouer. */
  previousTideState: import("@/game/environment/types").TideStateName;
  tideState: import("@/game/environment/types").TideStateName;
  intensity: number;
  /** La Marée vient-elle de CHANGER d'état, ou ne fait-elle que décompter ? */
  stateChanged: boolean;
  /** Levé par `deferTideEffects` : les effets de cette Marée attendront la fin du tour. */
  deferred?: boolean;
}

/**
 * Attaque suspendue pendant sa fenêtre d'interception. Porte l'action
 * telle qu'elle a été déclarée, pour la rejouer à l'identique.
 */
export interface PendingAttack {
  /**
   * D'où vient le coup. Les PIÈGES ne font pas la différence — leur texte dit
   * « des dégâts directs d'une attaque », sans préciser la source — mais la
   * REPRISE, elle, doit savoir quoi rejouer : une attaque d'unité ou un tir
   * de Navire (arbitrage du 21/09 : le Canon du Goliath cesse d'être
   * intouchable).
   */
  kind?: "attaque" | "tirDeNavire";
  playerId: PlayerId;
  /** Pour un tir de Navire : le Navire n'est pas une unité, ce champ vaut alors l'identifiant du joueur. */
  attackerInstanceId: string;
  /** Cible du combat, absente pour une attaque directe au Navire. */
  defenderInstanceId?: string;
  /** Puissance de l'attaquant au moment de la déclaration — ce que « autant de dégâts » renvoie. */
  attackerPower: number;
  /**
   * Réduction de dégâts DIRECTS posée par un piège (`reduceIncomingDamage`,
   * Cage de Flottaison, Caisses Arrimées). Cumulative : deux pièges qui
   * répondent à la même attaque additionnent leurs réductions.
   */
  damageReduction?: number;
  /** Un piège a annulé les dégâts directs de cette attaque. */
  intercepted?: boolean;
}

/** Choix binaire forcé d'une Anomalie (ex: Le Fond Vous Regarde) : perdre de la Raison, ou subir des dégâts d'Ancrage. */
export interface ReasonOrAnchorChoice {
  kind: "reasonOrAnchor";
  playerId: PlayerId;
  /** Carte-source de la capacité ayant ouvert ce choix (traçabilité/debug). */
  sourceInstanceId: string;
  reasonLossAmount: number;
  anchorDamageAmount: number;
  turnNumber: number;
}

/**
 * « Choisissez : A ou B » d'une capacité AUTOMATIQUE (`TriggeredAbility.choiceGroup`
 * en mode "auto", ex: Horloge de Marée au Sabordage) : le contrôleur désigne
 * laquelle des capacités du groupe se résout (`resolveChoice`). La carte
 * source peut déjà avoir quitté le board (Sabordage) : `cardId` porte
 * l'identité nécessaire.
 */
export interface AbilityOptionChoice {
  kind: "abilityOption";
  playerId: PlayerId;
  sourceInstanceId: string;
  cardId: string;
  abilityIndexes: number[];
  turnNumber: number;
}

/**
 * « Défaussez N cartes » : le joueur désigne LESQUELLES (CLAUDE.md, « le
 * joueur décide, jamais le moteur »). Jusqu'ici la défausse prenait le
 * début de la main, ce qui transformait un coût en loterie de tri.
 *
 * Le choix porte la SUITE de la séquence d'effets (`continuation`) : le
 * texte « défaussez 1 carte. Si une carte Un Dead a rejoint votre Cimetière
 * ce tour, piochez 1 carte supplémentaire » évalue sa condition APRÈS la
 * défausse, donc la pioche ne peut pas se résoudre avant que le joueur ait
 * répondu. Ce sont des données pures (`EffectDefinition[]`), sérialisables
 * comme le reste de l'état.
 */
export interface HandDiscardChoice {
  kind: "handDiscard";
  playerId: PlayerId;
  /** Nombre de cartes à défausser — déjà borné à la taille de la main. */
  count: number;
  /**
   * « Placez JUSQU'À 2 cartes » (Mauvaise Main, Lot 14) : `count` devient
   * un maximum et non un compte exact. Absent = le texte dit combien, et
   * le moteur exige ce nombre-là.
   */
  atMost?: boolean;
  /**
   * Où partent les cartes désignées. `"graveyard"` (défaut) est la
   * défausse ordinaire ; `"deckBottom"` les remet SOUS la pioche —
   * ce n'est pas une défausse, donc elle ne réveille aucun déclencheur de
   * défausse et rien ne les repêchera au Cimetière.
   */
  destination?: "graveyard" | "deckBottom";
  /**
   * « puis piochez-en autant » : une fois les cartes replacées, le joueur
   * en pioche exactement le nombre qu'il a rendu. Porté par le choix
   * plutôt que par une `continuation`, parce que le montant n'est connu
   * qu'APRÈS la réponse — des effets statiques ne peuvent pas l'exprimer.
   */
  drawBackAfterwards?: boolean;
  /** « vous POUVEZ défausser » : « Ne rien défausser » est une réponse valable. */
  refusable: boolean;
  /** Carte à l'origine de la défausse, pour l'écran et la traçabilité. */
  sourceInstanceId?: string;
  /** Effets qui restent à résoudre une fois la défausse faite. */
  continuation?: {
    effects: EffectDefinition[];
    context: {
      controllerId: PlayerId;
      sourceInstanceId?: string;
      chosenTargetInstanceId?: string;
      chosenGraveyardInstanceId?: string;
      brokenFromHand?: boolean;
      triggerSourceInstanceId?: string;
      turnNumber: number;
    };
  };
  turnNumber: number;
}

/**
 * « Regardez les N premières cartes de votre pioche. Ajoutez-en une à votre
 * main. Placez les autres sous votre pioche. » (Lot 14 — Faire l'Inventaire,
 * Journal de Bord, Fouille de la Cale).
 *
 * Les cartes regardées sont SORTIES de la pioche au moment où la question
 * est posée, et vivent ici jusqu'à la réponse : sans ça, une pioche qui se
 * résoudrait entre-temps rendrait les cartes proposées obsolètes.
 *
 * Information PRIVÉE : `toPlayerView` ne montre `revealed` qu'à celui qui
 * regarde — c'est toute la valeur du filtrage que l'adversaire n'ait pas
 * vu passer les trois cartes.
 */
export interface DeckLookChoice {
  kind: "deckLook";
  playerId: PlayerId;
  /** Cartes retirées du dessus de la pioche, dans l'ordre où elles y étaient. */
  revealed: CardInstance[];
  /** Nombre maximum de cartes à prendre en main (1 pour tout le Lot 14). */
  take: number;
  /**
   * Restreint ce qui est PRENABLE (« vous pouvez ajouter une Structure
   * parmi elles ») — pas ce qui est regardé : le joueur voit les quatre
   * cartes, il n'en prend qu'une d'un type donné.
   */
  takeableCardTypes?: import("@/game/cards/types").CardType[];
  /** « vous POUVEZ ajouter » : ne rien prendre est une réponse valable. */
  refusable: boolean;
  sourceInstanceId?: string;
  turnNumber: number;
}

/**
 * « Restaurez jusqu'à N Résistance RÉPARTIE entre les unités que vous
 * contrôlez » (Lot 14 — Trousse du Bord, Chirurgien du Bord).
 *
 * Répartir est une décision, et le moteur ne décide pas à la place du
 * joueur : soigner d'abord la plus blessée n'est pas toujours le bon coup
 * (avec 4 points, une unité à 5 dégâts et une à 1, finir la seconde et
 * verser le reste dans la première vaut souvent mieux). La question est
 * donc posée, et le joueur répartit.
 *
 * « JUSQU'À » : il peut en verser moins, ou rien du tout.
 */
export interface HealAllocationChoice {
  kind: "healAllocation";
  playerId: PlayerId;
  /** Points de Résistance à répartir, au plus. */
  budget: number;
  sourceInstanceId?: string;
  turnNumber: number;
}

/**
 * « Chaque joueur choisit jusqu'à N unités qu'il contrôle. Détruisez toutes
 * les autres. » (Lot 14 — Chacun sa Place, Abandonnez le Navire !).
 *
 * Les deux joueurs choisissent, l'un après l'autre : `remainingPlayerIds`
 * porte ceux qu'il reste à consulter, et `kept` ce qui a déjà été mis de
 * côté. La destruction n'a lieu qu'une fois tout le monde passé — sans
 * quoi le second choisirait en connaissant déjà le plateau amputé du
 * premier, ce que le texte ne dit pas.
 *
 * Les gardes de chaque joueur sont une information PUBLIQUE une fois
 * l'effet résolu, mais pas avant : `toPlayerView` masque donc `kept` à
 * celui qui n'a pas encore répondu.
 */
export interface KeepUnitsChoice {
  kind: "keepUnits";
  /** Joueur à qui la question est posée MAINTENANT. */
  playerId: PlayerId;
  /** Joueurs qu'il reste à consulter après lui, dans l'ordre. */
  remainingPlayerIds: PlayerId[];
  /** Nombre maximum d'unités qu'un joueur peut garder. */
  keep: number;
  /** Unités déjà mises de côté, tous joueurs confondus. */
  kept: string[];
  sourceInstanceId?: string;
  turnNumber: number;
}

/**
 * « Renvoyez JUSQU'À 2 unités de coût 3 ou moins qu'il contrôle dans sa
 * main » (Panique sur le Pont, Lot 14).
 *
 * `chosenUnit` ne désigne qu'UNE cible : un texte qui en vise plusieurs
 * n'avait aucune façon de se dire. Ce choix-ci porte la liste des cibles
 * légales — calculées une fois, avec le même filtre que le moteur
 * revérifiera — et les effets à appliquer à chacune.
 *
 * « Jusqu'à » : en désigner moins, ou aucune, reste une réponse.
 */
export interface PickUnitsChoice {
  kind: "pickUnits";
  playerId: PlayerId;
  /** Nombre maximum de cibles. */
  pick: number;
  /** Cibles légales, `instanceId` — l'interface ne propose rien d'autre, le moteur n'accepte rien d'autre. */
  among: string[];
  /** Effets appliqués à CHAQUE cible désignée. */
  effects: EffectDefinition[];
  /** Qui contrôle ces effets — pas forcément le propriétaire des cibles. */
  controllerId: PlayerId;
  sourceInstanceId?: string;
  turnNumber: number;
}

export type PendingChoice =
  | PickUnitsChoice
  | KeepUnitsChoice
  | ReasonOrAnchorChoice
  | AbilityOptionChoice
  | HandDiscardChoice
  | DeckLookChoice
  | HealAllocationChoice;

export interface PendingReactionState {
  /** Événements déclencheurs ayant ouvert cette fenêtre (contexte pour l'UI/le recalcul d'éligibilité). */
  events: TriggerEvent[];
  /** Joueur actuellement invité à Activer une réaction éligible ou Passer. */
  awaitingPlayerId: PlayerId;
  /** Joueurs restants à consulter après celui-ci, dans l'ordre (file de priorité). */
  priorityQueue: PlayerId[];
  /**
   * Clés `"sourceInstanceId:abilityIndex"` déjà activées PENDANT cette
   * fenêtre : une capacité facultative ne se propose qu'une fois par
   * fenêtre de réaction, même si elle resterait techniquement éligible
   * (coût payable, cible disponible) — évite qu'un joueur la déclenche en
   * boucle tant qu'il peut se le permettre.
   */
  usedCandidateKeys: string[];
  turnNumber: number;
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Joueur inconnu dans cette partie: ${playerId}`);
  }
  return player;
}

export function getOpponent(state: GameState, playerId: PlayerId): PlayerState {
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) {
    throw new Error(`Adversaire introuvable pour le joueur: ${playerId}`);
  }
  return opponent;
}

export function findCardInstance(
  state: GameState,
  instanceId: string
): { card: CardInstance; owner: PlayerState; zone: Zone } | undefined {
  for (const player of state.players) {
    const zones: [Zone, CardInstance[]][] = [
      ["deck", player.deck],
      ["hand", player.hand],
      ["board", player.board],
      ["graveyard", player.graveyard],
    ];
    for (const [zone, cards] of zones) {
      const card = cards.find((c) => c.instanceId === instanceId);
      if (card) return { card, owner: player, zone };
    }
  }
  return undefined;
}
