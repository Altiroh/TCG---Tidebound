import type { ArchetypeId } from "@/game/cards/archetypes";
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
  /** Ou est de l'un de ces TYPES de carte (ex: "quand une Structure est détruite" — Plongeur des Épaves, Mécanicien aux Mains Noires). */
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
   * Pour un Équipement : ne réagit qu'à ce qui arrive au permanent qu'il
   * équipe — "La première fois à chaque tour QU'IL attaque" (ex:
   * Fourchette du Grand Étang). L'Équipement n'attaque pas lui-même :
   * sans ce filtre, aucune de ses capacités ne pourrait suivre son
   * porteur.
   */
  equippedUnit?: boolean;
}

/** Une capacité déclenchée : "quand X se produit, résous ces effets". */
export interface TriggeredAbility {
  trigger: TriggerType;
  effects: EffectDefinition[];
  /** Texte optionnel affiché dans l'UI ; pas de logique attachée. */
  description?: string;
  /**
   * Filtres supplémentaires, évalués AVANT que `oncePerTurnKey` ne soit
   * consommé — contrairement à une condition posée sur un effet, qui laisse
   * le déclencheur brûler son unique usage du tour pour rien.
   *
   * `tideState` : pour `onTideStateEntered`/`onTideStateExited`, ne se
   * déclenche que pour cet état. `tideStateIn` : pour TOUT déclencheur, la
   * Marée doit être dans l'un de ces états (ex: Veilleuse des Profondeurs).
   * `controlsAnyCardIds` : le contrôleur doit avoir au moins une de ces
   * cartes en jeu (ex: La Quête du Grand Nénuphar, « alors que vous
   * contrôlez un Destrier du Grand Étang »).
   */
  condition?: {
    tideState?: TideStateName;
    tideStateIn?: TideStateName[];
    controlsAnyCardIds?: string[];
    /**
     * « si elle est visible » : la carte porteuse doit être visible dans la
     * Marée courante (ex: Filet à la Dérive). Indispensable pour une
     * capacité facultative — sans elle, une Structure cachée se proposerait
     * dans la fenêtre de réaction pour n'y rien résoudre.
     */
    selfVisible?: boolean;
  };

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
  /** Le contrôleur a au moins une de ces cartes nommées en jeu (ex: Chevalier Cra-Poiscail, "tant que vous contrôlez un Destrier du Grand Étang"). */
  controllingCardIds?: string[];
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
  /**
   * Sous-catégorie optionnelle et extensible (ex: "marionnette",
   * "objet-flottant"). C'est une FAMILLE de jeu, pas une variante : la
   * version Abyssale d'une carte se déclare avec `variant`, sinon une
   * Marionnette Abyssale devrait choisir entre les deux et sortirait de sa
   * troupe (décision du 2026-09-17).
   */
  subtype?: string;

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
   * les membres d'un archétype ; JAMAIS affichée sur la carte.
   */
  archetype?: ArchetypeId;

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
   * seulement). Traité dans `game/state/processDeaths.ts` : les dégâts
   * marqués sont ramenés juste sous la vie effective, une fois par tour
   * (`oncePerTurnFlags`). Ne sauve pas d'une destruction directe par la
   * Marée (`destroyedByTide`).
   */
  survivesLethalOncePerTurn?: { tideStateIn: TideStateName[] };

  /**
   * "La première réduction de durée de Marée que vous provoquez chaque
   * tour est augmentée de N", tant que la carte est visible (ex: Ancre de
   * Tempête). Lu dans `resolveEffect` (`tideReduceDuration`) sur le
   * plateau du contrôleur de l'effet, une fois par tour.
   */
  amplifyTideReductionOncePerTurnWhileVisible?: number;

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
   * premier Bris d'Objet de l'ADVERSAIRE à chaque tour lui coûte ce montant
   * de Raison en plus — depuis la main (ajouté au demi-coût) comme depuis le
   * plateau (où le Bris est sinon gratuit). Résolu dans `breakObject.ts`.
   */
  taxOpponentObjectBreakOncePerTurnWhileVisible?: number;

  /**
   * Ancre de Dérive : quand la Marée change d'état et que la carte est
   * visible dans le NOUVEL état, elle est Sabordée et les effets de tour de
   * cette Marée (dégâts d'Ancrage/Raison, choc des Abysses, maladie de la
   * Houle) sont reportés à la fin du tour en cours
   * (`EnvironmentState.deferredTideEffects`, appliqués par `endTurn`).
   */
  defersTideEffectsOnChangeWhileVisible?: boolean;

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
   * Pour une unité ATTAQUANTE (ou l'Équipement qui l'équipe) : dégâts
   * qu'elle s'inflige à elle-même après une attaque DIRECTE réussie contre
   * le Navire adverse (ex: Requin Balafré, Harpon de Pont). Ne s'applique
   * jamais à une attaque contre une autre unité.
   */
  selfDamageOnDirectAttack?: number;

  /**
   * Pour une unité ATTAQUANTE (ou l'Équipement qui l'équipe) : l'adversaire
   * perd cette Raison en plus quand elle inflige des dégâts DIRECTS à son
   * Navire (ex: Anguille des Profondeurs, Bat-Marin Abyssal). `tideStateIn`
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
   * l'unité qu'il équipe MEURT au combat (ex: Chaîne de Fer Noir, "Si elle
   * est détruite, perdez 1 Raison"). Ne couvre que la mort par dégâts
   * (`processDeaths`), pas une destruction par effet de carte.
   */
  controllerReasonLossOnOwnDestruction?: number;

  /**
   * Cette carte gagne un bonus de Résistance PERMANENT chaque fois qu'une
   * AUTRE Structure du même contrôleur est détruite (ex: Épaves
   * Accrochées, "+1 Résistance. Maximum +2"), plafonné à `maxStacks`
   * applications. Vérifié dans `processDeaths` ; ne réagit jamais à sa
   * propre destruction ni à celle d'un permanent d'un autre type.
   */
  buffSelfOnOtherOwnStructureDestroyed?: { healthAmount: number; maxStacks: number };

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

  /** Réduit la Puissance d'une unité ADVERSE qui attaque directement le Navire de son contrôleur, pour ce combat (ex: Le Filet qui Respire, « qu'une Créature adverse attaque »). `attackerCardTypes` restreint aux attaquants de ces types. */
  reduceAttackerPowerOnDirectAttackOncePerTurn?: { amount: number; attackerCardTypes?: CardType[] };

  /** Réduit les dégâts subis par CETTE unité elle-même, au combat (ex: Baleine aux Cicatrices Blanches). */
  reduceOwnDamageTakenOncePerTurn?: number;

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
   * Aura : bonus accordé aux AUTRES unités du type `targetType` du même
   * contrôleur (jamais à elle-même), tant que la Raison de son contrôleur
   * est ≤ ce seuil (ex: Capitaine Sans Sommeil, "+1 Résistance aux autres
   * Marins tant que Raison ≤ 3").
   */
  auraBuffOtherUnitsWhileControllerReasonAtMost?: { reasonAtMost: number; targetType: CardType; attackAmount?: number; healthAmount?: number };

  /**
   * Pour un Équipement UNIQUEMENT : bonus accordé à l'unité qu'il équipe
   * tant que la Marée est dans l'un de ces états (ex: Lampe de Pont Rouge
   * en Houle/Tempête, Masque de Plongée Fissuré en Abysses).
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

  /**
   * La première fois par tour que l'ADVERSAIRE de son contrôleur active une
   * réaction PENDANT le tour de son contrôleur (seul moyen, dans ce moteur,
   * pour un joueur non-actif de "déclencher un effet" pendant le tour de
   * l'autre), révèle `amount` cartes aléatoires de la main de cet adversaire
   * (ex: Guetteur de Brume). Consommé via `game/state/shields.ts` +
   * `CardInstance.oncePerTurnFlags`, câblé directement dans
   * `game/triggers/triggerBus.ts` (`resolveReaction`) plutôt que via le
   * système `abilities`/`TriggerType` : ce n'est pas une réaction à un
   * `TriggerEvent` mais à l'ACTE MÊME d'activer une réaction.
   */
  revealOpponentHandOnReactionOncePerTurn?: { amount: number };

  // --- Anomalies globales temporaires (`type: "anomalie"`, permanents à
  // durée limitée via `durationTurns` comme une Structure) : cf.
  // `game/state/anomalies.ts` — règles SYMÉTRIQUES qui affectent n'importe
  // quel joueur concerné, pas seulement le contrôleur de l'Anomalie. -----

  /** Chaque joueur perd ce montant de Raison la 1ère fois PAR TOUR qu'il joue une carte (ex: Quelque Chose Sous la Coque). */
  anomalyReasonLossOnFirstCardPlayedPerTurn?: number;

  /** Chaque joueur perd ce montant de Raison la 1ère fois PAR TOUR qu'un de ses permanents quitte le plateau — mort, Sabordage ou expiration (ex: Les Voix dans le Sillage). */
  anomalyReasonLossOnFirstPermanentLeavingPerTurn?: number;

  /** Chaque joueur perd ce montant de Raison la 1ère fois PAR TOUR qu'il joue un permanent ; `bonusIfCreature` s'ajoute si ce permanent est une Créature (ex: Ils Sont Sous Nous). */
  anomalyReasonLossOnFirstPermanentPlayedPerTurn?: { amount: number; bonusIfCreature?: number };

  /** Réduit de ce montant (jamais sous 0) TOUT gain de Raison, à chaque fois — pas de limite par tour (ex: Le Chant Sous la Ligne). */
  anomalyReduceAllReasonGains?: number;

  /** À chaque changement d'état de Marée, réduit sa durée d'entrée de ce montant (minimum 1) ; `anchorDamagePerShip` inflige en plus ce montant de dégâts d'Ancrage à CHAQUE Navire (ex: La Mer Réclame Davantage). */
  anomalyReduceTideEntryDuration?: { amount: number; anchorDamagePerShip?: number };

  /**
   * Force, au début de CHAQUE tour (déclenché par `startOfTurn`, quel que
   * soit le contrôleur de cette Anomalie), un choix pour le joueur qui
   * DEVIENT actif : perdre `reasonLossAmount` Raison, ou infliger
   * `anchorDamageAmount` dégâts d'Ancrage à son propre Navire (ex: Le Fond
   * Vous Regarde). Résolu via `GameState.pendingChoice` +
   * `game/actions/resolveChoice.ts`, jamais deviné automatiquement — un
   * vrai choix de joueur, contrairement aux autres champs `anomalyXxx` de
   * cette section qui s'appliquent sans décision.
   */
  anomalyForceChoiceAtStartOfTurn?: { reasonLossAmount: number; anchorDamageAmount: number };

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

  /**
   * Suivi générique des capacités "la première fois PAR TOUR que..." (ex:
   * Vieux Loup de Mer, Baleine aux Cicatrices Blanches, Cage de Flottaison).
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
}

/** Cette carte est-elle la version ABYSSALE ? Lecteur unique : l'interface ne doit jamais tester `subtype` pour ça. */
export function isAbyssalVariant(def: CardDefinition): boolean {
  return def.variant === "abyssale";
}
