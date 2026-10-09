import type { ArchetypeId } from "@/game/cards/archetypes";
import type { EffectDefinition } from "@/game/effects/types";
import type { TideAffinity, TideStateName } from "@/game/environment/types";
import type { TriggerType } from "@/game/triggers/types";

export type CardId = string;

/**
 * Couleurs des Sentinelles Chromatiques (Lot 15 — Éclats en Selle). Chaque
 * pierre donne accès à une couleur, et chaque couleur émet un SIGNAL dont
 * les règles vivent dans `game/rules/chromatic.ts` : c'est une mécanique de
 * famille, écrite une fois, pas un texte recopié carte par carte.
 */
export type ChromaticColor = "rouge" | "jaune" | "bleu" | "vert" | "violet";

export const CHROMATIC_COLORS: readonly ChromaticColor[] = ["rouge", "jaune", "bleu", "vert", "violet"];

/**
 * Identité chromatique GAGNÉE en jeu (instance ou modificateur).
 *
 * Deux notions distinctes, que le Lot 15 sépare à dessein :
 *  - `colors` — ce que la carte EST (« considérée comme étant de cette
 *    couleur ») : c'est ce que comptent Formation Prismatique, l'Assemblage
 *    ou « une Sentinelle d'une autre couleur » ;
 *  - `emits` — les Signaux qu'elle ÉMET. Un Éclat Chromatique a une couleur
 *    mais n'émet rien, et le Bracelet Chromatique ajoute une couleur sans
 *    ajouter de Signal (« elle n'émet toujours qu'un seul Signal »).
 */
export interface ChromaticIdentity {
  colors?: ChromaticColor[];
  emits?: ChromaticColor[];
}

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
export type CardType = "marin" | "creature" | "equipement" | "structure" | "objet" | "anomalie" | "lande";

/** Types de carte considérés comme des unités (peuvent occuper un Slot de combat, attaquer). */
export const UNIT_CARD_TYPES: readonly CardType[] = ["marin", "creature"];

/**
 * Types de permanent qu'un Équipement peut cibler PAR DÉFAUT pour s'y
 * attacher : les unités seulement. Une Structure ne reçoit un Équipement
 * que si sa carte le dit (« Équipez une Structure », « Équipez un
 * permanent » — `CardDefinition.equipTargetTypes`), décision du
 * 2026-09-16 ; jamais un autre Équipement, un Objet ni une Anomalie.
 */
export const EQUIPPABLE_CARD_TYPES: readonly CardType[] = ["marin", "creature"];

/** Types de carte qui restent en jeu comme permanents (par défaut) après résolution. */
export const PERMANENT_CARD_TYPES: readonly CardType[] = [
  "marin",
  "creature",
  "equipement",
  "structure",
  "objet",
  "anomalie",
];

/**
 * Filtre sur la carte qui DÉCLENCHE l'événement, pour une capacité qui
 * réagit à ce qui arrive à une AUTRE carte que la sienne — "la première
 * fois à chaque tour qu'un autre Cra-Poiscail arrive en jeu", "qu'un
 * Cra-Poiscail que vous contrôlez est détruit".
 *
 * Sans ce champ, `onEnterPlay`/`onDeath` restent PERSONNELS (la carte ne
 * réagit qu'à sa propre arrivée/mort), comportement historique de
 * `game/triggers/triggerBus.ts`.
 */
export interface TriggerSourceFilter {
  /** La carte déclencheuse appartient à cette famille. */
  archetype?: ArchetypeId;
  /** Ou est précisément l'une de ces cartes (ex: un Péon, pour le Roi Abyssal). */
  cardIds?: string[];
  /** Ou porte ce SOUS-TYPE (ex: "marionnette" — Lot 11, qui raisonne en sous-type et non en archétype). */
  subtype?: string;
  /** Coût IMPRIMÉ minimal (« la première unité coûtant 5 ou plus que vous jouez », Lot 17). */
  minCost?: number;
  /**
   * La carte déclencheuse porte (ou portait, pour `onDeath`) ce marqueur :
   * « une de vos unités qui porte un marqueur Mort est détruite », « une
   * unité arrive sur votre plateau avec un marqueur Mort » (Lot 18). Lu sur
   * `TriggerEvent.markers`.
   */
  withMarker?: import("@/game/cards/markers").MarkerId;
  /** Ou est de l'un de ces TYPES de carte (ex: "quand une Structure est détruite" — Mécanicien aux Mains Noires). */
  cardTypes?: CardType[];
  /** Le déclencheur doit être contrôlé par le contrôleur de la capacité. Défaut : `true`. */
  sameController?: boolean;
  /** Le déclencheur doit être contrôlé par l'ADVERSAIRE ("une Structure adverse" — Contremaître des Amarres). Implique `sameController: false`. */
  opponentOnly?: boolean;
  /** Exclut la carte elle-même — "un AUTRE Cra-Poiscail". Défaut : `true`. */
  excludeSelf?: boolean;
  /** Ne réagit qu'aux cartes INVOQUÉES, pas à celles posées depuis la main (ex: Bannière en Vieille Chaussette, "que vous invoquez"). */
  onlySummoned?: boolean;
  /**
   * `onEnterPlay` seulement : ne réagit qu'aux cartes JOUÉES — posées depuis
   * la main par leur contrôleur (« la première carte Marionnette que vous
   * JOUEZ », Le Rideau se Lève ; « la première unité adverse JOUÉE chaque
   * tour », Chaîne de Travers ; Barils de Poudre ; Poste Chromatique). Écarte une invocation (un Péon n'est pas
   * joué) comme une arrivée REJOUÉE (`repeatEnterEffects`). Pendant de
   * `onlySummoned`.
   */
  onlyPlayed?: boolean;
  /**
   * `onEnterPlay` seulement. Par défaut, une arrivée REJOUÉE
   * (`repeatEnterEffects` — Colombina, Le Régisseur des Profondeurs, Le
   * Rideau se Lève) n'est PAS une arrivée en jeu pour un observateur : l'unité
   * était déjà là, seul son effet d'arrivée est répété (décision du
   * 02/10/2026). `true` : l'observateur la voit quand même. Les invocations,
   * elles, restent toujours des arrivées.
   */
  includeRepeatedArrival?: boolean;
  /**
   * Pour un Équipement : ne réagit qu'à ce qui arrive au permanent qu'il
   * équipe — "La première fois à chaque tour QU'IL attaque" (ex:
   * Fourchette du Grand Étang). L'Équipement n'attaque pas lui-même :
   * sans ce filtre, aucune de ses capacités ne pourrait suivre son
   * porteur.
   */
  equippedUnit?: boolean;
  /**
   * `onDeath` seulement : ne réagit qu'aux destructions de cette CAUSE
   * (ex: « au combat »). Absent = toutes les destructions, Sabordage
   * compris — le comportement historique, réservé aux textes qui disent
   * « détruite ou Sabordée ». Un texte qui dit seulement « détruite »
   * déclare `["combat", "effect", "tide"]` (vérifié par la conformité).
   */
  destroyedBy?: DestructionCause[];
  /**
   * `onObjectBroken` seulement : ne réagit qu'à un Bris DEPUIS LA MAIN
   * (`true`), ou au contraire qu'à un Bris depuis le plateau (`false`) —
   * ex: Pantalone Sans-Sou, « que vous Brisez directement depuis votre
   * main ». Porté par le FILTRE et non par une condition d'effet
   * (`conditionBrokenFromHand`) : le filtre est évalué AVANT que
   * `oncePerTurnKey` ne soit consommé, là où une condition d'effet
   * laisserait un Bris depuis le plateau brûler l'unique usage du tour
   * pour ne rien résoudre.
   */
  fromHand?: boolean;
  /**
   * `onSurvivedDamage` seulement : la carte n'a survécu qu'à des dégâts de
   * ces CAUSES (« des dégâts infligés par l'un de vos effets » → `["effect"]`,
   * Maître Verrier, Pont de Verre). Absent = quels que soient les dégâts.
   */
  damageCauses?: DestructionCause[];
  /**
   * `onSurvivedDamage` seulement : ces dégâts ont été infligés par un effet
   * que CONTRÔLE le porteur de la capacité (« par l'un de VOS effets »).
   * Se combine avec `damageCauses` : au moins un des coups encaissés doit
   * remplir les deux.
   */
  damageByController?: boolean;
  /**
   * `onCardDiscardedFromHand` seulement : la défausse vient d'un EFFET de
   * carte, pas de la limite de main en fin de tour (Oracle d'Améthyste,
   * « que vous piochez puis défaussez par un effet de carte »).
   */
  discardByEffect?: boolean;
  /**
   * `onCardDiscardedFromHand` seulement : la défausse SUIT une pioche du
   * même joueur dans la même suite d'effets — « que vous piochez PUIS
   * défaussez par un effet de carte » (Oracle d'Améthyste). Une défausse
   * seule, ou imposée sans pioche préalable, ne compte pas.
   */
  discardAfterDraw?: boolean;
}

/** Une capacité déclenchée : "quand X se produit, résous ces effets". */
export interface TriggeredAbility {
  trigger: TriggerType;
  effects: EffectDefinition[];
  /** Texte optionnel affiché dans l'UI ; pas de logique attachée. */
  description?: string;

  /**
   * **RÉACTION CACHÉE** (grammaire des Structures, 21/09/2026).
   *
   * Une Structure masquée par la Marée existe toujours : elle occupe son
   * Slot, sa durée continue de se consumer, et elle est **inactive par
   * défaut** — ses capacités ne se déclenchent pas. Ce drapeau est la seule
   * exception : il déclare qu'une capacité PEUT être utilisée alors que sa
   * porteuse est masquée.
   *
   * Trois conséquences, toutes voulues :
   *
   * 1. **L'adversaire ne sait pas ce qu'il affronte.** La projection joueur
   *    masque l'identité d'une Structure invisible (`playerView`) : il voit
   *    un Slot occupé, pas une carte. Une Réaction cachée est donc un
   *    piège, et son intérêt est précisément qu'on ignore lequel.
   * 2. **La révélation précède la résolution.** Activer expose la carte
   *    (`CardInstance.revealed`, événement `STRUCTURE_REVEALED`) AVANT que
   *    ses effets ne s'appliquent — on ne se fait pas frapper par une carte
   *    qu'on n'a jamais vue. La révélation est définitive.
   * 3. **Le joueur décide.** Une Réaction cachée est toujours facultative :
   *    elle passe par une fenêtre de réaction (Activer / Passer), et le
   *    moteur ne la déclenche jamais d'office. `mode: "optional"` est donc
   *    implicite — le déclarer est inutile, l'omettre sans danger.
   *
   * Le SORT DE LA CARTE APRÈS COUP appartient à son texte, pas au moteur :
   * une Réaction cachée qui ne dit rien laisse la Structure en jeu, révélée.
   * Pour qu'elle parte, le texte le dit et la définition le réalise avec les
   * primitives existantes (`saborde` ou une destruction sur `self`) ; pour
   * qu'elle se remasque, il le dit aussi — `afterHiddenReaction`.
   *
   * Les déclencheurs de DÉPART (`onDeath`, `onSaborde`, `onExpire`,
   * `onTideStateExited`) et la révélation elle-même (`onBecomeVisible`)
   * n'ont pas besoin de ce drapeau : partir ou se découvrir n'est pas
   * « agir ».
   */
  hiddenReaction?: boolean;

  /**
   * **RÉACTION DEPUIS LA MAIN** pour une carte qui n'est pas un Objet (Lot 16
   * — Propagation, une Anomalie : « Après qu'un Altéré s'est Éveillé : … »).
   *
   * La capacité se propose dans la fenêtre de réaction alors que la carte
   * est encore EN MAIN, quand son déclencheur a lieu — avec `mode:
   * "optional"` et un `triggeredBy` d'observateur, elle est lue comme si la
   * carte était déjà en jeu. L'activer, c'est JOUER la carte : son coût est
   * payé, elle part au Cimetière comme une Anomalie résolue (sans être une
   * défausse), puis l'effet se résout.
   *
   * Une carte qui porte une telle capacité ne se joue PAS en phase
   * principale : elle n'a rien à y faire (`playCard` la refuse). Les Objets
   * réactifs, eux, ont leur propre voie — le Bris depuis la main
   * (`isBreakReaction`) — et n'ont pas besoin de ce drapeau.
   */
  playedFromHand?: boolean;

  /**
   * CE QUE DEVIENT LA STRUCTURE une fois sa Réaction cachée résolue
   * (grammaire des Structures-pièges, 22/09/2026).
   *
   * La grammaire de design prévoit trois issues après déclenchement, et
   * deux existaient déjà : **rester révélée** (le défaut, rien à déclarer)
   * et **être détruite** (un effet `saborde`/`destroy` sur soi, comme
   * n'importe quelle autre carte). Manquait la troisième.
   *
   *  - `"revelee"` — défaut. La révélation est définitive : la carte reste
   *    en jeu, connue, et sa moitié VISIBLE prend le relais si elle en a
   *    une (Filet à la Dérive).
   *  - `"remasquable"` — la révélation ne vaut que pour cette résolution.
   *    Dès qu'elle est refermée, `CardInstance.revealed` retombe, donc la
   *    Marée peut de nouveau la masquer, la projection joueur la cache de
   *    nouveau à l'adversaire, et sa Réaction cachée redevient éligible.
   *
   * Ce que « remasquable » NE fait PAS : effacer le journal. L'adversaire a
   * vu la carte se découvrir, l'événement `STRUCTURE_REVEALED` reste
   * consigné, et il sait donc ce qui l'a frappé. Ce qui revient, c'est la
   * capacité d'agir masquée — pas l'amnésie de l'autre.
   *
   * EXIGE une limite de fréquence (`oncePerTurnKey`, ou `onceEver`). Sans
   * elle, un piège qui se remasque reproposerait sa fenêtre à chaque
   * déclencheur, indéfiniment — c'est précisément le défaut de 43 fenêtres
   * par partie que la garde `revealed` avait corrigé. La conformité du
   * catalogue le vérifie.
   *
   * N'a de sens que sur une capacité `hiddenReaction` : ailleurs, il n'y a
   * rien à remasquer.
   */
  afterHiddenReaction?: "revelee" | "remasquable";
  /**
   * Filtres supplémentaires, évalués AVANT que `oncePerTurnKey` ne soit
   * consommé — contrairement à une condition posée sur un effet, qui laisse
   * le déclencheur brûler son unique usage du tour pour rien.
   *
   * `tideState` : pour `onTideStateEntered`/`onTideStateExited`, ne se
   * déclenche que pour cet état. `tideStateIn` : pour TOUT déclencheur, la
   * Marée doit être dans l'un de ces états.
   * `controlsAnyCardIds` : le contrôleur doit avoir au moins une de ces
   * cartes en jeu (ex: La Quête du Grand Nénuphar, « alors que vous
   * contrôlez un Destrier du Grand Étang »).
   */
  condition?: {
    /**
     * « Réaction cachée » : la capacité ne se propose que si sa porteuse est
     * MASQUÉE par la Marée. Indispensable dès qu'une carte porte À LA FOIS un
     * effet visible et une Réaction cachée — sans elle, les deux se
     * proposeraient en même temps et le texte promettrait deux fois la même
     * chose. Complément exact de `selfVisible`.
     */
    selfHidden?: boolean;
    /**
     * « si sa Puissance est supérieure ou égale à N » : seuil sur la
     * Puissance DÉCLARÉE de l'attaquant (`pendingAttack.attackerPower`).
     * N'a de sens que sur un déclencheur d'interception. Sert à distinguer
     * une défense anti-grosse-menace d'une défense anti-swarm (Filet à la
     * Dérive), sans dupliquer la même carte.
     */
    attackerPowerAtLeast?: number;
    /**
     * « lorsqu'une UNITÉ adverse attaque directement / inflige des dégâts
     * directs » : la fenêtre d'interception ne s'ouvre pas sur un TIR DE
     * NAVIRE (`TriggerEvent.fromShipShot`). Sans elle, `onIncomingDirectAttack`
     * couvre aussi les tirs — c'est voulu pour « votre Navire devrait subir
     * des dégâts directs » (arbitrage du 21/09/2026), pas pour un texte qui
     * nomme une unité attaquante.
     */
    attackFromUnit?: boolean;
    /**
     * « lorsqu'une de VOS UNITÉS est ciblée par une attaque » : l'attaque en
     * cours (`pendingAttack`) vise une unité que le contrôleur de la
     * capacité contrôle — pas son Navire (attaque directe), pas une
     * Structure.
     */
    attackTargetIsOwnUnit?: boolean;
    /**
     * … et cette unité attaquée est de ce sous-type (« quand un Altéré allié
     * est attaqué », Mutation Réflexe — Lot 16). À poser avec
     * `attackTargetIsOwnUnit`.
     */
    attackTargetSubtype?: string;
    /**
     * La porteuse a ce mot-clé en ce moment, imprimé ou accordé par un
     * modificateur (« pendant ce temps » : tant que L'Intangible est
     * inciblable, Lot 16).
     */
    selfHasKeyword?: string;
    /**
     * `onDeath` PERSONNEL (« quand il est détruit », « à sa destruction ») :
     * ne se déclenche que pour ces CAUSES de départ. Pendant, pour la carte
     * elle-même, de `TriggerSourceFilter.destroyedBy` : « détruite » n'est
     * pas « Sabordée » (`["combat", "effect", "tide"]`), un texte qui veut
     * les deux le dit (« détruite ou Sabordée »).
     */
    destroyedBy?: DestructionCause[];
    tideState?: TideStateName;
    tideStateIn?: TideStateName[];
    /**
     * La Marée actuelle doit avoir AU MOINS N tours restants
     * (`environment.tideRemainingTurns`). Pour une option « réduisez de N
     * tour(s) la durée de la Marée » sans `advanceTideOnZero` : la durée ne
     * descend jamais sous 1, donc à 1 tour restant l'option ne ferait rien —
     * elle ne se propose pas, plutôt que d'encaisser son coût pour rien
     * (Lanterne aux Verres Noirs).
     */
    tideRemainingTurnsAtLeast?: number;
    controlsAnyCardIds?: string[];
    /**
     * « si l'adversaire contrôle au moins N unités » : porte ANTI-SWARM
     * (Notion « Audit systémique » § Priorités de couverture, 21/09/2026).
     *
     * Ne compte que les UNITÉS (`UNIT_CARD_TYPES`) : c'est le nombre de
     * corps qui fait le swarm, pas le nombre de Slots occupés — une
     * Structure adverse ne doit pas armer une carte écrite contre un banc.
     *
     * Sur la CAPACITÉ et non sur un effet, comme `controllerHandAtLeast` :
     * un déclencheur qui brûlerait son `oncePerTurnKey` contre un plateau
     * trop étroit pour qu'il serve ne punit rien du tout.
     */
    opponentUnitsAtLeast?: number;
    /**
     * « si vous avez au moins N cartes en main » : taille de main MINIMALE
     * du contrôleur pour que la capacité se déclenche (ex: Gabier au Carnet
     * Mouillé, Lot 12).
     *
     * Sur la CAPACITÉ et non sur un effet, parce qu'une main change au fil
     * de la résolution : « défaussez 1 carte puis piochez 1 carte » gatée
     * effet par effet lirait une main déjà amputée pour la pioche, et le
     * texte se briserait exactement au seuil. Évaluée une fois, avant le
     * premier effet, elle décrit ce que le texte promet.
     */
    controllerHandAtLeast?: number;
    /**
     * « si vous avez 1 carte ou moins en main » (Dernières Réserves, Lot
     * 14) : plafond de main du contrôleur. Complément exact de
     * `controllerHandAtLeast`, et évalué au même endroit, avant le premier
     * effet — une pioche en cours de résolution ne doit pas invalider la
     * condition qui l'a autorisée.
     */
    controllerHandAtMost?: number;
    /**
     * « si l'adversaire contrôle plus d'unités que vous » (Cale Inondable,
     * Un Peu de Répit, L'Amiral sans Pavillon, Lot 14).
     *
     * Une comparaison, pas un seuil : c'est ce qui rend la carte
     * COMEBACK — elle ne s'arme que quand on est en retard, et s'éteint
     * dès qu'on a rattrapé. Compte les UNITÉS de chaque côté, comme
     * `opponentUnitsAtLeast` : une Structure n'est pas un corps.
     *
     * La carte qui porte la capacité n'entre PAS dans votre compte : « à
     * son arrivée, si l'adversaire contrôle plus d'unités que vous » se lit
     * sur le plateau où elle ARRIVE (Chargeur des Écueils, 26/09/2026 — une
     * unité contre deux en face, il doit prendre Pied marin ; compté avec
     * lui, le retard d'une unité, le plus courant, ne l'armait jamais).
     */
    opponentUnitsMoreThanController?: boolean;
    /**
     * « lorsque la troisième unité adverse attaque pendant un même tour »
     * (Cale Inondable, Lot 14) : nombre d'attaques déjà déclarées par
     * l'adversaire pendant CE tour de table, celle en cours comprise.
     *
     * Lu dans `PlayerState.attacksDeclaredThisTurn`, remis à zéro à
     * l'entame de chaque tour : compter les attaques est la seule façon
     * d'exprimer « la troisième » sans que la carte ait à retenir un état
     * qui lui serait propre.
     */
    opponentAttacksThisTurnAtLeast?: number;
    /**
     * « la PREMIÈRE unité adverse qui attaque chaque tour » (Cale Inondable,
     * effet visible) : au plus N attaques adverses ce tour, celle en cours
     * comprise — `1` = seulement la première. Même compte que
     * `opponentAttacksThisTurnAtLeast`. Sans elle, une première attaque qui
     * ne remplit pas une autre condition laissait l'usage du tour à la
     * suivante, qui n'est plus « la première ».
     */
    opponentAttacksThisTurnAtMost?: number;
    /**
     * « la première unité adverse jouée APRÈS LA TROISIÈME chaque tour »
     * (Barils de Poudre) : l'adversaire a JOUÉ au moins N unités pendant ce
     * tour, celle qui arrive comprise (`PlayerState.unitsPlayedThisTurn`,
     * compté avant ses déclencheurs d'arrivée). Un compte des POSES, pas
     * du plateau : à associer à `triggeredBy.onlyPlayed`.
     */
    opponentUnitsPlayedThisTurnAtLeast?: number;
    /**
     * « si elle est visible » : la carte porteuse doit être visible dans la
     * Marée courante (ex: Filet à la Dérive). Indispensable pour une
     * capacité facultative — sans elle, une Structure cachée se proposerait
     * dans la fenêtre de réaction pour n'y rien résoudre.
     */
    selfVisible?: boolean;
    /**
     * « si une carte Un Dead a rejoint votre Cimetière ce tour » / « depuis
     * votre dernier tour » (Lot 13). Lue dans
     * `PlayerState.graveyardArrivals`, pas dans le Cimetière lui-même : le
     * Cimetière dit ce qui s'y trouve, jamais quand ni d'où c'est venu.
     *
     * `since` : `"thisTurn"` = le tour de table courant ; `"lastOwnTurn"` =
     * depuis le tour précédent du contrôleur, ce qui inclut le tour adverse
     * intercalé — la fenêtre que décrit « depuis votre dernier tour » sur
     * une capacité de début de tour (Promis, j'attends).
     */
    graveyardArrival?: {
      /** Ne compte que les cartes de ce sous-type (ex: "un-dead"). */
      subtype?: string;
      /** Ou précisément l'une de ces cartes. */
      cardIds?: string[];
      /**
       * Restreint à une provenance : `"hand"` pour une défausse, `"board"`
       * pour une destruction. Absent = d'où qu'elle vienne.
       */
      fromZone?: "hand" | "board" | "deck";
      /** « une UNITÉ Un Dead » : ne compte que les cartes de ces types. */
      cardTypes?: CardType[];
      /** « a été DÉTRUITE » : ne compte que les départs du plateau de ces causes (un Sabordage, un Bris ou une expiration n'en est pas une). */
      destroyedBy?: DestructionCause[];
      since: "thisTurn" | "lastOwnTurn";
    };
    /**
     * « pendant votre tour », « pendant chacun de vos tours » (Lot 15) : la
     * capacité ne se déclenche que si son contrôleur est le joueur actif.
     * Sur la CAPACITÉ, pour ne pas brûler le « une fois par tour » pendant
     * le tour adverse.
     */
    duringOwnTurn?: boolean;
    /**
     * « pendant le tour adverse » (Bouclier d'Écume) : complément de
     * `duringOwnTurn` — la capacité ne se déclenche que si son contrôleur
     * n'est PAS le joueur actif.
     */
    duringOpponentTurn?: boolean;
    /**
     * FAITS DE JOUEUR (Lot 17 — `onArmorGained`, `onDieResolved`,
     * `onCardPutUnderDeck`, `onExtraCardDrawn`, `onCardLeftGraveyard`,
     * `onLandePlaced`) : de QUI le fait doit être. `"self"` (défaut) : le
     * contrôleur de la capacité ; `"opponent"` : son adversaire (« la
     * première fois que l'adversaire pioche… ») ; `"any"` : l'un ou l'autre
     * (« la première fois qu'une Lande arrive en jeu »).
     */
    factOf?: "self" | "opponent" | "any";
    /** `onDieResolved` : issues qui déclenchent (« Réussite critique », « Échec critique », « vous avantage »). */
    dieOutcomes?: import("@/game/triggers/types").DieOutcome[];
    /** « si une Lande est active » (Lot 17) : la capacité ne se déclenche que si une Lande est en jeu. */
    landeActive?: boolean;
    /** « S'il entre en jeu par l'effet de [carte] » (Lot 17 — lignée LV) : la porteuse est arrivée en remplaçant cette carte. */
    selfArrivedVia?: string;
    /** La porteuse a été MARQUÉE ce tour par `flagThisTurn` (« lorsqu'il attaque ce tour », après une Réussite critique). */
    selfFlaggedThisTurn?: string;
    /** « si vous contrôlez une carte [étiquette] » (Lot 17 — « une carte LV »). */
    controlsTag?: string;
    /**
     * « si vous contrôlez au moins N autres unités » (Le Déserteur Gris) :
     * compte les UNITÉS du contrôleur, la porteuse exclue.
     */
    controllerOtherUnitsAtLeast?: number;
    /**
     * « si votre Navire a moins d'Ancrage que le Navire adverse » (La Bête
     * qu'on n'attend plus) : une comparaison, comme toutes les portes de
     * comeback — elle s'éteint dès qu'on a rattrapé.
     */
    controllerAnchorBelowOpponent?: boolean;
    /**
     * « une Sentinelle d'une couleur que vous ne contrôliez pas encore »
     * (Poste Chromatique) : la carte DÉCLENCHEUSE apporte au moins une
     * couleur qu'aucune autre carte de votre plateau ne portait.
     */
    triggerSourceBringsNewChromaticColor?: boolean;
    /** « À son arrivée PAR ASSEMBLAGE » (Le Géant Chromatique — ABYSSALE). */
    selfArrivedByAssemblage?: boolean;
    /**
     * `onPermanentWouldBeDestroyed` : la carte condamnée part sous des
     * DÉGÂTS (« devrait être détruite par des dégâts », Porte-Éclats) — pas
     * sous un effet de destruction, un Sabordage ou la Marée.
     */
    triggerSourceDoomedByDamage?: boolean;
  };

  /**
   * « la première fois que CHACUNE de vos unités… » (Jusqu'à ce que ça
   * casse) : le « une fois par tour » de `oncePerTurnKey` se suit sur la
   * carte DÉCLENCHEUSE et non sur la porteuse. Une seule porteuse peut ainsi
   * répondre une fois pour chaque unité, et non une fois en tout.
   */
  oncePerTurnPerTriggerSource?: boolean;

  /** Réagit à ce qui arrive à une AUTRE carte (cf. `TriggerSourceFilter`). */
  triggeredBy?: TriggerSourceFilter;

  /**
   * "La première fois à chaque tour que..." : clé de suivi dans
   * `CardInstance.oncePerTurnFlags`, propre à cette capacité (ex:
   * "bavardAllyEnter"). Sans elle, la capacité se déclenche autant de fois
   * que l'événement se produit.
   */
  oncePerTurnKey?: string;
  /**
   * "La PREMIÈRE fois que..." (une seule fois par instance, jamais
   * réarmée d'un tour à l'autre — ex: Il Capitano Naufragé). Se combine à
   * `oncePerTurnKey`, qui fournit la clé de suivi.
   */
  onceEver?: boolean;
  /**
   * « Choisissez : A ou B » — plusieurs capacités facultatives d'une même
   * carte, proposées ensemble dans la fenêtre de réaction, dont UNE SEULE
   * peut être activée par déclenchement : activer l'une écarte les autres
   * du même groupe pour le reste de la fenêtre (ex: Il Dottore des Noyés).
   * Contrairement à `oncePerTurnKey`, une arrivée REJOUÉE dans le même tour
   * (Colombina) repropose le choix.
   */
  choiceGroup?: string;
  /**
   * « Choisissez N effets DIFFÉRENTS » (Lot 17 — Eidolon Opalin LVX) : la
   * question du `choiceGroup` (automatique) se repose jusqu'à N fois, sans
   * les options déjà prises. Lu sur la première capacité du groupe.
   */
  choiceGroupPicks?: number;
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
  cost?: {
    reason?: number;
    /**
     * « vous pouvez payer 3 Ancrage » (Jugement du Phare, Lot 14) : une
     * capacité peut se payer en COQUE plutôt qu'en Raison.
     *
     * Pourquoi l'Ancrage est un coût à part. La Raison n'a pas de plancher
     * — on paie toujours, quitte à s'endetter — alors que l'Ancrage EST la
     * condition de victoire : descendre à 0 perd la partie. Un coût en
     * Ancrage est donc refusé s'il ne peut pas être payé en restant
     * vivant, là où un coût en Raison ne refuse jamais rien.
     *
     * Il ne passe par aucun bouclier de perte de Raison : ce n'est pas de
     * la Raison.
     */
    anchor?: number;
  };
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
  /** Le contrôleur a au moins une de ces cartes nommées en jeu (ex: Chevalier Cra-Poiscail, "tant que vous contrôlez un Destrier du Grand Étang"). */
  controllingCardIds?: string[];
  /** Le CONTRÔLEUR de la carte (pas un joueur quelconque) a au plus cette Raison. */
  controllerReasonAtMost?: number;
  /** La Marée courante doit être l'un de ces états. */
  tideStateIn?: TideStateName[];
  /** « Tant qu'il est blessé, il a Garde » (Mufle au Fanion) : la carte porte des dégâts. */
  selfDamaged?: boolean;
  /**
   * « Tant qu'elle a 3 Résistance ou moins » (La Grande Fissure) : la
   * Résistance RESTANTE — Résistance effective moins dégâts marqués.
   */
  selfResistanceAtMost?: number;
  /**
   * « Tant que vous contrôlez une Sentinelle d'une autre couleur » (Rempart
   * du Soleil) — cf. `isOtherColorSentinel`, `game/rules/chromatic.ts`.
   */
  controllingOtherColorSentinel?: boolean;
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
  /**
   * Sous-catégorie optionnelle et extensible (ex: "marionnette",
   * "objet-flottant"). C'est une FAMILLE de jeu, pas une variante : la
   * version Abyssale d'une carte se déclare avec `variant`, sinon une
   * Marionnette Abyssale devrait choisir entre les deux et sortirait de sa
   * troupe (décision du 2026-09-17).
   */
  subtype?: string;

  /**
   * Sous-types TRANSVERSAUX (`game/cards/subtypes.ts`) : espèce, rôle,
   * nature (« Amphibien, Chevalier »). S'ajoutent à `subtype` ; ensemble, au
   * plus `MAX_SUBTYPES`, affichés sous le type. Un effet qui vise un
   * sous-type les lit tous (`hasSubtype`) : c'est ce qui fait passer une
   * synergie d'un archétype à l'autre.
   */
  subtypes?: readonly import("@/game/cards/subtypes").SubtypeId[];

  /**
   * Version de la carte : toute carte est STANDARD par défaut, ou
   * `"abyssale"` pour sa variante. Indépendant de `subtype` et de
   * `archetype`, et cohérent avec la rareté "abyssal" que
   * `game/boosters/cardRarity.ts` déduit du suffixe d'identifiant
   * `-abyssal` (invariant vérifié par `tests/game/cardConformity.test.ts`).
   */
  variant?: "standard" | "abyssale";

  /**
   * Famille de cartes à laquelle appartient cette carte
   * (`game/cards/archetypes.ts`). Lue par le moteur pour compter/cibler
   * les membres d'un archétype. Affichée DISCRÈTEMENT sur la face, en petit,
   * en bas au centre (décision du 09/10/2026 : la ligne sous le type
   * revient aux sous-types).
   */
  archetype?: ArchetypeId;

  /**
   * Famille conçue pour se reconnaître (Notion, Catalogue, 05/10/2026 :
   * les Opalins). Depuis le 06/10/2026, toutes les familles s'affichent
   * sous le type : ce marqueur ne change plus le rendu, il garde la trace
   * de cette intention de design.
   */
  showsArchetype?: boolean;

  /**
   * Carte JETON (Péon) : créée uniquement par un effet d'invocation, jamais
   * en main, jamais dans un deck, jamais dans la collection ni dans un
   * booster. Concrètement elle vit dans `TOKEN_SET` et non dans `CORE_SET`
   * (le catalogue collectionnable), ce qui l'exclut mécaniquement du seed
   * `cards`, du deckbuilding et des pools de boosters — ce drapeau sert à
   * l'affichage (cadre de jeton) et aux garde-fous.
   */
  token?: boolean;

  /**
   * Nombre de variantes d'illustration interchangeables, pour une carte
   * dont le visuel est tiré au sort à la création (Péon Cra-Poiscail : 3
   * visuels, une seule identité de gameplay). Les fichiers suivent
   * `illustrations/<cardId>-<n>.webp`, n de 1 à `illustrationVariants`.
   * `undefined` = un seul visuel, `illustrations/<cardId>.webp`.
   */
  illustrationVariants?: number;

  /**
   * Lot de diffusion, miroir de `cards.set_code`. `undefined` = "core", le
   * pool historique tiré par les boosters existants. Une carte d'un autre
   * lot est bien dans le catalogue (jouable, affichable, seedée) mais
   * n'entre dans aucun booster tant qu'un booster ne déclare pas son lot —
   * c'est ce qui tient le plan de diffusion du Lot 10 (3 boosters
   * successifs, aucun Cra-Poiscail dans le Bienvenue).
   */
  setCode?: string;
  cost: number;
  /**
   * « Jouable uniquement si… » : condition de JOUABILITÉ de la carte,
   * vérifiée avant même de la payer (`game/rules/validation.ts`). Une
   * carte dont la condition n'est pas remplie ne se pose pas — elle reste
   * en main, et rien n'est dépensé.
   *
   * À distinguer d'une `condition` de capacité, qui laisse la carte se
   * poser mais son effet sans objet. Ici le texte dit « jouable
   * uniquement si », donc c'est la POSE elle-même qui est refusée.
   *
   * Un Objet Brisé DEPUIS LA MAIN est joué lui aussi : la même condition
   * refuse ce Bris (`breakObject`), sans quoi il contournait la pose.
   */
  playableOnlyIf?: {
    /**
     * L'Ancrage du contrôleur ne dépasse pas cette FRACTION de l'Ancrage
     * de départ de son Navire (« si vous avez perdu au moins la moitié de
     * votre Ancrage initial » → 0.5, On Flotte Encore).
     *
     * Une fraction et non un nombre : les Navires n'ont pas la même coque
     * (26 à 36), et « la moitié » doit vouloir dire la même chose pour
     * tous.
     */
    controllerAnchorAtMostRatioOfStart?: number;
    /**
     * « si vous contrôlez au moins 3 couleurs différentes » (Formation
     * Prismatique) : couleurs chromatiques CONTRÔLÉES, Éclats et couleurs
     * revendiquées compris (`controlledChromaticColors`).
     */
    controllerChromaticColorsAtLeast?: number;
    /** « Ne peut être joué normalement que si vous contrôlez une unité [famille] » (Eidolon Opalin LV5, Lot 17). */
    controlsArchetypeUnit?: import("@/game/cards/archetypes").ArchetypeId;
  };

  /**
   * Identité chromatique IMPRIMÉE (Lot 15). `colors` : ce que la carte est ;
   * `emitsSignal` : elle émet le Signal de chacune de ses couleurs (une
   * Sentinelle), là où un Éclat Chromatique n'émet rien.
   * `benefitsFromOwnSignals` : elle bénéficie aussi des Signaux de ses
   * propres couleurs (Le Géant Chromatique) — par défaut, une Sentinelle ne
   * reçoit que ceux des AUTRES couleurs.
   */
  chromatic?: { colors?: ChromaticColor[]; emitsSignal?: boolean; benefitsFromOwnSignals?: boolean };

  /**
   * « Assemblage Chromatique » (Le Géant Chromatique) : coût ALTERNATIF.
   * Placer au Cimetière `sentinels` Sentinelles de couleurs différentes que
   * l'on contrôle, sans les détruire, et payer `reasonCost` au lieu du
   * coût. La carte prend alors les couleurs utilisées, et les émet.
   */
  chromaticAssemblage?: { sentinels: number; reasonCost: number };

  /**
   * Pour un Équipement : les couleurs qu'il PORTE (gagnées en jeu) sont
   * aussi celles de l'unité qu'il équipe, sans Signal de plus (Bracelet
   * Chromatique, « elle n'émet toujours qu'un seul Signal »).
   */
  equipSharesChromaticColors?: boolean;

  /** « Tant qu'il est blessé, il a +1 Puissance » (Duelliste de Verre). */
  selfBuffWhileDamaged?: { attackAmount?: number; healthAmount?: number };

  /**
   * « Tant qu'au moins 2 de vos unités portent un marqueur Mort, il gagne
   * +2 Puissance » (Le Gardien des Jouets, Lot 18) : bonus sur soi, relu en
   * direct, tant que le plateau de son contrôleur compte au moins `atLeast`
   * UNITÉS qui portent `marker` (elle-même comprise si elle en porte un).
   */
  selfBuffWhileMarkedUnitsAtLeast?: { marker: import("@/game/cards/markers").MarkerId; atLeast: number; attackAmount?: number; healthAmount?: number };

  /**
   * « Vos unités qui portent un marqueur Mort gagnent +1 Puissance » (Le
   * Grand Frère, Lot 18) : aura sur chaque UNITÉ de son contrôleur qui porte
   * `marker` — la source comprise, si elle en porte un : le texte dit « vos
   * unités », pas « vos autres unités ».
   */
  auraBuffMarkedUnits?: { marker: import("@/game/cards/markers").MarkerId; attackAmount?: number; healthAmount?: number };

  /** « Tant qu'il est votre seule unité, il a +1 Puissance » (Destrier du Ressac). */
  selfBuffWhileOnlyUnit?: { attackAmount?: number; healthAmount?: number };

  /**
   * « Lorsqu'elle attaque une unité ayant Garde, elle gagne +1 Puissance
   * pour cette attaque » (Monture de Brèche) : bonus de dégâts contre une
   * CIBLE portant ce mot-clé, recalculé à chaque combat comme
   * `bonusDamageVsTargetType`.
   */
  bonusDamageVsKeyword?: { keyword: string; amount: number };

  /**
   * « Après qu'elle attaque, elle subit 1 dégât » (Bretteuse au Bord) :
   * après TOUTE attaque, directe ou contre une unité, une fois le combat
   * résolu. À distinguer de `selfDamageOnDirectAttack`, réservé à la coque.
   */
  selfDamageAfterAttack?: number;

  /**
   * « Lorsqu'elle devrait subir 3 dégâts ou plus d'une seule source,
   * réduisez ces dégâts de 1 » (Vieille-Selle). Chaque fois, sans limite :
   * c'est une peau épaisse, pas un bouclier qui s'use.
   */
  reduceLargeDamageTaken?: { atLeast: number; amount: number };

  /**
   * « La première fois à chaque tour qu'elle devrait être renvoyée en main,
   * déplacée ou détruite par un effet adverse, (vous pouvez) lui retirer
   * 1 Résistance à la place » (Bête de Halage). Remplacement appliqué là où
   * le renvoi et la destruction se décident — cf. l'exception motivée dans
   * `tests/game/cardConformity.test.ts`.
   */
  opponentRemovalShieldOncePerTurn?: { healthLoss: number };

  /**
   * Pour un Équipement : « La première fois que l'unité équipée devrait
   * être renvoyée en main par un effet adverse, détruisez cet Équipement à
   * la place » (Harnais de Retenue). Consommé par sa propre destruction.
   */
  bounceSubstituteThenDestroy?: boolean;

  /**
   * Pour un Équipement : bonus accordé au porteur seulement s'il coûte au
   * moins `cost` (Selle de Guerre, « si elle coûte 4 ou plus, elle gagne
   * aussi +1 Résistance »). Coût IMPRIMÉ du porteur.
   */
  equipGrantsBuffIfBearerCostAtLeast?: { cost: number; attackAmount?: number; healthAmount?: number };

  /**
   * « Jusqu'à la fin du tour, … » porté par un PERMANENT (Jusqu'à ce que ça
   * casse) : la carte reste en jeu le temps du tour, pour que sa capacité
   * puisse répondre, et part au Cimetière quand le tour se termine — une
   * expiration, ni mort ni Sabordage.
   */
  expiresAtEndOfTurn?: boolean;
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
   * "La première fois à chaque tour qu'il devrait être détruit, il reste à
   * 1 Résistance à la place" (ex: Revenante de la Fosse, en Abysses
   * seulement ; Encore cinq minutes, en toute Marée — `tideStateIn` absent
   * = aucune restriction d'état). Traité dans `game/state/processDeaths.ts` : les dégâts
   * marqués sont ramenés juste sous la vie effective, une fois par tour
   * (`oncePerTurnFlags`). Ne sauve pas d'une destruction directe par la
   * Marée (`destroyedByTide`).
   */
  survivesLethalOncePerTurn?: {
    /**
     * « La PREMIÈRE fois qu'il devrait être détruit » (Le Naufragé
     * Impossible, Lot 14) : la survie ne se réarme jamais d'un tour à
     * l'autre — un seul sauvetage pour toute la partie, sur cette instance.
     */
    onceEver?: boolean;
    tideStateIn?: TideStateName[];
    /**
     * « qu'elle devrait être détruite AU COMBAT » : la survie ne joue que
     * contre ces causes. Absent = contre n'importe quelle destruction par
     * dégâts (la destruction directe par la Marée reste exclue de toute
     * façon, cf. `applySelfSurvival`).
     */
    from?: DestructionCause[];
  };

  /**
   * Contrecoup (Cylindre flottant) : tant que la carte est visible, la
   * première attaque directe contre le Navire de son contrôleur est
   * ANNULÉE, `reflectedFraction` des dégâts annulés (arrondi au supérieur)
   * est infligé au Navire de l'attaquant, puis la carte se brise et quitte
   * le board. Résolu dans `game/actions/attack.ts`.
   */
  contrecoupOnDirectShipDamageWhileVisible?: { reflectedFraction: number };

  /**
   * Taxe de Bris (Cloche d'Alerte) : tant que la carte est visible, le
   * premier Bris d'Objet de l'ADVERSAIRE à chaque tour lui coûte `amount`
   * de Raison en plus — depuis la main (ajouté au demi-coût) comme depuis le
   * plateau (où le Bris est sinon gratuit). Résolu dans `breakObject.ts`.
   *
   * `blocksIfUnpayable` réalise « s'il ne peut pas payer, l'Objet ne peut
   * pas être Brisé » : le Bris taxé exige alors que la Raison courante
   * couvre le coût TOTAL, et il est refusé sinon. C'est la seule entorse au
   * « pas de plancher de Déraison » (design du 16/09/2026), et elle est
   * volontairement portée par la CARTE, pas par le moteur : hors taxe, un
   * coût se paie toujours, quitte à creuser la dette. Sans ce drapeau, la
   * taxe s'ajoute au coût et n'empêche jamais rien.
   */
  taxOpponentObjectBreakOncePerTurnWhileVisible?: { amount: number; blocksIfUnpayable?: boolean };

  /**
   * Pour un Équipement uniquement : CONTRE-INDICATION à la règle générale
   * « un Équipement suit son porteur au cimetière ». Par défaut, quand le
   * permanent équipé quitte le plateau (destruction, Sabordage,
   * expiration…), l'Équipement attaché est détruit avec lui
   * (`game/state/processDeaths.ts`, `destroyOrphanedEquipment`). Un
   * Équipement qui déclare `survivesOwnerDestruction` reste en jeu, sans
   * porteur, jusqu'à ce qu'un effet le rattache ou le détruise.
   */
  survivesOwnerDestruction?: boolean;

  /**
   * Pour un Équipement uniquement : la PREMIÈRE fois que le permanent
   * équipé devrait subir des dégâts d'EFFET, réduit ces dégâts de
   * `amount`, puis CET Équipement est détruit (ex: Casque-Coquille, 1).
   *
   * "Dégâts d'effet" = la Marée et le texte d'une carte, jamais le combat
   * (arbitrage du 2026-09-14 : « c'est la marée, c'est l'effet d'une
   * carte, pas un dégât physique ») — d'où deux points d'appel seulement :
   * l'effet `damage` (`game/effects/resolveEffect.ts`) et le malus de
   * Houle (`game/environment/resolveEnvironment.ts`). Pas de suivi
   * "1ère fois par tour" : le texte dit "la première fois", point — la
   * destruction de l'Équipement est ce qui le consomme.
   */
  reduceEquippedEffectDamageThenDestroy?: number;

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
   * Pour un Équipement uniquement : restreint en plus sa cible aux membres
   * d'une famille ("Équipez un Cra-Poiscail", Lot 10). Se combine avec
   * `equipTargetTypes` — les deux doivent être satisfaits.
   */
  equipTargetArchetype?: ArchetypeId;
  /**
   * Restreint la cible à un SOUS-TYPE (ex: « Équipez une unité Un Dead »,
   * Lot 13). Même logique que `equipTargetArchetype`, pour les familles qui
   * s'expriment en sous-type plutôt qu'en archétype (Marionnette, Volatile,
   * Un Dead) : cumulatif avec `equipTargetTypes`.
   */
  equipTargetSubtype?: string;

  /**
   * Pour les Objets uniquement : effets résolus quand l'Objet est brisé
   * (`game/actions/breakObject.ts`). L'Objet quitte alors le board — ce
   * n'est ni une mort (`onDeath`) ni un Sabordage (`onSaborde`).
   */
  onBreakEffects?: EffectDefinition[];

  /** Capacités déclenchées par des événements de jeu ultérieurs. */
  abilities?: TriggeredAbility[];

  /**
   * Pour Structure/Objet uniquement : durée de vie en TOURS DE TABLE
   * (« Durée : N tours de table »). Le décompte a lieu à l'entame du tour
   * de son contrôleur : N tours de table = N de ses tours.
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
   * Pour un Objet uniquement : « une seule carte NOMMÉE ainsi peut être
   * Brisée par tour » (Changement de rôle !). Compté par NOM et par joueur
   * sur le tour de table (`PlayerState.objectsBrokenThisTurn`), depuis la
   * main comme depuis le plateau : plusieurs exemplaires ne s'enchaînent
   * pas.
   */
  breakOncePerTurnByName?: boolean;

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
   * « Lorsqu'il attaque une Structure, il gagne +1 PUISSANCE pour ce combat »
   * (Barracuda des Hauts-Fonds, Corde de Remorquage) : pour une unité
   * ATTAQUANTE (ou l'Équipement qui l'équipe), +N à la Puissance DÉCLARÉE
   * de l'attaque (`pendingAttack.attackerPower`) quand sa cible est de ce
   * type. Distinct de `bonusDamageVsTargetType` (« infligez 1 dégât
   * supplémentaire », Poisson-Scie Gris) : c'est la Puissance que lisent
   * les pièges et les conditions (`attackerPowerAtLeast`,
   * `modifyAttackerPower`). Jamais stocké comme modificateur, sans effet
   * sur la riposte ni sur une attaque directe.
   */
  bonusPowerVsTargetType?: { type: CardType; amount: number };

  /**
   * Pour une unité ATTAQUANTE (ou l'Équipement qui l'équipe) : dégâts
   * qu'elle s'inflige à elle-même après une attaque DIRECTE réussie contre
   * le Navire adverse (ex: Requin Balafré, Harpon de Pont). Ne s'applique
   * jamais à une attaque contre une autre unité.
   */
  selfDamageOnDirectAttack?: number;

  /**
   * Variante de `selfDamageOnDirectAttack` pour « lorsqu'il INFLIGE des
   * dégâts directs au Navire adverse » (Requin Balafré) : ne s'applique que
   * si la coque a réellement subi des dégâts (> 0) — pas après une
   * interception, un Contrecoup, un bouclier ou un plafond qui ramène le
   * coup à 0. « S'il attaque directement » (Harpon de Pont) garde
   * `selfDamageOnDirectAttack`, qui se paie dans tous les cas.
   */
  selfDamageOnDirectDamageDealt?: number;

  /**
   * Pour une unité ATTAQUANTE (ou l'Équipement qui l'équipe) : l'adversaire
   * perd cette Raison en plus quand elle INFLIGE des dégâts DIRECTS à son
   * Navire (ex: Anguille des Profondeurs, Bat-Marin Abyssal) — seulement si
   * la coque a réellement subi des dégâts (> 0), et sous réserve du bouclier
   * de perte de Raison du défenseur. `tideStateIn`
   * restreint l'effet à ces états de Marée (souvent Abysses) ; absent =
   * toujours actif.
   */
  opponentReasonLossOnDirectAttack?: { amount: number; tideStateIn?: TideStateName[] };

  /**
   * Pour un Équipement UNIQUEMENT : mots-clés qu'il transmet à l'unité
   * qu'il équipe tant qu'il reste attaché (ex: Chaîne de Fer Noir, "Elle
   * gagne ... Garde"). Vérifié par `hasEffectiveKeyword` en scannant
   * l'Équipement attaché au permanent concerné — jamais suppressible par
   * `conditionalKeywordSuppressions` (propres à la carte équipée elle-même,
   * pas à son Équipement).
   */
  equipGrantsKeywords?: string[];

  /**
   * Pour un Équipement UNIQUEMENT : son contrôleur perd cette Raison quand
   * l'unité qu'il équipe est DÉTRUITE — combat, effet ou Marée, tout départ
   * réglé par `processDeaths` (ex: Chaîne de Fer Noir, "Si elle est
   * détruite, perdez 1 Raison"). Jamais quand elle est Sabordée : un
   * Sabordage n'est pas une destruction. La perte passe par le bouclier de
   * perte de Raison (`loseReason`).
   */
  controllerReasonLossOnOwnDestruction?: number;


  /**
   * Pour une unité ATTAQUANTE : dégâts supplémentaires infligés (cible
   * unité OU Navire adverse en attaque directe, contrairement à
   * `bonusDamageVsTargetType` qui ne s'applique qu'aux attaques d'unité)
   * quand l'attaque a lieu pendant l'un de ces états de Marée (ex:
   * Harponneur du Dernier Quai, "+1 Puissance pendant Tempête").
   */
  bonusDamageInTideState?: { tideStateIn: TideStateName[]; amount: number };

  /**
   * Pour une unité ATTAQUANTE : son contrôleur perd cette Raison après
   * CHAQUE attaque qu'elle effectue (directe ou contre une unité) — ex:
   * Harponneur du Dernier Quai, "Après l'attaque, perdez 1 Raison."
   */
  controllerReasonLossAfterAttack?: number;

  // --- Boucliers "1ère fois par tour" (cf. `game/state/shields.ts` +
  // `CardInstance.oncePerTurnFlags`) : chacun réduit/restaure un montant la
  // PREMIÈRE fois que la situation décrite se produit pour son contrôleur
  // au cours d'un même tour, jamais plus. -----------------------------

  /** Réduit la perte de Raison de son contrôleur, toute source confondue (ex: Vieux Loup de Mer, Seconde au Visage Pâle avec `tideStateIn`). */
  reduceOwnReasonLossOncePerTurn?: { amount: number; tideStateIn?: TideStateName[] };

  /** Réduit les dégâts de MARÉE subis par le Navire de son contrôleur, dans ces états (ex: Brise-Vague de Fortune, Tempête uniquement). `onceEver` : un seul usage pour toute la partie, jamais réarmé d'un tour à l'autre. */
  reduceTideShipDamageOncePerTurn?: { amount: number; tideStateIn: TideStateName[]; onceEver?: boolean };

  /** Réduit les dégâts DIRECTS (attaque d'unité contre le Navire) subis par son contrôleur (ex: Cage de Flottaison, « qu'une Créature devrait infliger »). `attackerCardTypes` restreint aux attaquants de ces types ; absent, tout attaquant compte. */
  reduceDirectShipDamageOncePerTurn?: { amount: number; attackerCardTypes?: CardType[] };

  /** Plafonne les dégâts DIRECTS d'une même attaque contre le Navire de son contrôleur, tant que la carte est visible (`visibleDuringTide`) — ex: Carcasse Renversée. */
  capDirectShipDamageWhileVisible?: number;



  /** Restaure cette Résistance à une Structure alliée la première fois qu'elle en perd, ce tour-ci (ex: Wood Vy). */
  restoreResistanceOnAllyStructureLossOncePerTurn?: number;

  // --- Auras/stats dynamiques (cf. `computeEffectiveStats`, qui reçoit
  // désormais le plateau et la Raison du CONTRÔLEUR de l'unité évaluée pour
  // les calculer à la volée, jamais stockées sur `CardInstance`) --------

  /** Bonus permanent sur SOI-MÊME tant que son contrôleur possède au moins une Structure VISIBLE sur son plateau (ex: Bernard-l'Ermite d'Acier). */
  selfBuffWhileControllingVisibleStructure?: { attackAmount?: number; healthAmount?: number };

  /** Bonus permanent sur SOI-MÊME tant que la Raison de son contrôleur est ≤ ce seuil (ex: Matelot Insomniaque). */
  selfBuffWhileControllerReasonAtMost?: { reasonAtMost: number; attackAmount?: number; healthAmount?: number };

  /**
   * Bonus permanent sur SOI-MÊME tant que le contrôleur a l'une de ces
   * cartes NOMMÉES en jeu (ex: Chevalier Cra-Poiscail, "tant que vous
   * contrôlez un Destrier du Grand Étang"). Le duo Chevalier/Destrier est
   * une synergie de cartes précises, pas d'archétype : elle ne peut pas
   * passer par `selfBuffWhileControllingArchetype`.
   */
  selfBuffWhileControllingCardIds?: { cardIds: string[]; attackAmount?: number; healthAmount?: number };

  /**
   * Aura : bonus accordé aux cartes NOMMÉES contrôlées par le même joueur,
   * tant que cette carte-ci est en jeu (ex: Écuyer et Destrier, qui
   * renforcent tous deux "votre Chevalier Cra-Poiscail").
   */
  auraBuffCardIds?: { cardIds: string[]; attackAmount?: number; healthAmount?: number };

  /**
   * Bonus permanent sur SOI-MÊME tant que la Marée monte ou descend (ex:
   * Cra-Poiscail des Bas-Fonds pendant une Marée descendante, des
   * Hautes-Eaux pendant une montante). Porte sur l'ORIENTATION, pas sur
   * l'état : c'est le sens du cycle qui compte, pas Calme/Houle/…
   */
  selfBuffWhileTideOrientation?: {
    orientation: "montante" | "descendante";
    attackAmount?: number;
    healthAmount?: number;
  };

  /**
   * Bonus permanent sur SOI-MÊME tant que son contrôleur a au moins
   * `atLeast` MARINS/CRÉATURES de cet archétype sur son plateau — les
   * Structures, Objets et Anomalies de la famille ne comptent pas
   * (`countArchetypeUnits`, règle du 2026-09-14) (ex: Banc de
   * Cra-Poiscail, "tant que vous contrôlez au moins 3 AUTRES
   * Cra-Poiscail"). `excludeSelf` décide si la carte se compte elle-même —
   * le catalogue distingue les deux formulations ("3 autres" vs "3
   * Cra-Poiscail"), et l'écart d'un corps change complètement la carte.
   */
  selfBuffWhileControllingArchetype?: {
    archetype: ArchetypeId;
    atLeast: number;
    excludeSelf?: boolean;
    attackAmount?: number;
    healthAmount?: number;
  };

  /**
   * Aura : bonus accordé aux AUTRES permanents de cet archétype contrôlés
   * par le même joueur (ex: Cra-Poiscail Porte-Étendard, "vos autres
   * Cra-Poiscail gagnent +1 Puissance"). `requiresArchetypeCountAtLeast`
   * conditionne l'aura à une taille de banc (ex: Le Trône de Bouchon,
   * "tant que vous contrôlez au moins 3 Cra-Poiscail"), en comptant CETTE
   * carte si elle appartient elle-même à l'archétype.
   */
  auraBuffOtherArchetypeUnits?: {
    archetype: ArchetypeId;
    attackAmount?: number;
    healthAmount?: number;
    requiresArchetypeCountAtLeast?: number;
  };


  /**
   * Aura par TYPE DE CARTE sur le plateau du contrôleur (Lot 14) :
   * « Les unités que vous contrôlez ont +2 Résistance tant que Filet de
   * Sauvetage est visible », « Vos autres Structures ont +1 Résistance ».
   *
   * C'est un BUFF CONTINU, recalculé à chaque lecture des stats — pas un
   * soin. Il augmente la Résistance MAXIMALE ; les dégâts déjà marqués
   * restent marqués. Quand la source cesse de porter l'aura (elle se
   * masque, elle quitte le plateau), le bonus disparaît de lui-même, et
   * une unité dont les dégâts dépassent alors sa Résistance retombée
   * meurt au prochain contrôle de morts. C'est la différence exacte entre
   * « +2 Résistance » et « restaurez 2 Résistance ».
   *
   * L'aura ne s'applique JAMAIS à sa propre source (règle commune à toutes
   * les auras) : « vos AUTRES Structures » est donc le comportement par
   * défaut, sans rien à déclarer.
   */
  auraBuffControllerCardTypes?: {
    /** Types de carte qui reçoivent l'aura (ex: `["marin", "creature"]` pour « les unités »). */
    targetTypes: CardType[];
    /** Et, en plus, de ce sous-type (« Vos Éclats Chromatiques ont +1 Résistance », Coffret aux Cinq Pierres). */
    targetSubtype?: string;
    attackAmount?: number;
    healthAmount?: number;
    /**
     * « tant que … est visible » : l'aura ne porte que si la SOURCE est
     * visible dans la Marée courante. Une Structure-piège masquée ne
     * trahit donc pas sa présence en gonflant le plateau.
     */
    whileSelfVisible?: boolean;
  };

  /**
   * Pour un Équipement UNIQUEMENT : bonus accordé à l'unité qu'il équipe
   * tant que la Marée est dans l'un de ces états (ex: Lampe de Pont Rouge
   * en Houle/Tempête).
   */
  equipGrantsBuffWhileTideStateIn?: { tideStateIn: TideStateName[]; attackAmount?: number; healthAmount?: number };

  /**
   * Pour un Équipement UNIQUEMENT : bonus accordé au permanent qu'il équipe,
   * sans condition (ex: Harpon de Pont, « Il gagne +1 Puissance »).
   *
   * C'est une AURA, relue en direct par `computeEffectiveStats` tant que
   * l'Équipement est attaché — jamais un modificateur posé sur le porteur :
   * un bonus posé survivrait à la destruction de l'Équipement, alors que le
   * texte ne l'accorde que par lui.
   */
  equipGrantsBuff?: { attackAmount?: number; healthAmount?: number };

  // --- Anomalies globales temporaires (`type: "anomalie"`, permanents à
  // durée limitée via `durationTurns` comme une Structure) : cf.
  // `game/state/anomalies.ts` — règles SYMÉTRIQUES qui affectent n'importe
  // quel joueur concerné, pas seulement le contrôleur de l'Anomalie. -----

  /**
   * Force, au début de CHAQUE tour (déclenché par `startOfTurn`, quel que
   * soit le contrôleur de cette Anomalie), un choix pour le joueur qui
   * DEVIENT actif : perdre `reasonLossAmount` Raison, ou infliger
   * `anchorDamageAmount` dégâts d'Ancrage à son propre Navire (ex: Le Fond
   * Vous Regarde). Résolu via `GameState.pendingChoice` +
   * `game/actions/resolveChoice.ts`, jamais deviné automatiquement — un
   * vrai choix de joueur.
   */
  anomalyForceChoiceAtStartOfTurn?: {
    reasonLossAmount: number;
    anchorDamageAmount: number;
    /**
     * Nombre de choix imposés au total (« pendant 2 tours » = les 2 tours
     * qui suivent la pose, décision du 02/10/2026). Le dernier imposé,
     * l'Anomalie quitte le jeu à l'entame du tour suivant
     * (`CardInstance.expiresAtNextTurnStart`) au lieu d'attendre la fin de
     * sa `durationTurns`. Sans valeur : un choix à chaque tour tant
     * qu'elle reste en jeu.
     */
    times?: number;
  };

  /**
   * Capacité activable manuellement par son contrôleur, une fois par tour,
   * pendant sa Phase principale (`game/actions/activateAbility.ts`) — ex:
   * Sondeur des Mauvaises Eaux, "Une fois par tour, vous pouvez perdre 1
   * Raison : réduisez de 1 tour la durée de la Marée actuelle." Distincte
   * des `abilities` déclenchées par un `TriggerType` : celle-ci n'est
   * déclenchée par AUCUN événement de jeu, seulement par un choix
   * discrétionnaire du joueur, tant que le coût est payable.
   */
  activatableOncePerTurn?: { cost: { reason?: number }; effects: EffectDefinition[] };

  /**
   * Pour une Lande UNIQUEMENT (`type: "lande"`) : ce qu'elle change aux
   * règles de la partie tant qu'elle est en jeu (`game/rules/lande.ts`).
   * Une Lande n'occupe aucun Slot : elle se pose dans l'emplacement PARTAGÉ
   * du centre du plateau (`EnvironmentState.lande`), un seul pour les deux
   * joueurs, et ses règles valent pour les deux camps.
   */
  lande?: LandeRules;

  // --- DÉS (Lot 17, `game/rules/dice.ts`) ------------------------------

  /**
   * LIGNÉE LV (Lot 17, `game/rules/levels.ts`) : à `markers` marqueurs
   * Niveau, la carte est REMPLACÉE par `into`, prise dans la main de son
   * propriétaire, sinon dans sa pioche. Elle part au Cimetière ; la nouvelle
   * arrive à sa place (`arrivedViaCardId`). Sans exemplaire disponible, rien
   * ne se passe et les marqueurs restent.
   */
  levelUp?: { markers: number; into: CardId };
  /**
   * « Ne peut entrer en jeu que par l'effet de … » (Eidolon Opalin LVX) :
   * la carte ne se joue pas depuis la main.
   */
  cannotBePlayed?: boolean;

  /** Le dé de la carte (« · D6 ») : celui que lancent ses effets `rollDie`. */
  die?: 4 | 6 | 8;
  /**
   * « Chaîne — Brisez : … » : cet Objet ne se Brise que PENDANT un jet de dé
   * de son contrôleur (`DieRollChoice`), avant sa résolution — même hors de
   * sa Phase principale. Ses effets de Bris agissent sur le jet en cours.
   */
  chaine?: boolean;
  /**
   * « Une fois par tour, après l'un de vos jets, modifiez son résultat de +1
   * ou -1 » (Miss Franche-Comté 1987) : capacité EN JEU, utilisable pendant
   * un jet de son contrôleur. `extraUseOnCriticalSuccess` : si le jet ajusté
   * devient une Réussite critique, une utilisation de plus ce tour.
   * `ifCriticalFailure` : effets (source : la carte) si le jet ajusté
   * devient un Échec critique.
   */
  dieAdjustOncePerTurn?: { amount: number; extraUseOnCriticalSuccess?: boolean; ifCriticalFailure?: import("@/game/effects/types").EffectDefinition[] };
  /**
   * « Si [Lande] est active, la première relance que vous effectuez à chacun
   * de vos tours gagne +N » (Maître de Ladalle).
   */
  rerollBonusWhileLande?: { landeCardId: string; bonus: number };
  /**
   * « La première carte que vous rejouez depuis votre main après qu'elle y
   * soit revenue à chacun de vos tours coûte N de moins » (Campement
   * provisoire, Lot 17) — tant que cette carte est en jeu.
   */
  replayedCardDiscount?: number;
  /** « Tant qu'une Lande est active, il gagne +A/+B » (Gardien des Balises, Lot 17). */
  selfBuffWhileLandeActive?: { attackAmount?: number; healthAmount?: number };

  /**
   * Nombre maximum d'exemplaires de cette carte dans un deck personnel —
   * donnée propre à chaque carte, jamais dérivée de la rareté (cadrage
   * `TCG_DATABASE.md` "max_copies canonique"). Défaut : 3.
   */
  maxCopies?: number;
}

export const DEFAULT_MAX_COPIES = 3;

/**
 * Règles d'une Lande (`CardDefinition.lande`). Chaque champ est une
 * primitive GÉNÉRIQUE, relue par le moteur tant que la Lande est en jeu —
 * jamais un branchement sur l'identifiant d'une carte.
 *
 * Cycle de vie (`game/rules/lande.ts`) : jouer une Lande remplace celle déjà
 * en jeu, qui part au Cimetière de SON propriétaire. Elle reste
 * `durationTableTurns` tours de table — comptés à partir de sa pose, en
 * tours de joueur deux par deux —, puis part au Cimetière de son
 * propriétaire.
 */
export interface LandeRules {
  /** « Durée : N tours de table ». */
  durationTableTurns: number;
  /**
   * « Les permanents perdent Garde » (Pluie corrosive) : mots-clés retirés
   * à TOUS les permanents, des deux camps, tant que la Lande est en jeu. Lu
   * par `hasKeywordInContext` : le retrait l'emporte sur tout octroi.
   */
  removesKeywords?: string[];
  /**
   * « Chaque joueur ne peut invoquer qu'un seul Marin ou une seule Créature
   * par tour. Aucun effet ne peut dépasser cette limite. » (Chaîne de
   * construction) : nombre maximal d'unités qui arrivent en jeu sous le
   * contrôle d'un même joueur pendant un même tour — jouées depuis la main
   * OU invoquées par un effet, jetons compris. Une carte au-delà ne se joue
   * pas ; un effet au-delà n'invoque que ce qui reste permis.
   */
  unitArrivalsPerTurn?: number;
  /**
   * « À la fin de chaque tour de table, tous les permanents en jeu
   * subissent N dégâts » (Vallée de verre) : dégâts d'effet de la Lande,
   * à tous les permanents dotés de Résistance, des deux camps.
   */
  damageAllPermanentsEachTableTurn?: number;
  /**
   * « La première fois que vous lancez un dé à chacun de vos tours, vous
   * pouvez le relancer. Vous devez garder le nouveau résultat. » (Le Donjon
   * de Ladalle, Lot 17) — pour les deux joueurs, comme toute Lande.
   */
  firstRollRerollEachTurn?: boolean;
  /**
   * « La première unité coûtant N ou moins que chaque joueur joue à son tour
   * gagne +A/+B » (Calme trompeur, Lot 17).
   */
  firstCheapUnitEachTurnBuff?: { maxCost: number; attack: number; health: number };
  /**
   * « La première carte que vous rejouez depuis votre main après qu'elle y
   * soit revenue à chacun de vos tours coûte 1 de moins » (Terres inconnues,
   * Lot 17) — pour les deux joueurs.
   */
  replayedCardDiscount?: number;
}

/** La carte est-elle une Lande ? */
export function isLandeCard(def: CardDefinition): boolean {
  return def.type === "lande";
}

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
export type GraveyardCause =
  | "discarded"
  | "destroyed"
  | "scuttled"
  | "expired"
  /** Placée au Cimetière pour un Assemblage Chromatique : ni détruite, ni Sabordée (Lot 15). */
  | "assembled"
  /** Lande chassée par une autre Lande : ni détruite, ni expirée. */
  | "replaced";

/**
 * COMMENT une carte a quitté le plateau — plus fin que `GraveyardCause`, qui
 * ne dit que la zone et le geste.
 *
 * `GraveyardCause` répond « détruite ou sabordée ? ». Plusieurs textes
 * posent une autre question : « détruite AU COMBAT » (Encore cinq minutes),
 * qu'une destruction par un effet ou par la Marée ne doit pas satisfaire.
 * Faute de cette distinction, la carte survivait à tout, ce que son texte ne
 * dit pas.
 *
 * La cause est déduite à la mort dans `game/state/processDeaths.ts`, à
 * partir de la dernière source de dégâts marquée sur l'unité
 * (`CardInstance.lastDamageCause`) et de la façon dont elle part.
 */
export type DestructionCause =
  /** Dégâts d'une attaque — ceux du défenseur comme le contrecoup de l'attaquant. */
  | "combat"
  /** Dégâts ou destruction provoqués par un effet de carte. */
  | "effect"
  /** Dégâts de Marée, ou destruction directe par l'état courant (ex: une Vigie aux Abysses). */
  | "tide"
  /** Sabordage : un coût consenti par son contrôleur, jamais une destruction subie. */
  | "scuttle";

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
  // Comme un Équipement consommable (`permanent: false`) : une Anomalie à
  // résolution immédiate (`onPlayEffects` uniquement, jamais de règle
  // durable via `durationTurns`) part directement au cimetière plutôt que
  // d'occuper indéfiniment un Slot sans plus aucun effet (ex: La Gueule
  // Sous la Mer, Sept Brasses Plus Bas — Lot 08, "Grandes Anomalies").
  if (def.type === "equipement" || def.type === "anomalie") return def.permanent !== false;
  return true;
}

/** Une Structure/Objet est-elle actuellement visible pour l'adversaire selon la Marée ? */
export function isVisibleDuringTide(def: CardDefinition, tideState: TideStateName): boolean {
  if (!def.visibleDuringTide) return true;
  return def.visibleDuringTide.includes(tideState);
}

/**
 * Ce permanent a-t-il une Résistance ?
 *
 * Règle de conception (Notion « Catalogue de cartes » § « Objets,
 * Équipements et effets ponctuels ») : les **Objets n'ont pas de
 * Résistance** — seuls les Structures et les Équipements en ont, en plus
 * des unités. Un Objet occupe un Slot et se **brise** pour produire son
 * effet ; il ne s'encaisse pas.
 *
 * Conséquence mécanique, portée par ce seul prédicat plutôt que par un
 * `if (type === "objet")` disséminé : une carte sans `health` ne peut ni
 * subir de dégâts, ni être choisie comme cible d'attaque, ni mourir par
 * arithmétique de Résistance. Elle quitte le board par Bris, Sabordage,
 * expiration, destruction par la Marée (`tideAffinity.destroyed`) ou un
 * effet `destroy`/`saborde` explicite — jamais parce qu'on l'a tapée.
 *
 * Le prédicat lit `health`, pas le type : une Anomalie à résolution
 * immédiate en bénéficie de la même façon, et une Structure sans
 * Résistance serait traitée pareil si le design en créait une.
 */
export function hasResistance(def: CardDefinition): boolean {
  return def.health !== undefined;
}

export function hasKeyword(def: CardDefinition, keyword: string): boolean {
  return def.keywords?.includes(keyword) ?? false;
}

export interface CardInstance {
  /** Identifiant unique de cet exemplaire physique de carte, pour la partie en cours. */
  instanceId: string;
  cardId: CardId;
  ownerId: string;
  /** Marqueurs Niveau posés sur cette carte en jeu (Lot 17 — lignée LV, `game/rules/levels.ts`). */
  levelMarkers?: number;
  /**
   * Marqueurs posés sur cette carte EN JEU (Lot 18 — marqueur Mort,
   * `game/cards/markers.ts`). Ils partent avec elle quand elle quitte le
   * plateau. Absent = aucun.
   */
  markers?: import("@/game/cards/markers").CardMarkers;
  /**
   * Dans un Cimetière : la carte revient sur le plateau de `playerId` à la
   * fin du tour `turnNumber` (« ramenez-la du Cimetière sur le plateau à la
   * fin du tour, avec un marqueur Mort » — Coucou, c'est moi). Posé par
   * l'effet `scheduleGraveyardReturn`, lu par `endTurn`.
   */
  returnsToBoardAtEndOfTurn?: { turnNumber: number; playerId: string; withMarker?: import("@/game/cards/markers").MarkerId };
  /**
   * La carte est arrivée en REMPLAÇANT celle-ci, par son effet de lignée
   * (« S'il entre en jeu par l'effet d'Eidolon Opalin LV1… », Lot 17).
   */
  arrivedViaCardId?: CardId;
  /**
   * Case du rang où la carte est posée (0 = tout à gauche), choisie par le
   * joueur à la pose. Présentation seulement, aucune règle ne la lit
   * (`game/rules/boardSlots.ts`). Absente : la première case libre.
   */
  slot?: number;

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
   * Ce permanent DOIT quitter le plateau à la prochaine passe de
   * `game/state/processDeaths.ts`, qui est la voie UNIQUE de sortie : elle
   * seule envoie au cimetière, émet les événements et réveille `onDeath`
   * (plus `onSaborde` avant lui pour un Sabordage). Les actions et les
   * effets posent ce drapeau au lieu de retirer la carte eux-mêmes, sinon
   * chaque site de départ doit reproduire tout le cortège.
   *
   * `"destroyed"` est une destruction : elle peut être esquivée par une
   * substitution (Plaque de Fortune) ou une survie (Revenante de la Fosse).
   * `"scuttled"` est un Sabordage, un coût consenti : rien ne l'esquive.
   */
  pendingRemoval?: "destroyed" | "scuttled";

  /**
   * Joueur dont l'EFFET a décidé `pendingRemoval` (« détruite par un effet
   * adverse », Bête de Halage). Absent : un départ décidé par une action ou
   * par la Marée.
   */
  pendingRemovalBy?: string;

  /**
   * Identité chromatique GAGNÉE durablement (Lot 15) : la couleur choisie
   * par l'Émissaire de Quartz, prise par le Héraut de Nacre, portée par un
   * Bracelet, ou celles d'un Assemblage. Sur l'INSTANCE et non dans un
   * modificateur : elle doit survivre jusqu'au Cimetière, où l'Émissaire
   * la relit pour créer son Éclat.
   */
  chromatic?: ChromaticIdentity;

  /** Arrivée en jeu par Assemblage Chromatique (Le Géant Chromatique). */
  arrivedByAssemblage?: boolean;

  /**
   * Couleurs chromatiques que son contrôleur contrôlait JUSTE AVANT de la
   * jouer (`playCard`, photo prise avant l'Assemblage). Lue par
   * `condition.triggerSourceBringsNewChromaticColor` — « une couleur que
   * vous ne contrôliez pas encore » : sans cette photo, les Sentinelles
   * d'un Assemblage, déjà parties quand la condition est lue, faisaient
   * passer les couleurs du Géant pour nouvelles. Absente sur une carte
   * invoquée par un effet : elle n'a pas été JOUÉE.
   */
  couleursAvantArrivee?: ChromaticColor[];

  /**
   * Index (1-based) de la variante d'illustration tirée à la création, pour
   * une carte à `illustrationVariants` (Péon Cra-Poiscail). Tiré avec le
   * RNG DÉTERMINISTE de la partie et stocké sur l'instance : le visuel doit
   * rester le même d'un rendu à l'autre, et surtout être identique chez les
   * deux joueurs en ligne — un tirage fait à l'affichage donnerait deux
   * jetons différents de chaque côté de la table.
   */
  illustrationVariant?: number;

  /**
   * Pour Structure/Objet avec `durationTurns` : tours restants avant
   * expiration. Fixé à `def.durationTurns` à l'entrée en jeu, décompté une
   * fois par tour de table, à l'entame du tour de son contrôleur. `undefined` si la carte
   * n'a pas de durée limitée.
   */
  turnsRemaining?: number;
  /** Choix déjà imposés par une Anomalie à choix forcé (`anomalyForceChoiceAtStartOfTurn.times`). */
  forcedChoicesImposed?: number;
  /** Quitte le jeu (expiration) à l'entame du tour suivant, quel que soit le joueur actif. */
  expiresAtNextTurnStart?: boolean;

  /**
   * Cette Structure a été RÉVÉLÉE en activant une Réaction cachée alors
   * qu'elle était masquée. Définitif : la projection joueur cesse de cacher
   * son identité à l'adversaire, même si la Marée la remasque ensuite — on
   * ne « désapprend » pas ce qu'on a vu.
   */
  revealed?: boolean;

  /** Statuts ponctuels actifs sur cette instance (ex: `STATUS_MALADE`). Absent = aucun. */
  statuses?: string[];

  /** Posée uniquement une fois la carte dans un cimetière : cause de sa sortie de jeu. */
  graveyardCause?: GraveyardCause;

  /**
   * Origine des DERNIERS dégâts marqués sur cette unité. Posée à chaque
   * marquage (combat, effet, Marée) et lue au moment de la mort pour en
   * déduire la `DestructionCause` — une unité qui meurt n'a plus de source
   * à interroger, il faut donc l'avoir retenue.
   */
  lastDamageCause?: Exclude<DestructionCause, "scuttle">;

  /**
   * Joueur dont l'EFFET a marqué les derniers dégâts (`lastDamageCause:
   * "effect"` seulement ; effacé par un coup de combat ou de Marée). Lu à la
   * mort : « détruite par un effet ADVERSE » (Bête de Halage).
   */
  lastDamageBy?: string;

  /**
   * Tour de table où les derniers dégâts ont été marqués. Posé au même
   * moment que `lastDamageCause`, et lu par le filtre `damagedThisTurn`
   * (« une unité ayant déjà subi des dégâts ce tour », Qu'on en Finisse).
   *
   * Un numéro de tour plutôt qu'un booléen : rien n'a alors à le remettre
   * à zéro entre deux tours, et il ne peut pas se désynchroniser d'une
   * remise à zéro oubliée quelque part.
   */
  lastDamageTurn?: number;

  /**
   * Lot 16 — Éveils de cette carte pendant le tour de TABLE `turn` : « si
   * c'est son deuxième Éveil ce tour », « s'il s'est déjà Éveillé ce tour ».
   * Même parti pris que `lastDamageTurn` : le numéro de tour porte la
   * remise à zéro, rien n'a à l'effacer entre deux tours. Incrémenté par
   * `runEveil` (`triggerBus.ts`) AVANT que l'Éveil ne se résolve : pendant
   * son deuxième Éveil, une carte lit 2. Lu par `eveilsThisTurn`.
   */
  eveils?: { turn: number; count: number };

  /**
   * Une fenêtre de sauvetage a déjà été ouverte pour CETTE destruction-ci
   * (`onPermanentWouldBeDestroyed`). Sans ce drapeau, la passe de morts
   * rouvrirait la même question à chaque reprise, indéfiniment.
   *
   * Il ne survit pas à ce qu'il borne : une carte sauvée n'est plus
   * condamnée, et le drapeau est retiré ; une carte qui part l'emporte au
   * Cimetière, où il ne veut plus rien dire.
   */
  rescueWindowOffered?: boolean;

  /** Posée une fois la carte au cimetière : comment elle a quitté le plateau. */
  destructionCause?: DestructionCause;

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

  /**
   * Suivi générique des capacités "la première fois PAR TOUR que..." (ex:
   * Vieux Loup de Mer, Cage de Flottaison).
   * Clé = identifiant du mécanisme (ex: "reasonLossShield"), valeur =
   * `turnNumber` de la dernière activation. Une capacité est "encore
   * disponible ce tour-ci" quand `oncePerTurnFlags[clé] !== state.turnNumber`
   * — pas besoin de réinitialisation explicite en fin de tour, `turnNumber`
   * ne fait qu'augmenter. Volontairement générique (une seule carte
   * n'aura jamais deux mécanismes de MÊME clé) plutôt qu'un champ booléen
   * dédié par mécanisme, pour ne pas faire grossir `CardInstance` à chaque
   * nouvelle capacité de ce type.
   */
  oncePerTurnFlags?: Record<string, number>;
}

/**
 * Durée de vie d'un modificateur de statistiques. Les deux durées courtes
 * ne se valent PAS et le catalogue distingue bien les deux formulations :
 *
 *  - `endOfTurn` — "jusqu'à la fin du tour" : disparaît quand le tour EN
 *    COURS se termine, donc avant que l'adversaire ne joue. C'est la durée
 *    de la plupart des bonus du Lot 10 (Bavard, Chef de Banc, Bourreau…).
 *  - `untilYourNextTurn` — "jusqu'à votre prochain tour" : survit au tour
 *    adverse et ne tombe qu'au début du tour suivant de son contrôleur, ce
 *    qui protège aussi en défense (Marin des Jetées, La Flaque Sacrée).
 */
export type StatModifierDuration = "endOfTurn" | "untilYourNextTurn" | "permanent";

export interface StatModifier {
  id: string;
  source: CardId | "unknown";
  attack: number;
  health: number;
  duration: StatModifierDuration;
  /** Mots-clés accordés tant que le modificateur est en place (ex: "Pied marin jusqu'à la fin du tour" — P'tite Fesse, Grand Rêve abyssale). */
  keywords?: string[];
  /**
   * « elle ne peut ni attaquer ni activer ses effets » (Chaîne de Travers,
   * Lot 14) : tant que ce modificateur tient, la carte est INACTIVE — au
   * même sens que l'inactivité de Marée, dont elle emprunte le chemin de
   * lecture (`EffectiveStats.inactive`).
   *
   * Porté par un modificateur et non par un drapeau sur l'instance : la
   * durée fait alors tout le travail, et rien n'a à se souvenir de lever
   * l'entrave au bon moment.
   */
  silenced?: boolean;
  /**
   * « ignorez cet effet pour ce permanent » (Zone de repli) : tant que ce
   * modificateur tient, la Lande en jeu n'a pas prise sur la carte — elle
   * garde ses mots-clés (`LandeRules.removesKeywords`), et le PREMIER coup
   * de Lande qui la viserait (`damageAllPermanentsEachTableTurn`) est
   * annulé, ce qui consomme le modificateur.
   */
  ignoresLande?: boolean;
  /**
   * « Son texte est ignoré jusqu'au début de votre prochain tour » (Lot 17 —
   * Seren, Astel) : tant que ce modificateur tient, la carte n'a plus de
   * TEXTE — ni capacité déclenchée ou activable, ni effet de Bris, ni bonus
   * ou bouclier qu'elle porte. Elle garde son corps : Puissance, Résistance
   * imprimées, et elle peut attaquer. Lu par `isTextIgnored`.
   */
  textIgnored?: boolean;
  /** « Elle ne peut pas être renvoyée en main ce tour » (Sommeil de Pierre, Lot 17). */
  preventsReturnToHand?: boolean;
  /**
   * « elle perd Garde jusqu'à la fin du tour » (Bête de Percée, Débusquer) :
   * mots-clés RETIRÉS tant que le modificateur tient, quelle que soit leur
   * source (imprimés, conditionnels, transmis). Prioritaire sur tout octroi.
   */
  removesKeywords?: string[];
  /**
   * Identité chromatique TEMPORAIRE (Transfert de Pierre, Bracelet de
   * Résonance, Synchronisation !) — `benefitsOwnSignals` : « elle bénéficie
   * également de son propre Signal ».
   */
  chromatic?: ChromaticIdentity & { benefitsOwnSignals?: boolean };
  /**
   * Joueur au début du tour DUQUEL tombe un modificateur `untilYourNextTurn`
   * (`EffectDefinition.expiresOnControllersTurn`) : « jusqu'à VOTRE prochain
   * tour » posé sur une unité adverse (Stratège de l'Azur, Signal Bleu).
   * Absent = le propriétaire du plateau, comportement historique — celui que
   * Chaîne de Travers demande (« jusqu'au prochain tour de son propriétaire »).
   */
  appliedBy?: string;
  /**
   * « +2 Puissance pour son prochain combat contre une unité ayant Garde ce
   * tour » (Ouvrez la Ligne !) : bonus réservé au prochain combat contre
   * une cible portant ce mot-clé, CONSOMMÉ par ce combat.
   */
  nextCombatBonusVsKeyword?: { keyword: string; amount: number };
}

/** Cette carte est-elle la version ABYSSALE ? Lecteur unique : l'interface ne doit jamais tester `subtype` pour ça. */
/**
 * « Cette carte ne peut pas être ciblée par l'adversaire » (L'Intangible,
 * Lot 16) : mot-clé accordé par un modificateur, pour la durée du texte.
 * Ne protège que de la DÉSIGNATION par un effet adverse — cible choisie
 * (`chosenUnit`) ou question `pickUnits` —, ni des effets de masse ou au
 * hasard, qui ne ciblent personne, ni des attaques, qui ne sont pas des
 * effets. Lu par `isUntargetableBy` (`game/effects/chosenTargets.ts`).
 * Ici plutôt qu'à côté de sa lecture : les fichiers de cartes le citent, et
 * ce module ne dépend de rien.
 */
export const KEYWORD_INCIBLABLE = "inciblable";

export function isAbyssalVariant(def: CardDefinition): boolean {
  return def.variant === "abyssale";
}

/** « Son texte est ignoré » (Lot 17) : un modificateur `textIgnored` tient sur cette carte. */
export function isTextIgnored(unit: Pick<CardInstance, "modifiers">): boolean {
  return unit.modifiers.some((m) => m.textIgnored);
}
