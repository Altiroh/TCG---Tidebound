/**
 * Système d'effets génériques et combinables. Une carte ne fait jamais
 * "j'inflige 3 dégâts au héros ennemi" en dur : elle référence
 * `{ type: "damage", amount: { kind: "flat", value: 3 }, target: { kind: "opponentPlayer" } }`.
 *
 * Ajouter une nouvelle carte ne devrait (idéalement) jamais nécessiter
 * de nouveau code — seulement de nouvelles données, tant que la carte
 * peut s'exprimer avec les effets et cibles existants.
 */
import type { ArchetypeId } from "@/game/cards/archetypes";
import type { DestructionCause } from "@/game/cards/types";

export type EffectType =
  | "damage"
  | "heal"
  | "draw"
  | "discard"
  | "destroy"
  /** Saborde la cible (Sabordage FORCÉ, ex: Levier de Lest, "Sabordez une Structure que vous contrôlez") : elle part au cimetière comme sabordée, `onSaborde` puis `onDeath` se déclenchent (via `processSabordedTriggers`). */
  | "saborde"
  | "summon"
  | "buff"
  | "debuff"
  | "searchDeck"
  | "moveZone"
  | "transform"
  | "reasonGain"
  | "reasonLoss"
  /** Attache la source (un Équipement) au permanent choisi (`target: { kind: "chosenUnit" }`) — cf. `EQUIPPABLE_CARD_TYPES`, un seul Équipement par permanent. */
  | "attachEquipment"
  /**
   * Retire `amount` tours de durée restante aux permanents ciblés
   * (`CardInstance.turnsRemaining`), sans jamais descendre sous 0.
   *
   * Sert à FAIRE PAYER un gain sur la durée d'une carte plutôt que sur une
   * ressource : « vous pouvez réduire sa durée de 1 tour : récupérez
   * 1 Raison » (Gardien du Sondeur). C'est un coût réel — la Structure
   * quitte le plateau plus tôt — mais qui ne touche ni la Raison ni
   * l'Ancrage, donc utilisable par une carte dont le but est justement d'en
   * rendre.
   *
   * L'expiration n'est PAS immédiate : un permanent tombé à 0 reste en jeu
   * jusqu'au contrôle de début de tour de son contrôleur, qui expédie au
   * Cimetière tout ce qui est à 1 ou moins (`resolveEnvironment`). C'est
   * cohérent avec « Durée : N tours » qui compte les tours du CONTRÔLEUR :
   * la carte a encore le tour adverse à vivre.
   *
   * Sans effet sur un permanent SANS durée (`turnsRemaining` absent) : on ne
   * peut pas retirer ce qui n'existe pas. Attention en conception — une
   * carte qui fait payer une durée à une cible qui n'en a pas rendrait son
   * gain gratuit. Aucune Structure sans durée ne peut aujourd'hui devenir
   * visible, donc le cas ne se présente pas ; c'est à revérifier si une
   * Structure sans durée reçoit une fenêtre de visibilité.
   */
  | "durationLoss"
  /**
   * Annule les dégâts directs de l'attaque en cours d'interception
   * (grammaire des pièges, 21/09/2026). N'a de sens que dans une capacité
   * `onIncomingDirectAttack` : hors de cette fenêtre, il n'y a pas
   * d'attaque suspendue et l'effet ne fait rien.
   *
   * N'annule QUE la frappe sur la coque. Le coup a bien été porté :
   * l'attaquant a dépensé son attaque, son propre contrecoup s'applique, et
   * les pertes de Raison qu'il inflige aussi. C'est un bouclier, pas une
   * annulation de l'échange.
   */
  | "cancelIncomingAttack"
  /**
   * Réduit de `amount` les dégâts DIRECTS de l'attaque en cours
   * d'interception (Cage de Flottaison, Caisses Arrimées). Cumulative :
   * deux pièges qui répondent à la même attaque additionnent leurs
   * réductions. Sans objet hors fenêtre d'interception.
   */
  | "reduceIncomingDamage"
  /**
   * Retire `amount` de Puissance à l'attaquant POUR CETTE ATTAQUE (Filet à
   * la Dérive, Le Filet qui Respire), sans jamais descendre sous 0.
   *
   * Agit sur la Puissance DÉCLARÉE, celle que porte l'attaque suspendue :
   * l'effet vaut donc aussi bien pour un combat entre unités que pour une
   * frappe sur la coque, et il disparaît avec l'attaque — ce n'est pas un
   * modificateur posé sur la carte.
   */
  | "modifyAttackerPower"
  /**
   * Pose une PROTECTION DE DESTRUCTION sur les permanents du contrôleur
   * jusqu'à la fin du tour en cours (`PlayerState.destructionProtections`) :
   * « jusqu'à la fin de ce tour, vos Structures ne peuvent pas être
   * détruites par des effets environnementaux » (Brise-Lames — Tenir la
   * ligne).
   *
   * Générique par construction : ce qu'elle protège vient de
   * `filter.cardTypes`, ce contre quoi vient de `protectedFrom` — une cause
   * de destruction, la même notion que celle dont le moteur se sert déjà
   * pour attribuer une mort (`DestructionCause`). « Effet environnemental »
   * s'écrit donc `["tide"]`, et rien dans le moteur ne connaît le nom de la
   * capacité qui l'a posée.
   *
   * Le Sabordage n'est jamais couvert : c'est un coût consenti.
   */
  | "protectFromDestruction"
  // --- Environnement : Marée, modèle "durée + intensité" -----------------
  // (cadrage "Mécaniques verrouillées" sections 20-21, orientation 2026-09-10)
  /** Réduit la durée restante de l'état de Marée courant (rapproche la progression). */
  | "tideReduceDuration"
  /** Prolonge la durée restante de l'état de Marée courant. */
  | "tideExtendDuration"
  /** Fixe l'Intensité de Marée courante à une valeur donnée. */
  | "tideSetIntensity"
  /** Modifie (delta) l'Intensité de Marée courante. */
  | "tideModifyIntensity"
  /** Pose un modificateur "maintenez cet état" : ne décompte pas au(x) prochain(s) tick(s). */
  | "tideMaintain"
  /** Pose un modificateur "doublez les prochains dégâts environnementaux". */
  | "tideAmplifyNext"
  /** Inverse l'orientation courante de la Marée (Montante ↔ Descendante). */
  | "tideInvertOrientation"
  /** Fixe l'orientation de la Marée à `forceTideOrientation` (ex: Veilleuse des Profondeurs, "forcez son orientation à devenir descendante"). Sans effet si elle l'est déjà. */
  | "tideSetOrientation"
  /** Force une transition IMMÉDIATE d'un état vers les Abysses (jamais via le décompte normal). */
  | "tideForceAdvance"
  /** Force une transition IMMÉDIATE d'un état vers Calme (jamais via le décompte normal). */
  | "tideForceRetreat"
  | "ignoreNextTideDamage"
  /**
   * Reporte à la FIN DU TOUR EN COURS les effets de la Marée qui vient
   * d'être annoncée (Ancre de Dérive). N'a de sens que dans une capacité
   * `onTideAnnounced` : hors de cette fenêtre il n'y a pas de Marée en
   * attente, et l'effet est silencieusement sans objet.
   *
   * Ce qui est reporté, ce sont les effets de TOUR de la Marée — dégâts de
   * Tempête, choc d'entrée/sortie des Abysses, maladie de la Houle — pas
   * l'état lui-même : la Marée a bien changé, et les capacités
   * `onTideStateEntered` se déclenchent à l'heure. Le report se règle dans
   * `endTurn` via `EnvironmentState.deferredTideEffects`.
   */
  | "deferTideEffects"
  // --- Lecture de main (purement informatif, cf. `HandCardRevealedEvent`) -
  /** Révèle `amount` cartes aléatoires DISTINCTES de la main de la cible — aucun autre effet sur l'état (ex: Guetteur de Brume, La Bouée qui Regardait). */
  | "revealRandomHandCards"
  /** Révèle une carte aléatoire de CHAQUE joueur puis inflige `amount` de perte de Raison à celui dont la carte révélée coûte le plus cher (égalité, ou un joueur sans carte en main = personne, ex: Cloche Immergée). */
  | "reasonLossToHigherRevealedHandCard"
  /** Renvoie en main la carte de la défausse choisie par le joueur (`EffectContext.chosenGraveyardInstanceId`), filtrée par `EffectDefinition.filter` (ex: Grappin de Récupération). */
  | "moveGraveyardCardToHand"
  /** Force une entrée DIRECTE dans les Abysses, en ignorant tout état intermédiaire (ex: La Gueule Sous la Mer, Sept Brasses Plus Bas — Lot 08, "Grandes Anomalies"). `amount` (optionnel) ajoute ce nombre de tours à la durée d'entrée par défaut ; `forceTideOrientation` (optionnel) fixe l'orientation résultante. */
  | "tideForceJumpToAbysses"
  /** Empêche CETTE cible de récupérer la moindre Raison (régénération de début de tour incluse) jusqu'au début de son prochain tour (ex: La Gueule Sous la Mer). */
  | "lockReasonGainUntilNextTurn"
  // --- Théâtre Englouti : retour en main, rappel d'arrivée, réduction ----
  // (Lot 11, Notion « Les Masques Noyés / Théâtre Englouti »)
  /**
   * Répète l'effet d'ARRIVÉE (`onEnterPlay`) de la cible, sans la faire
   * revenir en jeu (ex: Colombina aux Cent Visages, Le Régisseur des
   * Profondeurs). Seuls les effets qui ne demandent AUCUN choix au joueur
   * sont rejoués : une répétition ne rouvre pas de fenêtre de ciblage, et
   * rejouer un effet ciblé avec l'ancienne cible serait faux.
   */
  | "repeatEnterEffects"
  /**
   * Pose une réduction de coût sur les PROCHAINES cartes jouées par le
   * contrôleur ce tour-ci (« la prochaine Marionnette que vous jouez ce
   * tour coûte 1 de moins, minimum 1 »). `amount` porte la réduction,
   * `filter` la restriction éventuelle (sous-type, type), `uses` le nombre
   * de cartes concernées (défaut 1).
   */
  | "discountNextCards"
  /**
   * « Regardez les N premières cartes de votre pioche. Ajoutez-en une à
   * votre main. Placez les autres sous votre pioche. » (Lot 14).
   *
   * Ne prend RIEN lui-même : il sort les N cartes du dessus et pose la
   * question (`DeckLookChoice`). C'est le joueur qui désigne, comme pour
   * toute décision (CLAUDE.md, « le joueur décide, jamais le moteur »).
   *
   * `amount` dit combien de cartes sont regardées, `uses` combien peuvent
   * être prises (défaut 1), `filter.cardTypes` ce qui est prenable parmi
   * elles, et `refusable` si ne rien prendre est permis.
   */
  | "lookAtDeckTop"
  /**
   * « Placez jusqu'à N cartes de votre main sous votre pioche, puis
   * piochez-en autant » (Mauvaise Main, Lot 14).
   *
   * Passe par la même question qu'une défausse — c'est au joueur de dire
   * lesquelles — mais les cartes vont SOUS LA PIOCHE et non au Cimetière :
   * aucun déclencheur de défausse ne s'en mêle.
   */
  | "handToDeckBottomThenDraw"
  /**
   * « empêchez cette destruction : elle reste en jeu avec N Résistance »
   * (Lot 14 — Filet de Sauvetage, Cloison Étanche, Bouclier d'Écume,
   * Planche de Fortune).
   *
   * Ramène les dégâts marqués juste assez bas pour que la cible survive au
   * contrôle de morts en cours, en lui laissant exactement `amount` de
   * Résistance (1 partout dans le Lot 14). Ce n'est PAS un soin : la cible
   * ressort au bord du gouffre, pas réparée.
   *
   * N'a de sens que dans une fenêtre `onPermanentWouldBeDestroyed` : hors
   * d'elle, il n'y a pas de destruction à empêcher, et l'effet ramènerait
   * arbitrairement une carte en bonne santé à 1 Résistance. Il ne fait donc
   * rien si la cible n'est pas condamnée.
   */
  | "surviveWithHealth"
  /**
   * « après la troisième unité jouée par chaque joueur, les unités
   * supplémentaires coûtent +2 Raison » (Pas Tous à la Fois !, Lot 14).
   *
   * L'exact opposé de `discountNextCards`, et le même mécanisme dans
   * l'état (`CostDiscount`, dont le montant peut être négatif) : une
   * majoration est une réduction qui compte à l'envers.
   *
   * `amount` porte la majoration, `filter` sa restriction, `uses` le
   * nombre de cartes concernées — ou, avec `persistentTax`, toutes celles
   * qui passent jusqu'à l'expiration. `target` dit QUI est taxé :
   * `allPlayers` pour « chaque joueur ».
   */
  | "surchargeCards"
  /**
   * « Restaurez jusqu'à N Résistance répartie entre les unités que vous
   * contrôlez » (Lot 14). Ne soigne rien lui-même : il pose la question
   * (`HealAllocationChoice`) et le joueur répartit.
   *
   * À distinguer de `heal` sur `allAllyUnits`, qui verse le MÊME montant à
   * chacune — ce que ces textes-là ne disent pas.
   */
  | "healDistributed"
  /**
   * « Chaque joueur choisit jusqu'à N unités qu'il contrôle. Détruisez
   * toutes les autres. » (Lot 14 — Chacun sa Place, Abandonnez le Navire !).
   *
   * Ne détruit rien lui-même : il ouvre la question au premier joueur
   * (`KeepUnitsChoice`), et la destruction n'a lieu qu'une fois les deux
   * passés. `uses` porte le nombre d'unités gardables (défaut 1).
   *
   * Un board wipe À CHOIX : c'est ce qui le distingue d'un `destroy` sur
   * `allUnits`, et ce qui en fait une carte jouable des deux côtés de la
   * table.
   */
  | "keepUnitsDestroyRest"
  /**
   * « Lorsqu'un adversaire Brise un Objet : annulez l'effet de cet Objet »
   * (Fausse Cargaison, Lot 14).
   *
   * L'Objet est bien BRISÉ — il est parti au Cimetière, son coût a été payé,
   * et les déclencheurs « lorsque vous Brisez un Objet » se déclencheront
   * comme d'habitude. Ce qui est annulé, c'est ce que son texte allait
   * faire, et rien d'autre.
   *
   * N'a de sens que dans la fenêtre ouverte par un Bris suspendu
   * (`pendingObjectBreak`) : hors d'elle, il n'y a aucun effet en attente
   * et il ne fait rien.
   */
  | "cancelObjectEffect"
  /**
   * « Renvoyez jusqu'à N unités […] » : désigne PLUSIEURS cibles, là où
   * `chosenUnit` n'en désigne qu'une (Panique sur le Pont, Lot 14).
   *
   * Ne fait rien lui-même : il recense les cibles légales avec `target` et
   * `filter`, et pose la question (`PickUnitsChoice`). Les effets appliqués
   * à chaque cible désignée sont dans `thenEffects`, et ils y visent
   * `triggerSource` — la cible en cours.
   *
   * `uses` porte le nombre maximum de cibles (défaut 1).
   */
  | "pickUnits"
  // --- Lot 15 — Éclats en Selle -------------------------------------------
  /**
   * « déclenchez à nouveau ses effets liés au fait de survivre à des
   * dégâts » (Jusqu'à ce que ça casse) : RÉARME les capacités de la cible
   * dont le déclencheur est `rearmTrigger`, en effaçant leur marque « une
   * fois par tour ». L'effet ne déclenche rien lui-même : c'est le prochain
   * événement (la survie suivante) qui les rallume, par le circuit normal.
   */
  | "rearmTriggers"
  /**
   * Donne une identité chromatique à la cible (Lot 15) : une couleur
   * (`chromaticColor`, ou lue ailleurs avec `chromaticColorFrom`), le
   * Signal correspondant (`chromaticEmits`), ou le droit de bénéficier de
   * ses propres Signaux (`chromaticBenefitsOwn`).
   *
   * `permanent` (ou `duration: "permanent"`) l'inscrit sur l'INSTANCE ;
   * toute autre durée passe par un modificateur, qui tombe avec elle.
   */
  | "chromaticModify"
  /**
   * « choisissez une couleur » : pose la question
   * (`ChromaticColorChoice`), puis résout `thenEffects` avec la couleur
   * désignée (`EffectContext.chosenColor`). Une seule option possible (la
   * « cinquième couleur non utilisée ») se résout sans question : il n'y a
   * rien à décider.
   */
  | "chooseChromaticColor"
  /**
   * « vous êtes considéré comme contrôlant cette couleur pour vos effets
   * Chromatiques » (La Première Pierre) : une couleur REVENDIQUÉE par le
   * joueur, sans carte qui la porte ni Signal.
   */
  | "claimChromaticColor"
  /**
   * « regardez la première carte de la pioche adverse. Vous pouvez la
   * placer sous sa pioche. » (Éclaireur à Cornes) : pose la question
   * (`DeckTopDecisionChoice`) à celui qui regarde. Rien ne sort de la
   * pioche tant qu'il n'a pas répondu.
   */
  | "deckTopDecision";

/** Une valeur numérique d'effet, pour l'instant une constante — prête à
 * être étendue vers des formules (ex: "= nombre d'unités contrôlées"). */
export type EffectAmount =
  | { kind: "flat"; value: number }
  /**
   * « autant de dégâts » : la Puissance de l'attaquant dont l'attaque vient
   * d'être interceptée (`pendingAttack.attackerPower`). 0 hors fenêtre
   * d'interception.
   *
   * C'est la Puissance de l'attaquant, PAS le dégât final qu'aurait subi la
   * coque : boucliers, plafonds et faiblesse de Navire ne s'appliquent
   * jamais, puisque le coup n'a pas porté. C'est aussi ce que le joueur lit
   * sur la carte qui le frappe, donc ce que le texte promet.
   */
  | { kind: "incomingAttackDamage" }
  /**
   * « autant que d'unités » : montant COMPTÉ sur un plateau au moment de la
   * résolution, et non gravé dans la carte.
   *
   * C'est la primitive anti-swarm (Notion « Audit systémique » § Priorités
   * de couverture : « punition du nombre de Slots occupés »). Le pool
   * fabrique un board large plus facilement qu'il ne sait le punir — la
   * mesure donne 9 à 20 invocations par partie pour 5 à 9 cartes posées,
   * donc des corps que la Raison ne paie jamais. Un montant compté rend à
   * ces corps un coût, sans passer par un board wipe : contre deux unités,
   * la carte est faible ; contre six, elle est décisive.
   *
   * Ne compte que les UNITÉS (`UNIT_CARD_TYPES`), jamais les Structures,
   * Objets, Équipements ou Anomalies — c'est le nombre de corps qui fait
   * le swarm, pas le nombre de Slots occupés.
   *
   * `above` ne compte que ce qui DÉPASSE un seuil (« pour chaque unité
   * adverse au-delà de deux ») : c'est lui qui rend la carte inerte contre
   * un plateau normal. `per` multiplie chaque unité comptée (défaut 1).
   */
  | {
      kind: "unitCount";
      /** `"opponent"` : le plateau d'en face. `"controller"` : le sien — pour un effet de comeback. */
      of: "opponent" | "controller";
      /** Seuil en dessous duquel rien n'est compté. Défaut 0. */
      above?: number;
      /** Multiplicateur par unité comptée. Défaut 1. */
      per?: number;
    }
  /**
   * « 1 Ancrage par emplacement libre sur votre board, maximum 3 »
   * (Réparations d'Urgence, Lot 14) : montant compté sur les Slots ENCORE
   * LIBRES du contrôleur, au moment de la résolution.
   *
   * L'exact opposé de `unitCount` : celui-là récompense un plateau vide,
   * pas un plateau plein. C'est ce qui en fait une carte de comeback — on
   * la joue quand on vient de tout perdre, et elle ne rend presque rien
   * quand tout va bien.
   *
   * Compte les SLOTS, donc tout le plateau et pas seulement les unités :
   * une Structure occupe un emplacement, et le texte parle
   * d'emplacements.
   */
  | {
      kind: "freeSlots";
      /** Multiplicateur par emplacement libre. Défaut 1. */
      per?: number;
      /** Plafond du montant obtenu (« maximum 3 »). Absent = pas de plafond. */
      max?: number;
    };

/**
 * Restriction d'une cible `chosenUnit` : le joueur désigne, mais seulement
 * PARMI ce que le texte autorise. Le moteur, l'UI et la liste des réactions
 * éligibles s'appuient tous sur le même filtre (`eligibleChosenUnits`,
 * `game/effects/chosenTargets.ts`) — une cible que l'UI ne devrait pas
 * proposer est aussi une cible que le moteur refuse.
 */
export interface ChosenUnitFilter {
  /**
   * "choisissez un Cra-Poiscail" : ne retient que les UNITÉS (Marins et
   * Créatures) de cette famille — même restriction que le comptage
   * d'archétype (`countArchetypeUnits`, décision du 2026-09-14). Les
   * Structures, Objets, Équipements et Anomalies de la famille ne sont pas
   * des cibles : un "+1 / +1" n'a aucun sens sur elles.
   */
  archetype?: ArchetypeId;
  /**
   * "choisissez une Marionnette alliée" : ne retient que les permanents de
   * ce SOUS-TYPE (`CardDefinition.subtype`). Le Lot 11 raisonne en
   * sous-type et non en archétype — une Marionnette est un sous-type de
   * Créature, pas une famille au sens `archetypes.ts`.
   */
  subtype?: string;
  /**
   * "un AUTRE Cra-Poiscail" : exclut la source de l'effet et — si cette
   * source est un Équipement — le permanent qu'elle équipe. C'est LUI que
   * le texte oppose à "un autre" (ex: Fourchette du Grand Étang, dont la
   * phrase parle du porteur, pas du bout de ferraille attaché).
   */
  excludeSource?: boolean;
  /** Restreint au plateau du contrôleur de la source. Défaut : `true`. Passer `false` ouvre les deux camps. */
  sameController?: boolean;
  /**
   * « une créature ENNEMIE » : ne retient que le plateau adverse. Implique
   * `sameController: false` (les deux ne peuvent pas être vrais à la fois).
   */
  opponentOnly?: boolean;
  /**
   * « une créature » : ne retient que les UNITÉS (Marins et Créatures),
   * quel que soit leur archétype — un « +2 / +2 » n'a aucun sens sur une
   * Structure ou un Objet.
   */
  unitsOnly?: boolean;
  /**
   * « une unité déjà blessée » (Vieux Harponneur) : la cible doit porter
   * des dégâts. Sur le FILTRE DE CHOIX et pas seulement sur l'effet : sans
   * lui, l'interface proposerait des unités intactes et le texte se
   * résoudrait dans le vide.
   */
  damaged?: boolean;
  /**
   * « une unité ayant déjà subi des dégâts ce tour » (Qu'on en Finisse) —
   * plus étroit que `damaged`, qui ne dit pas quand la blessure a été
   * prise.
   */
  damagedThisTurn?: boolean;
  /**
   * « une Créature adverse », « une autre Structure » : ne retient que ces
   * TYPES de carte (ex: Filet à la Dérive, Mécanicien aux Mains Noires).
   */
  cardTypes?: import("@/game/cards/types").CardType[];
  /**
   * Coût IMPRIMÉ maximum de la carte choisie (ex: Le Régisseur Sans Visage,
   * « une Marionnette de coût 2 ou moins »). Le coût imprimé et non le coût
   * réduit : un plafond qui bougerait avec les réductions en cours rendrait
   * la cible légale ou non selon l'ordre des effets.
   */
  maxCost?: number;
  /**
   * « une Sentinelle d'une autre couleur » (Briseur du Brasier) : une
   * Sentinelle dont aucune couleur n'est celle de la SOURCE
   * (`isOtherColorSentinel`, `game/rules/chromatic.ts`).
   */
  otherChromaticColorThanSource?: boolean;
  /**
   * « une AUTRE unité » relativement à la carte DÉCLENCHEUSE (Pont de
   * Verre : l'unité qui vient de survivre n'est pas « une autre »).
   */
  excludeTriggerSource?: boolean;
}

export type TargetSelector =
  | { kind: "self" } // la carte/l'unité source elle-même
  | { kind: "controllerPlayer" } // le joueur qui contrôle la source
  | { kind: "opponentPlayer" }
  | { kind: "allPlayers" } // les deux joueurs, ex: effets environnementaux
  /**
   * Choisi par le joueur au moment de la résolution. `among` restreint ce
   * choix quand le texte le restreint ("choisissez un Cra-Poiscail") ;
   * sans lui, n'importe quel permanent des deux plateaux reste éligible,
   * comme depuis toujours.
   */
  | { kind: "chosenUnit"; among?: ChosenUnitFilter }
  | { kind: "allAllyUnits" }
  | { kind: "allEnemyUnits" }
  | { kind: "allUnits" }
  | { kind: "randomEnemyUnit" }
  | { kind: "randomAllyUnit" }
  /** Le permanent que l'Équipement SOURCE équipe (`CardInstance.attachedToInstanceId`) — ex: Slip de Guerre, qui renforce son porteur. */
  | { kind: "equippedUnit" }
  /** Les unités alliées portant l'un de ces `cardIds` (ex: Le Tournoi du Grand Étang, qui renforce Chevalier, Destrier et Bourreau). */
  | { kind: "allyUnitsWithCardIds"; cardIds: string[] }
  /** La carte qui a DÉCLENCHÉ la capacité en cours (ex: Bannière en Vieille Chaussette, qui renforce le Cra-Poiscail qui vient d'être invoqué). */
  | { kind: "triggerSource" }
  /**
   * L'ATTAQUANT de l'attaque en cours d'interception
   * (`pendingAttack.attackerInstanceId`) — ex: Pont Miné, « détruisez cette
   * unité avant qu'elle n'inflige ses dégâts » ; Harpon à Ressort,
   * « infligez-lui 2 dégâts ».
   *
   * N'a de sens que dans une fenêtre d'interception : hors d'elle il n'y a
   * pas d'attaque suspendue, et la cible est vide. Un TIR DE NAVIRE n'a pas
   * de carte attaquante — la cible est alors vide aussi, plutôt que de
   * désigner quelque chose qui n'existe pas.
   */
  | { kind: "pendingAttacker" }
  /**
   * La CIBLE de l'attaque en cours d'interception
   * (`pendingAttack.defenderInstanceId`) — ex: Corde de Rappel, « lorsqu'une
   * de vos unités est ciblée par une attaque […] renvoyez cette unité dans
   * votre main ».
   *
   * Vide pour une attaque directe au Navire : il n'y a pas d'unité ciblée.
   */
  | { kind: "attackTarget" }
  /**
   * Ce que le joueur a désigné en TIRANT avec la capacité de son Navire
   * (`ShipArmedShot`) : le permanent adverse visé, ou — s'il n'en a désigné
   * aucun, comme une attaque directe — le joueur adverse lui-même. Une même
   * cible pour deux natures de destinataire, parce que c'est un seul geste
   * du joueur : « je tire là ».
   *
   * La légalité de ce qui est visé n'est PAS vérifiée ici : elle l'a été à
   * la validation du tir, avec les règles d'attaque (`assertValidDefender`),
   * qui écartent déjà un permanent protégé par Garde ou sans Résistance.
   *
   * Même cible, même lecture, pour une capacité de Navire CIBLÉE en un seul
   * geste (`ShipActivatableAbility.targeting`, La Verrière — Pique à
   * Glace) : là, le joueur peut aussi désigner un Navire nommément,
   * le sien compris (`EffectContext.chosenTargetPlayerId`).
   */
  | { kind: "shotTarget" };

export interface EffectDefinition {
  type: EffectType;
  target: TargetSelector;
  amount?: EffectAmount;
  /** cardId à invoquer, pour `summon` ; cardId cible de transformation pour `transform`. */
  cardId?: string;

  /**
   * Pour `summon` : nombre d'exemplaires à invoquer (défaut 1). L'invocation
   * s'arrête aux Slots libres du Navire — "on n'invoque pas plus qu'il n'en
   * tient" (décision du 2026-09-14) : deux Péons sur un plateau qui n'a
   * qu'une place donnent un Péon, pas une invocation annulée.
   */
  count?: number;

  /**
   * Pour `summon` : les invoqués arrivent SANS mal d'invocation, donc
   * capables d'attaquer le tour même — c'est le mot-clé **Pied marin**
   * (ex: Fesses en Avant !). Le texte l'accorde "jusqu'à la fin du tour",
   * mais sur un corps qui vient d'arriver son seul effet réel est
   * exactement celui-ci.
   */
  rush?: boolean;

  /**
   * Pour `buff` : mots-clés accordés à la cible pour la durée du
   * modificateur (ex: P'tite Fesse, Grand Rêve abyssale — "+2 Puissance et
   * Pied marin jusqu'à la fin du tour"). Lus par `hasEffectiveKeyword`.
   */
  grantKeywords?: string[];

  /**
   * Pour `tideReduceDuration` : si la réduction fait tomber la durée à 0,
   * la Marée passe IMMÉDIATEMENT à l'état suivant au lieu d'attendre le
   * prochain tick (ex: Régulateur de Courant — conçu pour contourner la
   * règle "une durée ne descend jamais sous 1").
   */
  advanceTideOnZero?: boolean;

  /**
   * Pour `protectFromDestruction` : causes de destruction écartées. Une
   * protection sans cause ne protégerait de rien, l'effet est alors sans
   * objet.
   */
  protectedFrom?: DestructionCause[];

  /**
   * Pour `summon` : bonus temporaire (jusqu'à la fin du tour) accordé aux
   * corps qui viennent d'être invoqués — ex: Le Grand Saut, "ils gagnent
   * +1 Puissance et Pied marin jusqu'à la fin du tour".
   */
  summonBuff?: { attackAmount?: number; healthAmount?: number };

  /**
   * Durée du `buff`/`debuff` posé. `permanent: true` reste accepté et
   * équivaut à `"permanent"` ; sinon, défaut `"endOfTurn"` — "jusqu'à la
   * fin du tour", la formulation la plus courante. Les cartes qui disent
   * "jusqu'à votre prochain tour" doivent le déclarer explicitement.
   */
  duration?: import("@/game/cards/types").StatModifierDuration;

  /**
   * Ne résout cet effet que si le contrôleur a au moins `count` permanents
   * de cet archétype sur son plateau (ex: Cra-Poiscail Sauteur, "si vous
   * contrôlez déjà un AUTRE Cra-Poiscail"). `excludeSelf` exclut la carte
   * source du décompte — c'est presque toujours ce que dit le texte pour un
   * effet d'arrivée, la carte étant déjà posée quand il se résout.
   */
  conditionControlledArchetypeAtLeast?: {
    archetype: import("@/game/cards/archetypes").ArchetypeId;
    count: number;
    excludeSelf?: boolean;
  };

  /**
   * Ne résout cet effet que si l'Objet source a été Brisé DEPUIS LA MAIN
   * (`breakObject` avec `fromHand`), ou seulement s'il l'a été depuis le
   * board (`false`) — ex: Le Seau, qui invoque un Péon de plus quand on le
   * brise directement de la main. `undefined` = indifférent.
   */
  conditionBrokenFromHand?: boolean;

  /**
   * Ne résout cet effet que si le contrôleur a TOUTES ces cartes nommées
   * en jeu (ex: Le Tournoi du Grand Étang, "si vous contrôlez les trois à
   * la résolution, piochez 1 carte").
   */
  conditionControlsAllCardIds?: Array<string | string[]>;

  /** Variante "au moins une" (ex: La Quête du Grand Nénuphar, "alors que vous contrôlez un Destrier du Grand Étang"). */
  conditionControlsAnyCardIds?: string[];
  /** Zone de destination, pour `moveZone` (ex: retourner une carte en main). */
  toZone?: "hand" | "deck" | "graveyard" | "board";
  /** `discountNextCards` : nombre de cartes concernées par la réduction. Défaut 1. */
  uses?: number;
  /**
   * Pour `debuff` : le modificateur posé ENTRAVE aussi la cible — elle ne
   * peut ni attaquer ni activer ses effets tant qu'il tient (Chaîne de
   * Travers, Lot 14). La durée du debuff porte l'entrave : avec
   * `duration: "untilYourNextTurn"`, elle se lève au prochain tour de son
   * propriétaire, exactement comme le texte le dit.
   */
  silences?: boolean;
  /**
   * Pour `surchargeCards` : la taxe ne se consomme pas carte par carte,
   * elle vaut pour toutes celles qui passent jusqu'à son expiration.
   */
  persistentTax?: boolean;
  /**
   * Pour `pickUnits` : les effets appliqués à CHAQUE cible désignée. Ils y
   * visent `triggerSource`, qui vaut la cible en cours de traitement.
   */
  thenEffects?: EffectDefinition[];
  /**
   * Pour `surchargeCards` : ne s'applique qu'à partir de la N-ième unité
   * posée dans le tour par le joueur taxé (« après la troisième unité
   * jouée »).
   */
  afterUnitsPlayedThisTurn?: number;
  /**
   * Pour `surchargeCards`/`discountNextCards` : dernier tour de table où le
   * modificateur vaut encore, compté À PARTIR du tour courant. `0` (défaut)
   * = « ce tour » ; `1` = « jusqu'à votre prochain tour », qui couvre le
   * tour adverse intercalé.
   */
  lastsExtraTurns?: number;
  /**
   * Filtre optionnel. Il sert deux usages, avec le même vocabulaire :
   *
   *  - CHOISIR une carte hors du plateau — `searchDeck`,
   *    `moveGraveyardCardToHand` : le filtre décrit ce qui est prenable ;
   *  - RESTREINDRE LES CIBLES d'un effet qui balaie le plateau (Lot 14).
   *    Les sélecteurs de masse (`allUnits`, `allEnemyUnits`, `allAllyUnits`)
   *    rendent TOUT le plateau, Structures et Objets compris ; un texte qui
   *    dit « à toutes les UNITÉS » doit donc le déclarer, sans quoi il
   *    frappe aussi ce qui n'est pas une unité.
   *
   * Un effet sans `filter` garde exactement son comportement d'avant :
   * le filtrage est opt-in, carte par carte.
   */
  filter?: {
    cardType?: import("@/game/cards/types").CardType;
    cardTypes?: import("@/game/cards/types").CardType[];
    /** Sous-type exact (ex: "marionnette") — `discountNextCards` et la récupération au Cimetière (`moveGraveyardCardToHand`, ex: Rappel du Public). */
    subtype?: string;
    maxCost?: number;
    /**
     * Plafond de PUISSANCE EFFECTIVE de la cible — modificateurs et auras
     * compris, pas la valeur imprimée (« toutes les unités de Puissance 2
     * ou moins », Le Pont est Plein !). Une unité qu'un buff vient de faire
     * passer à 3 y échappe donc, ce que le texte promet.
     */
    maxPower?: number;
    /**
     * La cible doit déjà porter des dégâts (« une unité déjà blessée »,
     * Vieux Harponneur). Se lit sur `damageMarked`, donc sur les dégâts
     * ENCORE marqués : une unité soignée entre-temps n'est plus blessée.
     */
    damaged?: boolean;
    /**
     * La cible doit avoir subi des dégâts PENDANT CE TOUR DE TABLE
     * (« une unité ayant déjà subi des dégâts ce tour », Qu'on en Finisse).
     * Plus étroit que `damaged` : une blessure encaissée deux tours plus
     * tôt ne compte pas.
     */
    damagedThisTurn?: boolean;
    /**
     * Écarte la carte SOURCE de l'effet (« toutes les AUTRES unités »,
     * Léviathan Balafré). Sans lui, un balayage de masse inclut la carte
     * qui vient de le déclencher.
     */
    excludeSelf?: boolean;
    /**
     * Membres d'une famille (« toutes vos Sentinelles Chromatiques »,
     * « une Sentinelle parmi elles »). Comme partout, l'archétype ne
     * retient que les UNITÉS de la famille.
     */
    archetype?: ArchetypeId;
    /**
     * Écarte la cible DÉSIGNÉE de l'action (`chosenTargetInstanceId`) :
     * « restaurez 1 Résistance à une AUTRE unité » après avoir frappé la
     * première (Verrier de Pont).
     */
    excludeChosenTarget?: boolean;
  };
  /**
   * Lot 15 — « Si elle survit, … » : ne résout CET effet que si la cible
   * désignée (`chosenTargetInstanceId`) est encore en jeu et que ses dégâts
   * restent SOUS sa Résistance effective (Encore Debout ?, Verrier de Pont).
   */
  conditionChosenTargetSurvives?: boolean;
  /** `rearmTriggers` : le déclencheur dont les capacités sont réarmées. */
  rearmTrigger?: import("@/game/triggers/types").TriggerType;
  /** `chromaticModify` / `claimChromaticColor` : couleur fixe. */
  chromaticColor?: import("@/game/cards/types").ChromaticColor;
  /**
   * `chromaticModify` / `claimChromaticColor` : où lire la couleur quand elle
   * n'est pas fixe — la cible désignée, la carte déclencheuse (l'Éclat
   * désigné par `pickUnits`), ou la couleur choisie (`chooseChromaticColor`).
   */
  chromaticColorFrom?: "chosenUnit" | "triggerSource" | "chosenColor";
  /** `chromaticModify` : la cible émet aussi le Signal de ces couleurs. */
  chromaticEmits?: boolean;
  /** `chromaticModify` : le Signal SANS la couleur (« émet également le Signal de cet Éclat »). */
  chromaticEmitOnly?: boolean;
  /**
   * `chromaticModify` : qui reçoit la couleur quand la CIBLE en est la source
   * — l'Éclat désigné (Héraut de Nacre : « elle prend sa couleur » ;
   * Bracelets : « la Sentinelle équipée »).
   */
  chromaticRecipient?: "self" | "equippedUnit";
  /**
   * `pickUnits` : lit la couleur de la cible désignée au moment où la
   * question est posée, et la transmet aux effets appliqués
   * (`EffectContext.chosenColor`) — Transfert de Pierre, dont l'Éclat part
   * avant que le joueur ait désigné sa Sentinelle.
   */
  captureChromaticColorFrom?: "chosenUnit";
  /** `chromaticModify` : « elle bénéficie également de son propre Signal ». */
  chromaticBenefitsOwn?: boolean;
  /**
   * `chooseChromaticColor` : `"all"` — les cinq ; `"missingOnSelf"` — celles
   * que la source n'a pas encore (« la cinquième couleur non utilisée »).
   */
  chromaticOptions?: "all" | "missingOnSelf";
  /**
   * `lookAtDeckTop` : seules les cartes de la couleur lue sur la cible
   * désignée sont prenables (« une Sentinelle de cette couleur », Coffret
   * aux Cinq Pierres).
   */
  takeableColorFrom?: "chosenUnit";
  /**
   * `buff`/`debuff`/`chromaticModify` avec `duration: "untilYourNextTurn"` :
   * le modificateur tombe au début du prochain tour de CELUI QUI L'A POSÉ,
   * même s'il vise une unité adverse (« elle perd 2 Puissance jusqu'à VOTRE
   * prochain tour », Stratège de l'Azur). Sans ce drapeau, la durée se lit
   * sur le propriétaire du plateau — « jusqu'au prochain tour de son
   * propriétaire », comme Chaîne de Travers le demande.
   */
  expiresOnControllersTurn?: boolean;
  /** `buff`/`debuff` : mots-clés RETIRÉS pour la durée (« elle perd Garde »). */
  removeKeywords?: string[];
  /**
   * `buff` : la Puissance n'est accordée que pour le prochain combat contre
   * une cible portant ce mot-clé (Ouvrez la Ligne !). Le montant vient de
   * `attackAmount`.
   */
  nextCombatVsKeyword?: string;
  /** `summon` : invoque la carte du Cimetière désignée (Pierre Retrouvée : « un Éclat de cette couleur »). */
  cardIdFrom?: "chosenGraveyardCard";
  /**
   * `summon` : invoque l'Éclat Chromatique de la couleur de la source,
   * relue sur l'instance — même partie au Cimetière (Émissaire de Quartz,
   * « à sa destruction, créez un Éclat Chromatique de cette couleur »).
   */
  chromaticShardOf?: "self";
  /**
   * `discountNextCards` : la carte qui profite de la réduction subit ces
   * dégâts à son arrivée (La Mauvaise Réputation).
   */
  arrivalDamage?: number;
  /**
   * `pickUnits` : les unités désignées doivent être de couleurs
   * chromatiques différentes (Les Couleurs Répondent).
   */
  distinctChromaticColors?: boolean;
  /**
   * État de Marée concerné par `ignoreNextTideDamage` (ex: "abysses" pour
   * "Bouchons de Cire : ignorez la prochaine perte d'Ancrage abyssale").
   */
  tideState?: "calme" | "houle" | "tempete" | "abysses";

  /** Pour `tideForceJumpToAbysses` UNIQUEMENT : force l'orientation résultante au lieu de la déduire naturellement (ex: Sept Brasses Plus Bas, "l'orientation devient Descendante"). */
  forceTideOrientation?: "montante" | "descendante";
  /**
   * Pour `buff`/`debuff` : `true` = modificateur permanent (ex: un
   * Équipement qui attache "+1 Puissance" tant qu'il reste en jeu), sinon
   * temporaire (retiré en fin de tour). Défaut : temporaire.
   */
  permanent?: boolean;
  /**
   * Pour `buff`/`debuff` : composantes séparées Puissance/Résistance,
   * quand l'effet n'est pas symétrique (ex: "+1 Résistance" seul). Si
   * absents, retombe sur `amount` pour les deux (comportement "+N/+N").
   */
  attackAmount?: EffectAmount;
  healthAmount?: EffectAmount;

  /**
   * Restreint la résolution de CET effet à certains états de Marée courants
   * (ex: Poisson-Lanterne, "récupérez 1 Raison" seulement pendant Tempête/
   * Abysses) — vérifié une fois pour toutes dans `resolveEffect`, avant le
   * `switch` sur `type`, pour rester utilisable par n'importe quel type
   * d'effet sans dupliquer la vérification carte par carte.
   */
  conditionTideStateIn?: Array<"calme" | "houle" | "tempete" | "abysses">;

  /** Restreint la résolution de CET effet à l'orientation de Marée courante (ex: Marin des Jetées, un effet différent selon Montante/Descendante). Même principe que `conditionTideStateIn`. */
  conditionOrientationIs?: "montante" | "descendante";

  /**
   * Restreint la résolution de CET effet à la Raison courante du joueur
   * contrôleur au moment de la résolution (ex: Mousse du Premier Quart,
   * "si votre Raison est inférieure à celle de l'adversaire"). Comparée à
   * `context.controllerId` — jamais à une autre cible.
   */
  conditionControllerReasonBelowOpponent?: boolean;

  /**
   * Restreint la résolution de CET effet au cas où la carte SOURCE
   * (`context.sourceInstanceId`) est actuellement visible selon son propre
   * `visibleDuringTide` (ex: Bouée de Dérive, capacité de début de tour
   * "si elle est visible"). Une carte sans `visibleDuringTide` est toujours
   * visible. Distinct de `onBecomeVisible`, qui ne se déclenche que sur une
   * TRANSITION d'invisible à visible — ceci vérifie l'état courant à chaque
   * résolution, utile pour une capacité récurrente (ex: `startOfTurn`).
   */
  conditionSelfVisible?: boolean;

  /**
   * Pour un Équipement : ne résout CET effet que si le permanent qu'il
   * équipe est actuellement visible (ex: Kit de Calfatage, "si elle est
   * visible"). Sans porteur, l'effet ne se résout pas.
   */
  conditionEquippedUnitVisible?: boolean;

  /**
   * Pour un Équipement : ne résout CET effet que si le permanent qu'il
   * équipe a attaqué pendant le tour en cours (ex: Treuil à Chair, "à
   * chaque fin de votre tour où elle a attaqué"). À évaluer AVANT la
   * remise à zéro de fin de tour (`endOfTurn` se déclenche avant).
   */
  conditionEquippedUnitAttackedThisTurn?: boolean;

  /**
   * Ne résout CET effet que si le contrôleur a au moins ce nombre de cartes
   * en main (ex: Épave à Fleur d'Eau, "vous pouvez défausser 1 carte. Si
   * vous le faites, piochez 1" — sans carte à défausser, pas de pioche).
   */
  conditionControllerHandAtLeast?: number;

  /**
   * « si vous avez 1 carte ou moins en main » (Dernières Réserves, Lot 14) —
   * complément exact de `conditionControllerHandAtLeast`.
   */
  conditionControllerHandAtMost?: number;

  /**
   * « si l'adversaire contrôle plus d'unités que vous » (Un Peu de Répit,
   * Lot 14). Une comparaison, pas un seuil : c'est ce qui rend l'effet
   * COMEBACK — il ne rend rien quand on mène.
   */
  conditionOpponentUnitsMoreThanController?: boolean;

  /**
   * « si l'adversaire contrôle au moins N unités » (Panique sur le Pont,
   * Lot 14) — la même porte anti-swarm que sur une capacité, ici posée sur
   * un effet de POSE, qui n'a pas de capacité où l'accrocher.
   */
  conditionOpponentUnitsAtLeast?: number;

  /**
   * `discard` uniquement — « vous POUVEZ défausser 1 carte » (ex: On rentre
   * bientôt, Épave à Fleur d'Eau). Le choix de défausse ouvert par l'effet
   * accepte alors « ne rien défausser » ; sans ce drapeau, le texte dit
   * « défaussez », et le joueur choisit LAQUELLE, pas SI.
   */
  refusable?: boolean;

  /**
   * « Si une carte Un Dead a rejoint votre Cimetière ce tour, … » (Lot 13)
   * posée sur UN effet et non sur la capacité entière : dans « piochez
   * 1 carte puis défaussez 1 carte. Si une carte Un Dead a rejoint votre
   * Cimetière ce tour, piochez 1 carte supplémentaire » (Le Goûter), la
   * défausse qui précède peut elle-même remplir la condition. Une condition
   * de capacité, évaluée une fois avant le premier effet, la manquerait.
   *
   * Même forme que `TriggeredAbility.condition.graveyardArrival` : elle lit
   * le journal horodaté `PlayerState.graveyardArrivals`.
   */
  conditionGraveyardArrival?: {
    subtype?: string;
    cardIds?: string[];
    /** Restreint à une provenance : `"hand"` (défausse) ou `"board"` (destruction). Absent = d'où qu'elle vienne. */
    fromZone?: "hand" | "board" | "deck";
    since: "thisTurn" | "lastOwnTurn";
  };

  /**
   * Restreint la résolution de CET effet à un plafond ABSOLU de Raison du
   * contrôleur (ex: Thermos du Dernier Quart, "récupérez 3 Raison à la
   * place si vous avez 3 Raison ou moins" — un bonus qui s'ajoute à un
   * effet de base non conditionnel). Contrairement à
   * `conditionControllerReasonBelowOpponent`, compare à une valeur fixe,
   * pas à l'adversaire. Vérifié dans l'ordre du tableau `effects` : placer
   * l'effet conditionnel AVANT l'effet de base pour qu'il lise la Raison
   * telle qu'elle était avant que le reste de la liste ne la modifie.
   */
  conditionControllerReasonAtMost?: number;
}
