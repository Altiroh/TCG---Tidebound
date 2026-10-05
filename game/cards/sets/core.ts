import { HIDDEN_CARD_DEFINITION, HIDDEN_CARD_ID } from "@/game/cards/hiddenCard";
import { TOKEN_SET } from "@/game/cards/sets/tokens";
import { ECLATS_EN_SELLE_SET } from "@/game/cards/sets/eclatsEnSelle";
import { ALTERES_SET } from "@/game/cards/sets/alteres";
import { LANDES_SET } from "@/game/cards/sets/landes";
import { LOT17_SET } from "@/game/cards/sets/lot17";
import { EQUIPPABLE_CARD_TYPES, type CardDefinition, type CardInstance } from "@/game/cards/types";

/**
 * Set de base ("Core") — catalogue verrouillé sur Notion (`Catalogue de
 * cartes`, Lots 01 à 09, resynchronisé le 2026-09-11) : Lots 01-07 et 09
 * comme précédemment, plus le Lot 08 ("Grandes Anomalies de Marée",
 * "La Gueule Sous la Mer" / "Sept Brasses Plus Bas") désormais intégré.
 * Cette resynchronisation a aussi scindé en couple STANDARD/ABYSSALE
 * plusieurs cartes dont seule la variante Abyssale existait par erreur
 * sous l'id de base ("Ce Qui Suit le Navire", "Ils Sont Sous Nous",
 * "L'Œil Sous la Mer", "Le Fond Vous Regarde", "Cloche du Grand Fond",
 * "La Mer Réclame Davantage"), corrigé "Bat-Marin — ABYSSALE" qui
 * dupliquait par erreur les stats/texte de sa Standard, et repris deux
 * renommages du catalogue ("Masse Noire" → "Masse-Sombre", "L'Homme
 * Revenu de la Fosse" → "Revenante de la Fosse", cette dernière n'ayant
 * plus de variante Abyssale). Toutes les cartes sont exprimées en
 * données pures : pas de code spécifique à une carte dans le moteur.
 *
 * ÉVICTION DES EAUX (2026-09-10) — le sous-système autonome des Eaux
 * (paquet séparé, révélation, effet environnemental parallèle à la
 * Marée) est abandonné côté design ET retiré du moteur (l'ancien
 * `game/environment/waterData.ts` et les champs `currentWaterId`/
 * `waterRemainingTurns` d'`EnvironmentState` n'existent plus). Ses
 * anciennes fonctions sont absorbées par la Marée : son état, sa durée,
 * et sa nouvelle **orientation** (`EnvironmentState.tideOrientation`,
 * "montante" vers les Abysses / "descendante" vers le Calme — bascule
 * naturellement à ces deux bornes, cf. `game/environment/types.ts`).
 * L'inversion d'orientation par une carte est câblée via l'effet
 * générique `tideInvertOrientation` (ex: "cartes-des-courants") ou
 * `tideSetOrientation` quand le texte fixe un sens précis.
 *
 * FIDÉLITÉ MÉCANIQUE — chaque carte porte son texte RÉEL et complet
 * (`text`), et sa définition doit le réaliser : c'est vérifié carte par
 * carte par `tests/game/cardConformity.test.ts`, qui relit les textes et
 * contrôle la structure (fréquence, caractère facultatif, déclencheur,
 * durée, visibilité, mots-clés, montants, vocabulaire). Un écart assumé
 * s'inscrit dans les `EXCEPTIONS` de ce test AVEC son motif, et se
 * commente ici ; il n'y a plus de convention "non appliqué".
 *
 * Le moteur exprime aujourd'hui : "première fois par tour" par source
 * (`oncePerTurnKey`) et "première fois" définitive (`onceEver`), les
 * déclencheurs d'observateur de portée large (`triggeredBy` : archétype,
 * sous-type, type de carte, camp adverse, permanent équipé), les
 * conditions de capacité évaluées avant consommation (`condition`), les
 * choix de joueur — en fenêtre de réaction (`mode: "optional"") comme en
 * choix bloquant (`choiceGroup` automatique), l'attachement d'Équipement
 * persistant, la lecture d'information cachée, la récupération au
 * Cimetière, le Sabordage forcé (`saborde`) et les boucliers "première
 * fois par tour" (`game/state/shields.ts`). Les capacités de Navire, elles,
 * restent partiellement appliquées (voir `game/environment/shipData.ts`).
 *
 * NOTE — "Calme", "Houle", "Tempête" et "Abysses" sont des termes réservés
 * à l'état de Marée. Résistance = champ `health`, y compris pour les
 * Structures et Objets (le moteur traite déjà tout permanent du board de
 * façon générique pour les dégâts/la mort, cf. `processDeaths.ts`).
 */
/**
 * Lot de diffusion du premier booster Cra-Poiscail (`CardDefinition.setCode`).
 * Tant qu'aucun booster ne déclare ce lot, ses cartes restent hors de tous
 * les pools de tirage — cf. `features/boosters/actions.ts`.
 */
export const CRA_POISCAIL_BOOSTER_1 = "cra-poiscail-1";
/** Deuxième booster de l'archétype — variantes Bris d'Objets, Marée et value. */
export const CRA_POISCAIL_BOOSTER_2 = "cra-poiscail-2";
/** Troisième booster — branche Chevalier/Destrier/Bourreau, finishers et variantes Abyssales. */
export const CRA_POISCAIL_BOOSTER_3 = "cra-poiscail-3";

/** Lot 11 — Les Masques Noyés / Théâtre Englouti (`CardDefinition.setCode`). */
export const THEATRE_ENGLOUTI = "theatre-englouti";

/**
 * Sous-type de la troupe du Théâtre Englouti. Constante plutôt que chaîne
 * répétée : c'est la clé que lisent les filtres de ciblage, les réductions
 * de coût et les capacités d'observateur du lot — une faute de frappe y
 * serait silencieuse.
 */
export const MARIONNETTE = "marionnette";

/** Lot 12 — Rapiécer la Coque (`CardDefinition.setCode`). */
export const RAPIECER_LA_COQUE = "rapiecer-la-coque";

/**
 * Sous-type des volatiles du Lot 12 (Sterne, Goéland, Cormoran, Albatros,
 * Pélican, Mouette). Comme MARIONNETTE : une famille de ciblage et une
 * identité visuelle, pas un mot-clé — aucun volatile ne gagne quoi que ce
 * soit du seul fait d'en être un.
 */
export const VOLATILE = "volatile";

/**
 * Lot 14 — Nécessaire du Marin (`CardDefinition.setCode`). Lot de
 * consolidation : ses cartes sont génériques, à DEUX exceptions près
 * (Notion, 22/09/2026) — Le Naufragé Impossible rejoint les Un Dead, et
 * Le Dernier Rempart ouvre l'archétype Cavalerie.
 */
export const NECESSAIRE_DU_MARIN = "necessaire-du-marin";

/**
 * Sous-type de l'archétype Cavalerie, ouvert par Le Dernier Rempart. Même
 * convention que MARIONNETTE, VOLATILE et UN_DEAD : une famille de ciblage
 * et une identité, pas un mot-clé — aucune Cavalerie ne gagne quoi que ce
 * soit du seul fait d'en être une.
 */
export const CAVALERIE = "cavalerie";

/** Lot 13 — La Veillée des Disparus (`CardDefinition.setCode`). */
export const VEILLEE_DES_DISPARUS = "veillee-des-disparus";

/**
 * Sous-type de la famille du Lot 13. Comme MARIONNETTE et VOLATILE : une
 * famille de ciblage, pas un mot-clé — aucun Un Dead ne gagne quoi que ce
 * soit du seul fait d'en être un. Sous-type et non archétype, sans quoi ces
 * cartes compteraient dans les seuils Cra-Poiscail (`countArchetypeUnits`).
 */
export const UN_DEAD = "un-dead";

export const CORE_SET: CardDefinition[] = [
  // ======================================================================
  // LOT 01 — Premières cartes
  // ======================================================================
  {
    id: "marin-des-jetees",
    name: "Marin des Jetées",
    type: "marin",
    cost: 1,
    attack: 1,
    health: 2,
    text:
      "À son arrivée, si la Marée est montante, il gagne +1 Résistance jusqu'à votre prochain tour. Si elle est " +
      "descendante, récupérez 1 Raison.",
    onPlayEffects: [
      {
        type: "buff",
        target: { kind: "self" },
        healthAmount: { kind: "flat", value: 1 },
        // "jusqu'à votre prochain tour" : couvre aussi le tour adverse.
        duration: "untilYourNextTurn",
        conditionOrientationIs: "montante",
      },
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionOrientationIs: "descendante" },
    ],
  },
  {
    id: "vieux-loup-de-mer",
    name: "Vieux Loup de Mer",
    type: "marin",
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 2,
    text: "La première fois à chaque tour que vous perdez de la Raison, réduisez cette perte de 1.",
    reduceOwnReasonLossOncePerTurn: { amount: 1 },
  },
  {
    id: "murene-aveugle",
    name: "Murène Aveugle",
    type: "creature",
    cost: 2,
    attack: 3,
    health: 1,
    // Volontairement sans effet (cadrage Notion "Catalogue de cartes") : corps agressif lisible à 3/1 pour coût 2.
  },
  {
    id: "poisson-lanterne",
    name: "Poisson-Lanterne",
    type: "creature",
    cost: 1,
    attack: 1,
    health: 1,
    text: "À son arrivée, si la Marée actuelle est Tempête ou Abysses, récupérez 1 Raison.",
    onPlayEffects: [
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionTideStateIn: ["tempete", "abysses"],
      },
    ],
  },
  {
    id: "chose-des-hauts-fonds",
    name: "Chose des Hauts-Fonds",
    type: "creature",
    cost: 4,
    attack: 4,
    health: 4,
    text: "Tant que vous avez 5 Raison ou moins, elle gagne Garde.",
    conditionalKeywords: [{ keyword: "garde", controllerReasonAtMost: 5 }],
  },
  {
    id: "caisses-arrimees",
    name: "Caisses Arrimées",
    type: "structure",
    cost: 1,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["calme", "houle"],
    // Rework du 21/09/2026 : l'effet visible ne bouge pas, une Réaction
    // cachée s'ajoute. Le vrai apport est le CHOIX — garder la carte pour
    // 2 Ancrage plus tard, ou la brûler maintenant pour encaisser un coup.
    text:
      "Durée : 4 tours. Visible pendant Calme et Houle. Sabordage : récupérez 2 Ancrage. Réaction cachée : " +
      "lorsque votre Navire devrait subir des dégâts directs, vous pouvez révéler puis Saborder Caisses " +
      "Arrimées : réduisez ces dégâts de 2.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : récupérez 2 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
      },
      {
        // Le Sabordage déclenche la capacité ci-dessus : réduire les dégâts
        // ET récupérer 2 Ancrage. C'est voulu — le texte dit « Sabordez »,
        // et Saborder a toujours ce sens sur cette carte.
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true },
        description: "Révélez puis Sabordez Caisses Arrimées : réduisez ces dégâts de 2.",
        effects: [
          { type: "reduceIncomingDamage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
          { type: "saborde", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "brise-vague-de-fortune",
    name: "Brise-Vague de Fortune",
    type: "structure",
    cost: 2,
    health: 4,
    durationTurns: 3,
    visibleDuringTide: ["houle", "tempete"],
    text:
      "Durée : 3 tours. Visible pendant Houle et Tempête. La première fois que votre Navire subit des dégâts de " +
      "Tempête, réduisez-les de 1.",
    // « La première fois que » se lit au pied de la lettre : UN seul usage
    // pour toute la partie, jamais réarmé d'un tour à l'autre (décision du
    // 17/09/2026, tranchée contre la lecture « une fois par tour » qui
    // valait auparavant ici).
    reduceTideShipDamageOncePerTurn: { amount: 1, tideStateIn: ["tempete"], onceEver: true },
  },
  {
    id: "harpon-de-pont",
    name: "Harpon de Pont",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text:
      "Équipez un Marin ou une Créature. Il gagne +1 Puissance. S'il attaque directement le Navire adverse, il " +
      "subit 1 dégât après l'attaque.",
    equipTargetTypes: ["marin", "creature"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { attackAmount: 1 },
    selfDamageOnDirectAttack: 1,
  },
  {
    id: "thermos-du-dernier-quart",
    name: "Thermos du Dernier Quart",
    type: "objet",
    cost: 2,
    text: "Brisez cet Objet : récupérez 2 Raison. Si vous avez 3 Raison ou moins, récupérez-en 3 à la place.",
    onBreakEffects: [
      // Ordre important : l'effet conditionnel lit la Raison AVANT que le
      // gain de base ne l'augmente (cf. `conditionControllerReasonAtMost`).
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionControllerReasonAtMost: 3 },
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
    ],
  },
  {
    id: "cylindre-flottant",
    name: "Cylindre flottant",
    type: "structure",
    subtype: "objet-flottant",
    cost: 2,
    maxCopies: 2,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["houle", "tempete"],
    // CARTE ÉTALON DES STRUCTURES-PIÈGES (passe de stabilisation,
    // 21/09/2026). Elle était résolue AUTOMATIQUEMENT — le commentaire
    // d'alors l'assumait : « renvoyer les dégâts n'est jamais un
    // désavantage ». C'est faux depuis qu'elle se détruit ensuite : sacrifier
    // la carte pour annuler 1 dégât est un mauvais échange, et le texte dit
    // « vous pouvez ». Le joueur décide donc, par une fenêtre
    // d'interception ouverte À LA DÉCLARATION de l'attaque.
    //
    // Visible, elle frappe un permanent adverse DÉSIGNÉ. Masquée, elle est
    // un piège : l'adversaire voit un Slot occupé, pas une carte, et
    // l'activer la révèle AVANT que ses effets ne s'appliquent
    // (`hiddenReaction`).
    //
    // ÉQUILIBRAGE NON VERROUILLÉ : les dégâts renvoyés passent de la moitié
    // à la TOTALITÉ, et la cible visible du Navire adverse à un permanent
    // choisi. C'est un renforcement net, signalé comme à valider au
    // playtest par le cadrage lui-même.
    text:
      "Durée : 3 tours. Visible pendant Houle et Tempête. La première fois à chaque tour que votre Navire devrait " +
      "subir des dégâts directs d'une attaque, vous pouvez annuler ces dégâts et infliger autant de dégâts à un " +
      "permanent adverse de votre choix. Détruisez ensuite Cylindre flottant. Réaction cachée : lorsqu'une unité " +
      "adverse attaque directement votre Navire, vous pouvez révéler Cylindre flottant : annulez les dégâts de " +
      "cette attaque et infligez autant de dégâts au Navire adverse. Détruisez ensuite Cylindre flottant.",
    abilities: [
      {
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        oncePerTurnKey: "cylindreContrecoup",
        // « des dégâts directs D'UNE ATTAQUE » : un tir de Navire n'est pas
        // l'attaque d'une unité — il ne déclenche pas le Cylindre (et
        // « autant de dégâts », qui lit la Puissance de l'attaquant, n'y
        // vaudrait rien).
        condition: { selfVisible: true, attackFromUnit: true },
        description: "Annulez les dégâts directs et infligez-les à un permanent adverse, puis détruisez cette carte.",
        effects: [
          { type: "cancelIncomingAttack", target: { kind: "controllerPlayer" } },
          { type: "damage", target: { kind: "chosenUnit", among: { opponentOnly: true } }, amount: { kind: "incomingAttackDamage" } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
      // Masqué, il frappe le NAVIRE adverse et non un permanent : le joueur
      // ne choisit pas de cible, puisqu'il n'a pas choisi son moment non plus.
      {
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        hiddenReaction: true,
        // « lorsqu'une UNITÉ adverse attaque directement » : pas un tir de Navire.
        condition: { selfHidden: true, attackFromUnit: true },
        description: "Révélez Cylindre flottant : annulez les dégâts et infligez-les au Navire adverse, puis détruisez cette carte.",
        effects: [
          { type: "cancelIncomingAttack", target: { kind: "controllerPlayer" } },
          { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "incomingAttackDamage" } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },

  // ======================================================================
  // LOT 02 — Contrôle, environnement et permanents déclenchés
  // ======================================================================
  {
    id: "cartes-des-courants",
    name: "Cartes des Courants",
    type: "objet",
    cost: 2,
    text: "Brisez cet Objet : inversez l'orientation de la prochaine transition de Marée (montante ↔ descendante).",
    onBreakEffects: [{ type: "tideInvertOrientation", target: { kind: "allPlayers" } }],
  },
  {
    id: "cloche-dalerte",
    name: "Cloche d'Alerte",
    type: "structure",
    cost: 1,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["calme", "houle"],
    maxCopies: 2,
    text:
      "Durée : 3 tours. Visible pendant Calme et Houle. La première fois à chaque tour que l'adversaire Brise un " +
      "Objet, il doit payer 1 Raison supplémentaire. S'il ne peut pas payer, l'Objet ne peut pas être Brisé.",
    // La taxe s'ajoute au coût du Bris (depuis la main : demi-coût + 1 ;
    // depuis le plateau : 1 au lieu de rien) ET le rend impossible si la
    // Raison ne couvre pas le total — c'est la seule entorse au « pas de
    // plancher de Déraison », portée par la carte (cf. `objectBreakTax`).
    taxOpponentObjectBreakOncePerTurnWhileVisible: { amount: 1, blocksIfUnpayable: true },
  },
  {
    // --- ANTI-SWARM, première paire (21/09/2026) ------------------------
    // Notion « Audit systémique » § Priorités de couverture : « Anti-swarm
    // — faibles dégâts de zone, punition du nombre de Slots occupés ». Le
    // banc d'essai le confirme : Le Banc Déborde est premier du tournoi des
    // dix listes, et la mesure dit pourquoi — 9 à 20 INVOCATIONS par partie
    // pour 5 à 9 cartes posées. Ses corps ne passent jamais par la Raison,
    // donc la courbe de Raison ne le freine pas.
    //
    // Ces deux cartes rendent un prix au nombre, sans board wipe : aucune
    // ne détruit quoi que ce soit d'office. La Nasse tape pour 1 — ce qu'un
    // Péon 1/1 ne survit pas, ce qu'une P'tite Fesse 1/2 encaisse — et ne
    // s'arme qu'à quatre unités adverses. Rester à trois est une réponse
    // complète.
    //
    // Les deux seuils DIFFÈRENT, et la mesure le justifie : Le Banc Déborde
    // tient 3,6 corps en moyenne contre La Ligne Tenue, jamais 5. À 4, une
    // carte ne mord que sur les pointes — c'est ce qu'on veut d'une punition
    // sèche et unique (la Nasse), pas d'une goutte lente (le Rôle, à 3).
    //
    // ÉQUILIBRAGE NON VERROUILLÉ : seuils, dégât et coûts sont des premières
    // valeurs. Ce que la mesure dit déjà, en revanche, c'est que ces cartes
    // ne renversent PAS le matchup — voir le message de commit.
    id: "la-nasse-trop-pleine",
    name: "La Nasse Trop Pleine",
    type: "structure",
    cost: 3,
    health: 3,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. La première fois à chaque tour qu'une unité adverse " +
      "arrive alors que l'adversaire contrôle au moins 4 unités, infligez 1 dégât à chaque unité adverse. " +
      "Réaction cachée : lorsqu'une unité adverse arrive alors que l'adversaire contrôle au moins 4 unités, vous " +
      "pouvez révéler La Nasse Trop Pleine : infligez 1 dégât à chaque unité adverse. Détruisez ensuite La Nasse " +
      "Trop Pleine.",
    abilities: [
      {
        // Visible, elle est une menace CONNUE : l'adversaire voit le seuil
        // et peut s'arrêter à trois corps. C'est là toute la différence
        // avec un board wipe, qui ne laisse rien à décider.
        trigger: "onEnterPlay",
        triggeredBy: { cardTypes: ["marin", "creature"], opponentOnly: true },
        oncePerTurnKey: "nasseTropPleine",
        condition: { selfVisible: true, opponentUnitsAtLeast: 4 },
        description: "Une quatrième unité adverse arrive : 1 dégât à chaque unité adverse.",
        effects: [{ type: "damage", target: { kind: "allEnemyUnits" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        // Masquée, elle ne prévient pas — mais elle se détruit en se
        // déclenchant, donc elle ne mord qu'une fois et l'adversaire sait
        // ensuite que le Slot est vide.
        trigger: "onEnterPlay",
        triggeredBy: { cardTypes: ["marin", "creature"], opponentOnly: true },
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true, opponentUnitsAtLeast: 4 },
        description: "Révélez La Nasse Trop Pleine : 1 dégât à chaque unité adverse, puis détruisez-la.",
        effects: [
          { type: "damage", target: { kind: "allEnemyUnits" }, amount: { kind: "flat", value: 1 } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    // Deuxième moitié de la paire : la punition du NOMBRE, qui ne tue rien.
    // Elle ne s'en prend pas aux corps mais à ce qui devrait les payer — la
    // Raison. Un banc large voit sa récupération amputée tour après tour
    // (dette SUBIE, cf. `endTurn`), donc ses cartes PAYANTES deviennent
    // hors de portée pendant que ses invocations, elles, restent gratuites.
    //
    // Toujours visible, et c'est voulu : « ne pas transformer toutes les
    // Structures en pièges » (Notion). Une taxe qu'on ne voit pas venir
    // n'apprend rien ; celle-ci se lit sur la table et invite l'adversaire
    // à s'arrêter à trois corps de lui-même.
    id: "le-role-dequipage",
    name: "Le Rôle d'Équipage",
    type: "structure",
    cost: 2,
    health: 3,
    durationTurns: 4,
    maxCopies: 2,
    text:
      "Durée : 4 tours. À la fin de votre tour, si l'adversaire contrôle au moins 3 unités, il perd 1 Raison " +
      "pour chaque unité qu'il contrôle au-delà de 2.",
    abilities: [
      {
        trigger: "endOfTurn",
        condition: { opponentUnitsAtLeast: 3 },
        description: "Fin de votre tour : l'adversaire perd 1 Raison par unité au-delà de la troisième.",
        effects: [
          {
            type: "reasonLoss",
            target: { kind: "opponentPlayer" },
            // `above: 3` est ce qui rend la carte inerte contre un plateau
            // normal ; `per: 1` est le « 1 Raison » du texte, écrit plutôt
            // que sous-entendu.
            amount: { kind: "unitCount", of: "opponent", above: 2, per: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "marin-aux-yeux-rouges",
    name: "Marin aux Yeux Rouges",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 2,
    // Symétrie retirée (passe de stabilisation, 21/09/2026). Le texte
    // "chaque joueur" était défavorable à son propre contrôleur sur DEUX
    // plans : il a déjà payé le coût de 2, et depuis l'arbitrage du 21/09 sa
    // perte est CHOISIE (elle peut le pousser sous zéro et lui coûter de
    // l'Ancrage en fin de tour) quand celle de l'adversaire est SUBIE (du
    // revenu, plafonné à un tour, sans dégâts). Le même texte produisait
    // donc deux effets de nature différente, le plus dur pour le payeur.
    text: "À son arrivée, l'adversaire perd 1 Raison.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    // Première carte à capacité FACULTATIVE (`mode: "optional"`) du
    // catalogue — démontre le pipeline de fenêtre de réaction de bout en
    // bout (Notion "Moteur de partie — déroulement, Raison & chaînes
    // d'effets", section "Effets facultatifs / réactions", verrouillage
    // du 2026-09-10). `onCardPlayed` se déclenche pour n'importe quelle
    // carte jouée par n'importe quel joueur (même convention que les
    // capacités automatiques existantes sur ce trigger) : le texte reste
    // volontairement neutre plutôt que de prétendre à tort "seulement
    // l'adversaire".
    id: "guetteur-mefiant",
    name: "Guetteur Méfiant",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 2,
    // Limitée à une fois par tour le 21/09/2026. Sans limite, elle ouvrait
    // une fenêtre de réaction à CHAQUE carte jouée : un adversaire qui en
    // pose trois devait confirmer trois fois, ce qui est exactement ce que
    // le cadrage veut éviter — « le joueur doit pouvoir jouer normalement
    // sans devoir confirmer une réaction après chaque action ». Le coût en
    // Raison ne suffisait pas à l'autolimiter : c'est le NOMBRE de fenêtres
    // qui pesait, pas leur prix.
    text:
      "La première fois à chaque tour qu'une carte est jouée, vous pouvez dépenser 1 Raison : infligez 2 dégâts " +
      "à une unité de votre choix.",
    abilities: [
      {
        trigger: "onCardPlayed",
        mode: "optional",
        oncePerTurnKey: "guetteurMefiant",
        cost: { reason: 1 },
        // « une UNITÉ de votre choix » : Marin ou Créature, sur l'un ou
        // l'autre plateau — jamais une Structure ni un Équipement.
        effects: [
          {
            type: "damage",
            target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false } },
            amount: { kind: "flat", value: 2 },
          },
        ],
        description: "La première fois à chaque tour qu'une carte est jouée : dépensez 1 Raison pour infliger 2 dégâts à une unité.",
      },
    ],
  },
  {
    // Variante ABYSSALE distincte de "marin-aux-yeux-rouges" (coexiste avec la
    // Standard, cf. Notion "Catalogue de cartes" — règle des variantes Abyssales) :
    // le catalogue verrouillé compte cette carte comme le "+1" au-delà des 80
    // cartes de base ("80 cartes de base conçues et auditées + 1 variante
    // Abyssale distincte", TCG_DATABASE.md).
    id: "marin-aux-yeux-rouges-abyssal",
    name: "Marin aux Yeux Rouges",
    type: "marin",
    variant: "abyssale",
    cost: 3,
    attack: 3,
    health: 3,
    // Même retrait de symétrie que la Standard (21/09/2026) : "chaque
    // joueur" → "l'adversaire". Les deux clauses d'orientation ne bougent pas.
    text:
      "À son arrivée, l'adversaire perd 1 Raison. Si la Marée est montante, il en perd 1 " +
      "supplémentaire. Si elle est descendante, récupérez 1 Raison.",
    onPlayEffects: [
      { type: "reasonLoss", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "reasonLoss",
        target: { kind: "opponentPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionOrientationIs: "montante",
      },
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionOrientationIs: "descendante",
      },
    ],
  },
  {
    id: "matelot-du-sans-nom",
    name: "Matelot du Sans-Nom",
    type: "marin",
    cost: 3,
    attack: 3,
    health: 4,
    // Volontairement sans effet (cadrage Notion "Catalogue de cartes") : 3/4 pour coût 3 sert de référence de corps simple.
  },
  {
    id: "anguille-des-profondeurs",
    name: "Anguille des Profondeurs",
    type: "creature",
    cost: 3,
    attack: 3,
    health: 2,
    text: "Pendant Abysses, lorsqu'elle inflige des dégâts directs au Navire adverse, celui-ci perd aussi 1 Raison.",
    opponentReasonLossOnDirectAttack: { amount: 1, tideStateIn: ["abysses"] },
  },
  {
    id: "crabe-de-fer",
    name: "Crabe de Fer",
    type: "creature",
    cost: 3,
    attack: 2,
    health: 5,
    keywords: ["garde"],
    text: "Garde. Perd Garde pendant Calme.",
    conditionalKeywordSuppressions: [{ keyword: "garde", tideStateIn: ["calme"] }],
  },
  {
    id: "epave-a-fleur-deau",
    name: "Épave à Fleur d'Eau",
    type: "structure",
    cost: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["houle"],
    text:
      "Durée : 4 tours. Visible pendant Houle uniquement. Chaque fois qu'elle devient visible, vous pouvez défausser 1 " +
      "carte. Si vous le faites, piochez 1 carte.",
    // Réaction facultative à sa propre apparition (`STRUCTURE_REVEALED`).
    // Dans l'ordre du texte : le joueur DÉSIGNE la carte à défausser (choix
    // `handDiscard`), PUIS pioche — la séquence reprend après le choix
    // (`resolveEffectSequence`). Pioche d'abord, il pourrait défausser la
    // carte qu'il vient de voir : un filtrage que le texte ne donne pas.
    // Main vide : rien à défausser, la capacité ne se propose pas — et la
    // pioche, liée par « si vous le faites », n'a pas lieu non plus.
    abilities: [
      {
        trigger: "onBecomeVisible",
        mode: "optional",
        condition: { controllerHandAtLeast: 1 },
        description: "Vous pouvez défausser 1 carte. Si vous le faites, piochez 1 carte.",
        effects: [
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "plaque-de-fortune",
    name: "Plaque de Fortune",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 1,
    text:
      "Équipez un permanent. La première fois qu'il devrait être détruit, détruisez la Plaque de Fortune à la " +
      "place et ce permanent perd 1 Résistance.",
    // « Un permanent » : la seule Plaque qui se pose AUSSI sur une Structure
    // — par défaut un Équipement ne va que sur une unité.
    equipTargetTypes: ["marin", "creature", "structure"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    destructionSubstitute: { healthPenalty: 1 },
  },

  // ======================================================================
  // LOT 03 — Abysses, visibilité et contrôle de Marée
  // ======================================================================
  {
    id: "matelot-insomniaque",
    name: "Matelot Insomniaque",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 3,
    text: "Tant que votre Raison est inférieure ou égale à 4, il gagne +1 Puissance.",
    selfBuffWhileControllerReasonAtMost: { reasonAtMost: 4, attackAmount: 1 },
  },
  {
    id: "raie-des-fosses",
    name: "Raie des Fosses",
    type: "creature",
    cost: 3,
    maxCopies: 2,
    attack: 3,
    health: 3,
    text: "Pendant Abysses, elle peut attaquer le Navire adverse même si celui-ci est protégé par une carte avec Garde.",
    bypassesGardeTideStateIn: ["abysses"],
  },
  {
    id: "poisson-aux-dents-de-verre",
    name: "Poisson aux Dents de Verre",
    type: "creature",
    cost: 2,
    attack: 2,
    health: 3,
    // Volontairement sans effet (cadrage Notion "Catalogue de cartes") : récompense de combat lisible via ses stats seules.
  },
  {
    id: "la-chose-qui-remonte",
    name: "La Chose qui Remonte",
    type: "creature",
    cost: 5,
    attack: 5,
    health: 5,
    requiresTideState: ["tempete", "abysses"],
    text: "Ne peut être jouée que pendant Tempête ou Abysses. À son arrivée, perdez 2 Raison.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
  },
  {
    id: "treuil-rouille",
    name: "Treuil Rouillé",
    type: "equipement",
    permanent: true,
    cost: 1,
    health: 2,
    text:
      "Équipez une Structure. Elle gagne +1 Résistance. Quand la Structure équipée quitte le board, piochez 1 " +
      "carte.",
    equipTargetTypes: ["structure"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { healthAmount: 1 },
    // « Quitte le board », par toutes les portes : détruite, Sabordée (qui
    // déclenche aussi `onDeath`), expirée, ou renvoyée en main. L'Équipement
    // est encore sur le plateau à cet instant (`destroyOrphanedEquipment` ne
    // le retire qu'ensuite), il peut donc suivre son porteur via
    // `triggeredBy.equippedUnit` — qui suffit à l'identifier, d'où
    // `sameController: false` (une Structure adverse équipée compte aussi).
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { equippedUnit: true, sameController: false },
        description: "Quand la Structure équipée quitte le board : piochez 1 carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onExpire",
        triggeredBy: { equippedUnit: true, sameController: false },
        description: "Quand la Structure équipée expire : piochez 1 carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onReturnedToHand",
        triggeredBy: { equippedUnit: true, sameController: false },
        description: "Quand la Structure équipée est renvoyée en main : piochez 1 carte.",
        effects: [{ type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "lampe-de-pont-rouge",
    name: "Lampe de Pont Rouge",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text: "Équipez un Marin. Tant que vous êtes en Houle ou Tempête, il gagne +1 Puissance et +1 Résistance.",
    equipTargetTypes: ["marin"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    // Bug corrigé au passage : l'Équipement ne s'attachait même pas (onPlayEffects absent).
    equipGrantsBuffWhileTideStateIn: { tideStateIn: ["houle", "tempete"], attackAmount: 1, healthAmount: 1 },
  },
  {
    id: "filet-a-la-derive",
    name: "Filet à la Dérive",
    type: "structure",
    cost: 2,
    health: 3,
    durationTurns: 3,
    visibleDuringTide: ["calme", "houle"],
    // Rework du 21/09/2026 : l'effet de début de tour était trop passif — il
    // fallait attendre son propre tour pour affaiblir une Créature qui avait
    // déjà frappé. Devient une vraie défense, qui mord AU MOMENT de l'attaque.
    // Anti-swarm : aucun seuil de Puissance, contrairement au Filet qui
    // Respire, qui vise les grosses menaces.
    text:
      "Durée : 3 tours. Visible pendant Calme et Houle. La première fois à chaque tour qu'une unité adverse " +
      "attaque, elle perd 1 Puissance pour cette attaque. Réaction cachée : lorsqu'une unité adverse attaque, " +
      "vous pouvez révéler Filet à la Dérive : cette unité perd 2 Puissance pour cette attaque.",
    abilities: [
      {
        // Pas de « vous pouvez » : la défense visible s'applique d'elle-même.
        trigger: "onUnitAttackDeclared",
        oncePerTurnKey: "filetDeriveAffaiblit",
        condition: { selfVisible: true },
        description: "La première fois à chaque tour qu'une unité adverse attaque : elle perd 1 Puissance pour cette attaque.",
        effects: [{ type: "modifyAttackerPower", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true },
        description: "Révélez Filet à la Dérive : l'unité qui attaque perd 2 Puissance pour cette attaque.",
        effects: [{ type: "modifyAttackerPower", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
      },
    ],
  },
  {
    id: "balise-des-profondeurs",
    name: "Balise des Profondeurs",
    type: "structure",
    subtype: "objet-flottant",
    cost: 2,
    health: 2,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete", "abysses"],
    maxCopies: 2,
    text:
      "Durée : 4 tours. Visible pendant Houle, Tempête et Abysses. La première fois à chaque tour que la Marée " +
      "change, vous pouvez perdre 1 Raison. Si vous le faites, augmentez de 1 tour la durée du nouvel état.",
    abilities: [
      {
        trigger: "onTideStateEntered",
        mode: "optional",
        cost: { reason: 1 },
        oncePerTurnKey: "baliseProlonge",
        description: "Vous pouvez perdre 1 Raison : prolongez la nouvelle Marée d'1 tour.",
        effects: [{ type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },

  // ======================================================================
  // LOT 04 — Pression, horreur et cartes de rupture
  // ======================================================================
  {
    id: "harponneur-du-dernier-quai",
    name: "Harponneur du Dernier Quai",
    type: "marin",
    cost: 3,
    attack: 3,
    health: 3,
    text: "Lorsqu'il attaque pendant Tempête, il gagne +1 Puissance pour ce combat. Après l'attaque, perdez 1 Raison.",
    bonusDamageInTideState: { tideStateIn: ["tempete"], amount: 1 },
    controllerReasonLossAfterAttack: 1,
  },
  {
    // Renommée "L'Homme Revenu de la Fosse" → "Revenante de la Fosse" (Notion "Catalogue de cartes", Lot 04)
    // — id conservé (référencée par testDecks.ts). Coexiste avec une variante ABYSSALE distincte ci-dessous
    // (confirmée malgré la note de lot qui la disait "STANDARD seule" — texte non mis à jour côté Notion).
    id: "lhomme-revenu-de-la-fosse",
    name: "Revenante de la Fosse",
    type: "marin",
    cost: 4,
    attack: 3,
    health: 4,
    text: "À son arrivée, perdez 1 Raison. Tant que vous êtes en Abysses, il gagne +1 Résistance.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
    tideAffinity: { abysses: { attack: 3, health: 5 } },
  },
  {
    // Variante ABYSSALE distincte — reprend les stats/texte de l'ancienne entrée unique sous
    // "L'Homme Revenu de la Fosse" avant renommage, correspondant aux illustrations fournies
    // ("revenante-de-la-fosse-abyssal.webp"/"-debord").
    id: "revenante-de-la-fosse-abyssal",
    name: "Revenante de la Fosse",
    type: "marin",
    variant: "abyssale",
    cost: 5,
    attack: 4,
    health: 4,
    maxCopies: 1,
    text:
      "À son arrivée, perdez 2 Raison. Tant que vous êtes en Abysses, la première fois à chaque tour qu'il devrait " +
      "être détruit, il reste à 1 Résistance à la place.",
    onPlayEffects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
    survivesLethalOncePerTurn: { tideStateIn: ["abysses"] },
  },
  {
    id: "requin-balafre",
    name: "Requin Balafré",
    type: "creature",
    cost: 3,
    attack: 4,
    health: 2,
    text: "Lorsqu'il inflige des dégâts directs au Navire adverse, il subit 1 dégât.",
    selfDamageOnDirectDamageDealt: 1,
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 04, confirmée coexister avec une variante ABYSSALE
    // distincte — non reflété dans le texte du lot, qui ne montre qu'une ligne). Stats inférées (aucune
    // ligne STANDARD publiée) en cohérence avec l'écart Standard/Abyssale observé ailleurs dans ce lot ;
    // à corriger si des chiffres officiels sont publiés.
    id: "masse-sombre",
    name: "Masse-Sombre",
    type: "creature",
    cost: 3,
    attack: 3,
    health: 4,
    text: "Pendant Calme, elle ne peut pas attaquer. Pendant Abysses, elle gagne +1 Puissance.",
    tideAffinity: {
      calme: { attack: 3, health: 4, inactive: true },
      abysses: { attack: 4, health: 4 },
    },
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée du
    // catalogue sous l'id "masse-noire" ; renommée et scindée pour correspondre aux illustrations
    // fournies ("masse-sombre-abyssal.webp"/"-debord") et à la confirmation d'une vraie paire STD/ABY.
    id: "masse-sombre-abyssal",
    name: "Masse-Sombre",
    type: "creature",
    variant: "abyssale",
    cost: 4,
    attack: 4,
    health: 5,
    text: "Pendant Calme, elle ne peut pas attaquer. Pendant Abysses, elle gagne +1 Puissance.",
    tideAffinity: {
      calme: { attack: 4, health: 5, inactive: true },
      abysses: { attack: 5, health: 5 },
    },
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 04) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "ce-qui-suit-le-navire",
    name: "Ce Qui Suit le Navire",
    type: "creature",
    cost: 4,
    attack: 4,
    health: 5,
    text: "Vous ne pouvez la jouer que si vous avez 5 Raison ou moins. À son arrivée, perdez 1 Ancrage.",
    requiresControllerReasonAtMost: 5,
    onPlayEffects: [{ type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "ce-qui-suit-le-navire-abyssal",
    name: "Ce Qui Suit le Navire",
    type: "creature",
    variant: "abyssale",
    cost: 5,
    attack: 6,
    health: 6,
    maxCopies: 1,
    text:
      "Vous devez avoir exactement 5 Raison pour jouer cette carte. Après paiement de son coût, votre Raison tombe " +
      "donc à 0. À son arrivée, perdez 2 Ancrage.",
    requiresControllerReasonExactly: 5,
    onPlayEffects: [{ type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
  },
  {
    id: "treuil-a-chair",
    name: "Treuil à Chair",
    type: "equipement",
    permanent: true,
    cost: 3,
    health: 2,
    text: "Équipez une Créature. Elle gagne +2 Puissance. À chaque fin de votre tour où elle a attaqué, perdez 1 Raison.",
    equipTargetTypes: ["creature"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { attackAmount: 2 },
    // Bug corrigé au passage : `attachEquipment`/`equipTargetTypes` manquaient (l'Équipement ne s'attachait jamais).
    abilities: [
      {
        trigger: "endOfTurn",
        description: "À la fin de votre tour, si la Créature équipée a attaqué : perdez 1 Raison.",
        effects: [
          {
            type: "reasonLoss",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionEquippedUnitAttackedThisTurn: true,
          },
        ],
      },
    ],
  },
  {
    id: "lanterne-aux-verres-noirs",
    name: "Lanterne aux Verres Noirs",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text:
      "Équipez un Marin. À votre début de tour, vous pouvez perdre 1 Raison. Si vous le faites, choisissez : " +
      "réduisez de 1 tour la durée de la Marée actuelle ; ou inversez l'orientation de la Marée.",
    // Deux capacités facultatives d'un même `choiceGroup` : activer l'une
    // écarte l'autre pour le tour (une seule option, comme le texte).
    equipTargetTypes: ["marin"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "startOfTurn",
        mode: "optional",
        cost: { reason: 1 },
        choiceGroup: "lanterneChoix",
        // À 1 tour restant, la réduction ne ferait rien (plancher à 1) :
        // l'option ne se propose pas, la Raison n'est pas payée pour rien.
        condition: { tideRemainingTurnsAtLeast: 2 },
        description: "Vous pouvez dépenser 1 Raison : réduisez de 1 tour la durée de la Marée actuelle.",
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "startOfTurn",
        mode: "optional",
        cost: { reason: 1 },
        choiceGroup: "lanterneChoix",
        description: "Vous pouvez dépenser 1 Raison : inversez l'orientation de la prochaine transition de Marée.",
        effects: [{ type: "tideInvertOrientation", target: { kind: "allPlayers" } }],
      },
    ],
  },
  {
    id: "cage-de-flottaison",
    name: "Cage de Flottaison",
    type: "structure",
    cost: 3,
    maxCopies: 2,
    health: 5,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete"],
    // Rework du 21/09/2026 : vraie réponse anti-aggro. La restriction aux
    // Créatures saute (une attaque est une attaque), la réduction passe de 1
    // à 2, et la fenêtre perd Calme. `maxCopies` reste à 2 pendant le
    // prototype, comme demandé.
    text:
      "Durée : 4 tours. Visible pendant Houle et Tempête. La première fois à chaque tour que votre Navire devrait " +
      "subir des dégâts directs d'une attaque, réduisez ces dégâts de 2. Réaction cachée : lorsque votre Navire " +
      "devrait subir des dégâts directs d'une attaque, vous pouvez révéler Cage de Flottaison : réduisez ces " +
      "dégâts de 3. Sabordez ensuite Cage de Flottaison.",
    // La défense VISIBLE reste une réduction automatique : c'est une
    // réduction pure, jamais un désavantage, donc rien à décider.
    reduceDirectShipDamageOncePerTurn: { amount: 2 },
    abilities: [
      {
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true },
        description: "Révélez Cage de Flottaison : réduisez ces dégâts de 3, puis Sabordez-la.",
        effects: [
          { type: "reduceIncomingDamage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 3 } },
          { type: "saborde", target: { kind: "self" } },
        ],
      },
    ],
  },

  // ======================================================================
  // LOT 05 — Fondations, anti-Structure et recyclage
  // ======================================================================
  {
    id: "mousse-du-premier-quart",
    name: "Mousse du Premier Quart",
    type: "marin",
    cost: 1,
    attack: 1,
    health: 2,
    text: "À son arrivée, si votre Raison est inférieure à celle de l'adversaire, récupérez 1 Raison.",
    onPlayEffects: [
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionControllerReasonBelowOpponent: true,
      },
    ],
  },
  {
    // Renommée "Charpentier de Bord" → "Gabière du Grand Large" (Notion "Catalogue de cartes", Lot 05) — id
    // conservé (référencé par preconstructed.ts) ; perd son effet d'arrivée, devient une carte simple sans texte.
    id: "charpentier-de-bord",
    name: "Gabière du Grand Large",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 3,
    // Volontairement sans effet (cadrage Notion "Catalogue de cartes") : 2/3 pour coût 2 sert de référence de corps simple.
  },
  {
    id: "contremaitre-des-amarres",
    name: "Contremaître des Amarres",
    type: "marin",
    cost: 2,
    attack: 2,
    health: 3,
    text: "La première fois à chaque tour qu'une Structure adverse devient visible, elle perd 1 Résistance.",
    abilities: [
      {
        trigger: "onBecomeVisible",
        triggeredBy: { cardTypes: ["structure"], opponentOnly: true },
        oncePerTurnKey: "contremaitreVisible",
        description: "La première fois par tour qu'une Structure adverse devient visible : elle perd 1 Résistance.",
        effects: [{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "barracuda-des-hauts-fonds",
    name: "Barracuda des Hauts-Fonds",
    type: "creature",
    cost: 2,
    attack: 3,
    health: 2,
    text: "Lorsqu'il attaque une Structure, il gagne +1 Puissance pour ce combat.",
    bonusPowerVsTargetType: { type: "structure", amount: 1 },
  },
  {
    id: "bernard-lermite-dacier",
    name: "Bernard-l'Ermite d'Acier",
    type: "creature",
    cost: 1,
    attack: 1,
    health: 3,
    // Standard Verrier (30/09/2026, validé par le propriétaire) : « un piège
    // part, la troupe grandit ». Coût et statistiques inchangés.
    text:
      "Tant que vous contrôlez une Structure visible, il gagne +1 Résistance. La première fois à chaque tour qu'une " +
      "Structure que vous contrôlez est détruite ou Sabordée, il gagne +1 Puissance.",
    selfBuffWhileControllingVisibleStructure: { healthAmount: 1 },
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["structure"] },
        oncePerTurnKey: "bernardStructurePartie",
        description: "Une de vos Structures part : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "poisson-scie-gris",
    name: "Poisson-Scie Gris",
    type: "creature",
    cost: 3,
    attack: 3,
    health: 3,
    text: "Lorsqu'il inflige des dégâts à une Structure, infligez 1 dégât supplémentaire à cette Structure.",
    bonusDamageVsTargetType: { type: "structure", amount: 1 },
  },
  {
    id: "corde-de-remorquage",
    name: "Corde de Remorquage",
    type: "equipement",
    permanent: true,
    cost: 1,
    health: 1,
    tags: ["equipement"],
    equipTargetTypes: ["marin"],
    text: "Équipez un Marin. Lorsqu'il attaque une Structure, il gagne +1 Puissance.",
    // Bug corrigé au passage : l'Équipement ne s'attachait jamais (onPlayEffects absent), rendant
    // bonus ci-dessous inerte en pratique (jamais d'`attachedToInstanceId` à trouver).
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    // « +1 Puissance », pas « +1 dégât » : compté dans la Puissance déclarée.
    bonusPowerVsTargetType: { type: "structure", amount: 1 },
  },
  {
    id: "kit-de-calfatage",
    name: "Kit de Calfatage",
    type: "equipement",
    permanent: true,
    cost: 2,
    health: 2,
    text: "Équipez une Structure. À votre début de tour, si elle est visible, elle récupère 1 Résistance.",
    equipTargetTypes: ["structure"],
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "startOfTurn",
        description: "À votre début de tour, si la Structure équipée est visible : elle récupère 1 Résistance.",
        effects: [
          {
            type: "heal",
            target: { kind: "equippedUnit" },
            amount: { kind: "flat", value: 1 },
            conditionEquippedUnitVisible: true,
          },
        ],
      },
    ],
  },
  {
    id: "levier-de-lest",
    name: "Levier de Lest",
    type: "objet",
    cost: 1,
    text: "Brisez cet Objet et Sabordez une Structure que vous contrôlez : récupérez 1 Raison et 1 Ancrage.",
    // Le Sabordage est un COÛT du Bris : sans Structure à Saborder, le Bris
    // est refusé (`breakObject` exige une cible légale).
    onBreakEffects: [
      { type: "saborde", target: { kind: "chosenUnit", among: { cardTypes: ["structure"] } } },
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "grappin-de-recuperation",
    name: "Grappin de Récupération",
    type: "objet",
    cost: 2,
    text:
      "Brisez cet Objet : choisissez dans votre Cimetière une Structure ou un Équipement coûtant 2 ou moins. " +
      "Remettez cette carte dans votre main.",
    onBreakEffects: [
      {
        type: "moveGraveyardCardToHand",
        target: { kind: "controllerPlayer" },
        filter: { cardTypes: ["structure", "equipement"], maxCost: 2 },
      },
    ],
  },

  // ======================================================================
  // LOT 06 — Profondeurs, endurance et pression mentale
  // ======================================================================
  {
    // Id historique conservé (référencé par `public.cards`, collections et decks) : la carte a été renommée
    // "Seconde" pour la parité (Notion "Catalogue de cartes", Lot 06).
    id: "second-au-visage-pale",
    name: "Seconde au Visage Pâle",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 4,
    text:
      "Tant que vous êtes en Tempête ou Abysses, la première fois à chaque tour que vous devriez perdre de la " +
      "Raison, réduisez cette perte de 1.",
    reduceOwnReasonLossOncePerTurn: { amount: 1, tideStateIn: ["tempete", "abysses"] },
  },
  {
    id: "mecanicien-aux-mains-noires",
    name: "Mécanicien aux Mains Noires",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 3,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite, vous pouvez choisir une " +
      "autre Structure que vous contrôlez : elle gagne +1 Résistance.",
    // La cible est DÉSIGNÉE par le joueur, dans une fenêtre de réaction : le
    // moteur ne choisit jamais à sa place (décision du 17/09/2026).
    abilities: [
      {
        trigger: "onDeath",
        mode: "optional",
        triggeredBy: { cardTypes: ["structure"], destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "mecanicienRepare",
        description: "Quand une de vos Structures est détruite : une autre de vos Structures gagne +1 Résistance. Une fois par tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { cardTypes: ["structure"] } },
            healthAmount: { kind: "flat", value: 1 },
            permanent: true,
          },
        ],
      },
    ],
  },
  {
    id: "meduse-des-lanternes",
    name: "Méduse des Lanternes",
    type: "creature",
    cost: 2,
    attack: 2,
    health: 2,
    text: "Lorsqu'elle devient la seule Créature que vous contrôlez, récupérez 1 Raison.",
    // Photo du plateau avant/après chaque action (`processLoneCreatureChanges`) :
    // se déclenche dès qu'elle devient la seule Créature de son contrôleur.
    abilities: [
      {
        trigger: "onBecomeOnlyCreature",
        description: "Quand elle devient votre seule Créature en jeu : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "chaine-de-fer-noir",
    name: "Chaîne de Fer Noir",
    type: "equipement",
    permanent: true,
    cost: 3,
    health: 3,
    text: "Équipez une Créature. Elle gagne +1 Puissance et Garde. Si elle est détruite, perdez 1 Raison.",
    equipTargetTypes: ["creature"],
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { attackAmount: 1 },
    equipGrantsKeywords: ["garde"],
    controllerReasonLossOnOwnDestruction: 1,
  },
  {
    id: "carcasse-renversee",
    name: "Carcasse Renversée",
    type: "structure",
    cost: 3,
    maxCopies: 2,
    health: 5,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete", "abysses"],
    // Standard Verrier (30/09/2026, validé par le propriétaire) : la Forteresse
    // « encaisse, grandit, frappe ». Coût et statistiques inchangés.
    text:
      "Durée : 4 tours. Visible pendant Houle, Tempête et Abysses. Si elle est visible, la première fois à chaque " +
      "tour qu'une de vos unités survit à des dégâts, cette unité gagne +1 Puissance.",
    abilities: [
      {
        trigger: "onSurvivedDamage",
        triggeredBy: { cardTypes: ["marin", "creature"] },
        condition: { selfVisible: true },
        oncePerTurnKey: "carcasseRenversee",
        description: "Une de vos unités tient bon derrière la Carcasse : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "triggerSource" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 06) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "le-fond-vous-regarde",
    name: "Le Fond Vous Regarde",
    type: "anomalie",
    cost: 5,
    // Pas de Résistance (décision du 02/10/2026) : une Anomalie à durée reste en jeu le temps de sa durée,
    // puis part ; rien ne peut lui infliger de dégâts. Sans `health`, `hasResistance` la tient à l'écart de
    // l'arithmétique des dégâts, comme un Objet.
    maxCopies: 2,
    durationTurns: 2,
    text: "Pendant 2 tours, au début de chaque tour, le joueur actif choisit : perdre 1 Raison, ou infliger 1 dégât d'Ancrage à son propre Navire.",
    anomalyForceChoiceAtStartOfTurn: { reasonLossAmount: 1, anchorDamageAmount: 1, times: 2 },
  },
  {
    // Variante ABYSSALE distincte (coexiste avec la Standard ci-dessus) — anciennement seule entrée sous
    // l'id de base, maintenant scindée pour correspondre au catalogue verrouillé.
    id: "le-fond-vous-regarde-abyssal",
    name: "Le Fond Vous Regarde",
    type: "anomalie",
    variant: "abyssale",
    cost: 7,
    maxCopies: 1,
    durationTurns: 2,
    text: "Pendant 2 tours, au début de chaque tour, le joueur actif choisit : perdre 2 Raison, ou infliger 2 dégâts d'Ancrage à son propre Navire.",
    anomalyForceChoiceAtStartOfTurn: { reasonLossAmount: 2, anchorDamageAmount: 2, times: 2 },
  },

  // ======================================================================
  // LOT 07 — Manipulation de Marée
  // ======================================================================
  {
    id: "regulateur-de-courant",
    name: "Régulateur de Courant",
    type: "structure",
    subtype: "objet",
    cost: 2,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["calme", "houle", "tempete"],
    text:
      "Durée : 3 tours. Visible pendant Calme, Houle et Tempête. Sabordage : réduisez de 1 tour la durée " +
      "restante de la Marée actuelle. Si cette réduction la fait prendre fin, passez immédiatement à la Marée " +
      "suivante.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : réduisez de 1 tour la durée restante de la Marée actuelle ; si elle prend fin, passez immédiatement à la Marée suivante.",
        // Conçu pour contourner la règle "une durée ne descend jamais sous 1" (`advanceTideOnZero`).
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 }, advanceTideOnZero: true }],
      },
    ],
  },
  {
    id: "compas-aux-aiguilles-noires",
    name: "Compas aux Aiguilles Noires",
    type: "structure",
    subtype: "objet",
    cost: 3,
    maxCopies: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["houle", "tempete"],
    text:
      "Durée : 4 tours. Visible pendant Houle et Tempête. Sabordage : uniquement pendant Houle ou Tempête, " +
      "avancez immédiatement la Marée d'un état, puis perdez 1 Raison.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : uniquement pendant Houle ou Tempête, avancez immédiatement la Marée d'un état, puis perdez 1 Raison.",
        // « Uniquement pendant Houle ou Tempête » porte sur toute la
        // capacité : lue AVANT le premier effet (`condition.tideStateIn`).
        // Puis dans l'ordre du texte : l'avancée, PUIS la perte — qui se lit
        // donc dans la Marée d'arrivée (un bouclier actif en Tempête la réduit).
        condition: { tideStateIn: ["houle", "tempete"] },
        effects: [
          { type: "tideForceAdvance", target: { kind: "allPlayers" } },
          { type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "bouee-de-rappel",
    name: "Bouée de Rappel",
    type: "structure",
    subtype: "objet-flottant",
    cost: 3,
    maxCopies: 2,
    health: 3,
    durationTurns: 4,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 4 tours. Visible pendant Tempête et Abysses. Sabordage : reculez immédiatement la Marée d'un " +
      "état. La Marée ne peut pas reculer au-delà de Calme.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : reculez immédiatement la Marée d'un état (jamais au-delà de Calme).",
        effects: [{ type: "tideForceRetreat", target: { kind: "allPlayers" } }],
      },
    ],
  },
  {
    id: "horloge-de-maree",
    name: "Horloge de Marée",
    type: "structure",
    subtype: "objet",
    cost: 2,
    maxCopies: 2,
    health: 2,
    durationTurns: 3,
    text:
      "Durée : 3 tours. Visible pendant toutes les Marées. Sabordage : choisissez soit de réduire de 2 tours " +
      "la durée actuelle, soit de l'augmenter de 1 tour.",
    // Deux capacités automatiques d'un même `choiceGroup` : au Sabordage, le
    // moteur ouvre un choix (`GameState.pendingChoice`) et le joueur désigne
    // l'option qui se résout.
    abilities: [
      {
        trigger: "onSaborde",
        choiceGroup: "horlogeChoix",
        description: "Réduire de 2 tours la durée de la Marée actuelle",
        effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 2 } }],
      },
      {
        trigger: "onSaborde",
        choiceGroup: "horlogeChoix",
        description: "Augmenter d'1 tour la durée de la Marée actuelle",
        effects: [{ type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "sondeur-des-mauvaises-eaux",
    name: "Sondeur des Mauvaises Eaux",
    type: "marin",
    cost: 3,
    maxCopies: 2,
    attack: 2,
    health: 3,
    text: "Une fois par tour, vous pouvez perdre 1 Raison : réduisez de 1 tour la durée de la Marée actuelle.",
    activatableOncePerTurn: {
      cost: { reason: 1 },
      effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" } }],
    },
  },
  {
    // Version STANDARD (Notion "Catalogue de cartes", Lot 07) — coexiste avec la variante ABYSSALE ci-dessous.
    id: "cloche-du-grand-fond",
    name: "Cloche du Grand Fond",
    type: "structure",
    cost: 3,
    maxCopies: 2,
    health: 2,
    durationTurns: 3,
    visibleDuringTide: ["abysses"],
    text:
      "Durée : 3 tours. Visible pendant Abysses. À chaque entrée en Abysses, vous pouvez perdre 2 Raison. Si vous " +
      "le faites, augmentez de 1 tour la durée des Abysses.",
    abilities: [
      {
        trigger: "onTideStateEntered",
        condition: { tideState: "abysses" },
        mode: "optional",
        cost: { reason: 2 },
        description: "Vous pouvez dépenser 2 Raison : augmentez la durée des Abysses de 1 tour.",
        effects: [{ type: "tideExtendDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },

  // ======================================================================
  // LOT 08 — Grandes Anomalies de Marée
  // ======================================================================
  {
    // Ancienne Grande Anomalie devenue Créature (Notion "Catalogue de cartes", Lot 08, mise à jour du 13/09) :
    // reste coûteuse et dangereuse pour son propre contrôleur, mais occupe désormais un Slot en 3/5 une fois posée.
    id: "la-gueule-sous-la-mer",
    name: "La Gueule Sous la Mer",
    type: "creature",
    cost: 6,
    maxCopies: 1,
    attack: 3,
    health: 5,
    text:
      "Lorsqu'il est posé, forcez immédiatement la Marée en Abysses. Les états intermédiaires sont ignorés. Après " +
      "résolution, votre Navire perd 2 Ancrage. Jusqu'au début de votre prochain tour, vous ne pouvez pas récupérer " +
      "de Raison.",
    onPlayEffects: [
      { type: "tideForceJumpToAbysses", target: { kind: "allPlayers" } },
      { type: "damage", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
      { type: "lockReasonGainUntilNextTurn", target: { kind: "controllerPlayer" } },
    ],
  },
  {
    id: "sept-brasses-plus-bas",
    name: "Sept Brasses Plus Bas",
    type: "anomalie",
    // Résolution immédiate (onPlayEffects uniquement, aucune règle durable) : comme un Équipement consommable,
    // part directement au cimetière plutôt que d'occuper indéfiniment un Slot sans plus aucun effet (cf.
    // `isPermanentCard`).
    permanent: false,
    cost: 7,
    maxCopies: 1,
    text:
      "Forcez immédiatement la Marée en Abysses, puis augmentez de 1 tour sa durée restante. Chaque joueur perd " +
      "2 Raison. L'orientation devient Descendante après l'arrivée en Abysses.",
    onPlayEffects: [
      {
        type: "tideForceJumpToAbysses",
        target: { kind: "allPlayers" },
        amount: { kind: "flat", value: 1 },
        forceTideOrientation: "descendante",
      },
      { type: "reasonLoss", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 2 } },
    ],
  },

  // ======================================================================
  // LOT 09 — Références, clins d'œil & cartes fun
  // ======================================================================
  {
    id: "wood-vy",
    name: "Wood Vy",
    type: "marin",
    cost: 3,
    attack: 2,
    health: 4,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez perd de la Résistance, rendez-lui 1 " +
      "Résistance.",
    restoreResistanceOnAllyStructureLossOncePerTurn: 1,
  },
  {
    id: "carape-hus",
    name: "Carape Hus",
    type: "creature",
    cost: 3,
    attack: 2,
    health: 5,
    text: "Tant que la Marée est Calme, elle a Garde.",
    conditionalKeywords: [{ keyword: "garde", tideStateIn: ["calme"] }],
  },
  {
    id: "si-raie-ponce",
    name: "Si, Raie Ponce",
    type: "creature",
    cost: 4,
    attack: 3,
    health: 4,
    text:
      "À son arrivée, si la Marée est descendante, récupérez 2 Raison. Si elle est montante, l'adversaire perd " +
      "1 Raison.",
    onPlayEffects: [
      { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 }, conditionOrientationIs: "descendante" },
      { type: "reasonLoss", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 }, conditionOrientationIs: "montante" },
    ],
  },
  {
    id: "bat-marin",
    name: "Bat-Marin",
    type: "marin",
    cost: 3,
    attack: 3,
    health: 2,
    text:
      "Tant que la Marée est Tempête ou Abysses, il peut attaquer directement le Navire adverse même si un " +
      "permanent possède Garde.",
    bypassesGardeTideStateIn: ["tempete", "abysses"],
  },
  {
    // Corrigée : reprenait par erreur les mêmes stats/texte que la Standard (aucune plus-value réelle) —
    // le catalogue (Notion "Catalogue de cartes", Lot 09) distingue bien coût/stats et ajoute une clause.
    id: "bat-marin-abyssal",
    name: "Bat-Marin",
    type: "marin",
    variant: "abyssale",
    cost: 4,
    attack: 4,
    health: 3,
    text:
      "Tant que la Marée est Tempête ou Abysses, il peut attaquer directement le Navire adverse même si un " +
      "permanent possède Garde. Lorsqu'il inflige des dégâts directs pendant Abysses, l'adversaire perd aussi 1 Raison.",
    bypassesGardeTideStateIn: ["tempete", "abysses"],
    opponentReasonLossOnDirectAttack: { amount: 1, tideStateIn: ["abysses"] },
  },
  {
    id: "chope",
    name: "Choppe !",
    type: "objet",
    cost: 1,
    text:
      "Si la Marée est Calme, coûte 0 Raison. Brisez cet Objet : récupérez 2 Raison. Cet effet ne peut être " +
      "activé que pendant Calme.",
    costOverrideWhenTideStateIn: { tideStateIn: ["calme"], cost: 0 },
    requiresTideStateForBreak: ["calme"],
    onBreakEffects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
  },

  // ======================================================================
  // LOT 10 — Cra-Poiscail (Booster 1)
  // ======================================================================
  // Catalogue Notion "Lot 10 — paramètres d'équilibrage retenus"
  // (2026-09-14), qui fait foi sur les coûts, stats, raretés, limites de
  // deck et répartition en boosters. Les trois boosters de la famille et
  // les variantes Abyssales sont intégrés (sections ci-dessous) : les
  // primitives qui leur manquaient existent — déclencheurs d'observateur
  // (`triggeredBy`), Équipements restreints à un archétype
  // (`equipTargetArchetype`) et auras nommées (`auraBuffCardIds`).
  //
  // `setCode` les tient hors des boosters existants (cf. `CardDefinition`) :
  // le plan de diffusion veut aucun Cra-Poiscail dans le Bienvenue, et une
  // arrivée progressive en trois boosters dédiés.
  {
    id: "tetard-fesse",
    name: "Têtard-Fesse",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 1,
    attack: 1,
    health: 1,
    // Standard Verrier (01/10/2026, validé par le propriétaire) : le banc
    // grossit — sa perte relance une arrivée. Coût et statistiques inchangés.
    text: "Quand il est détruit, invoquez 1 Péon Cra-Poiscail 1 / 1.",
    abilities: [
      {
        trigger: "onDeath",
        // « Quand il est DÉTRUIT » : un Sabordage n'en est pas un.
        condition: { destroyedBy: ["combat", "effect", "tide"] },
        description: "Détruit : invoquez 1 Péon Cra-Poiscail.",
        effects: [{ type: "summon", target: { kind: "controllerPlayer" }, cardId: "peon-cra-poiscail" }],
      },
    ],
  },
  {
    id: "ptite-fesse",
    name: "P'tite Fesse",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 1,
    attack: 1,
    health: 2,
  },
  {
    id: "cra-poiscail-grand-gueule",
    name: "Cra-Poiscail Grand-Gueule",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 2,
    attack: 3,
    health: 1,
  },
  {
    id: "cra-poiscail-sauteur",
    name: "Cra-Poiscail Sauteur",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 2,
    attack: 1,
    health: 1,
    text: "À son arrivée, si vous contrôlez déjà une autre unité Cra-Poiscail, invoquez 1 Péon Cra-Poiscail 1 / 1.",
    onPlayEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        // "un AUTRE Cra-Poiscail" : le Sauteur est déjà sur le plateau quand
        // son effet d'arrivée se résout, il ne doit pas se compter lui-même.
        conditionControlledArchetypeAtLeast: { archetype: "cra-poiscail", count: 1, excludeSelf: true },
      },
    ],
  },
  {
    id: "banc-de-cra-poiscail",
    name: "Banc de Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 3,
    attack: 2,
    health: 3,
    text: "Tant que vous contrôlez au moins 3 autres unités Cra-Poiscail, il gagne +1 Puissance.",
    selfBuffWhileControllingArchetype: {
      archetype: "cra-poiscail",
      atLeast: 3,
      excludeSelf: true,
      attackAmount: 1,
    },
  },
  {
    id: "le-seau",
    name: "Le Seau",
    type: "objet",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 2,
    // Le catalogue laisse la Résistance vide pour les Objets, mais un
    // permanent à 0 meurt dès le `processDeaths` qui suit sa pose (0 dégât
    // marqué >= 0 Résistance) : il ne pourrait jamais être Brisé plus tard.
    // 1, comme tous les autres Objets du set (Thermos, Choppe !, Levier de
    // Lest, Grappin, Cartes des Courants).
    text:
      "Brisez cet Objet : invoquez 1 Péon Cra-Poiscail 1 / 1. S'il a été Brisé directement depuis votre main et que " +
      "vous contrôlez déjà une unité Cra-Poiscail, invoquez-en 2 à la place.",
    // ORDRE IMPORTANT : le Péon supplémentaire est évalué AVANT l'invocation
    // de base. Dans l'autre sens, le Péon que la base vient de créer
    // satisferait lui-même la condition "vous contrôlez déjà un
    // Cra-Poiscail" et la carte invoquerait toujours 2 corps.
    onBreakEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        conditionBrokenFromHand: true,
        conditionControlledArchetypeAtLeast: { archetype: "cra-poiscail", count: 1 },
      },
      { type: "summon", target: { kind: "controllerPlayer" }, cardId: "peon-cra-poiscail" },
    ],
  },
  {
    id: "la-flaque-sacree",
    name: "La Flaque Sacrée",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    cost: 2,
    health: 3,
    durationTurns: 3,
    text:
      "Durée : 3 tours. La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez arrive en " +
      "jeu, cette unité gagne +1 Résistance jusqu'à votre prochain tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        // Elle-même est un Cra-Poiscail, mais une Structure n'"arrive" pas
        // pour se renforcer elle-même : `excludeSelf` par défaut suffit.
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "flaqueAllyEnter",
        description: "Un Cra-Poiscail arrive : il gagne +1 Résistance.",
        effects: [
          {
            type: "buff",
            target: { kind: "triggerSource" },
            healthAmount: { kind: "flat", value: 1 },
            duration: "untilYourNextTurn",
          },
        ],
      },
    ],
  },
  {
    id: "fesses-en-avant",
    name: "Fesses en Avant !",
    type: "anomalie",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_1,
    // Résolution immédiate : part au cimetière sans occuper durablement un
    // Slot (même traitement que les Grandes Anomalies du Lot 08).
    permanent: false,
    cost: 3,
    text: "Invoquez 2 Péons Cra-Poiscail 1 / 1. Ils gagnent Pied marin jusqu'à la fin du tour.",
    onPlayEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        count: 2,
        // "Pied marin" sur un corps qui vient d'arriver revient exactement
        // à le priver de son mal d'invocation.
        rush: true,
      },
    ],
  },

  // ======================================================================
  // LOT 10 — Cra-Poiscail (Booster 2)
  // ======================================================================
  // "Ouvre les variantes Bris / Marée / value" (Notion, Répartition
  // Booster du Lot 10).
  {
    id: "cra-poiscail-bavard",
    name: "Cra-Poiscail Bavard",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    attack: 1,
    health: 3,
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez arrive en jeu, cette unité " +
      "gagne +1 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "bavardAllyEnter",
        description: "Un autre Cra-Poiscail arrive : il gagne +1 Puissance jusqu'à la fin du tour.",
        // "il gagne" = le Cra-Poiscail QUI ARRIVE, pas le Bavard — même
        // lecture que La Flaque Sacrée, dont le texte a la même forme.
        // Le mot "celui-ci" lève l'ambiguïté sur la carte imprimée.
        effects: [{ type: "buff", target: { kind: "triggerSource" }, attackAmount: { kind: "flat", value: 1 }, permanent: false }],
      },
    ],
  },
  {
    id: "cra-poiscail-chef-de-banc",
    name: "Cra-Poiscail Chef de Banc",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 3,
    attack: 2,
    health: 3,
    // Standard Verrier (01/10/2026, validé par le propriétaire) : le banc
    // grossit — le gain est conservé. Le texte nomme désormais l'arrivante,
    // que le code renforçait déjà (l'ancien texte nommait le Chef lui-même).
    // Coût et statistiques inchangés.
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez arrive en jeu, " +
      "elle gagne +1 / +1.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "chefDeBancAllyEnter",
        description: "Un autre Cra-Poiscail arrive : il gagne +1 / +1, conservé.",
        effects: [
          {
            type: "buff",
            // Comme le Bavard : c'est l'arrivant qui est renforcé.
            target: { kind: "triggerSource" },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
            permanent: true,
          },
        ],
      },
    ],
  },
  {
    id: "cra-poiscail-ramasseur",
    name: "Cra-Poiscail Ramasseur",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    attack: 2,
    health: 2,
    // Standard Verrier (01/10/2026, validé par le propriétaire) : le banc
    // grossit — le gain est conservé. Coût et statistiques inchangés.
    text: "La première fois à chaque tour que vous Brisez un Objet, il gagne +1 / +1.",
    abilities: [
      {
        trigger: "onObjectBroken",
        // Filtre vide : n'importe quel Objet, du moment que c'est SON
        // contrôleur qui le brise (`sameController` par défaut).
        triggeredBy: {},
        oncePerTurnKey: "ramasseurObjectBroken",
        description: "Vous Brisez un Objet : +1 / +1, conservé.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
            permanent: true,
          },
        ],
      },
    ],
  },
  {
    id: "cra-poiscail-des-bas-fonds",
    name: "Cra-Poiscail des Bas-Fonds",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    attack: 2,
    health: 2,
    text: "Tant que la Marée est descendante, il gagne +1 Puissance.",
    selfBuffWhileTideOrientation: { orientation: "descendante", attackAmount: 1 },
  },
  {
    id: "cra-poiscail-des-hautes-eaux",
    name: "Cra-Poiscail des Hautes-Eaux",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    attack: 1,
    health: 3,
    text: "Tant que la Marée est montante, il gagne +1 Puissance.",
    selfBuffWhileTideOrientation: { orientation: "montante", attackAmount: 1 },
  },
  {
    id: "slip-de-guerre-cra-poiscail",
    name: "Slip de Guerre Cra-Poiscail",
    type: "equipement",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    permanent: true,
    cost: 2,
    health: 2,
    equipTargetArchetype: "cra-poiscail",
    text:
      "Équipez une unité Cra-Poiscail. Il gagne +1 Résistance. La première fois à chaque tour qu'une autre unité " +
      "Cra-Poiscail que vous contrôlez arrive en jeu, le porteur gagne +1 Puissance jusqu'à la fin du tour.",
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { healthAmount: 1 },
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "slipAllyEnter",
        description: "Un autre Cra-Poiscail arrive : le porteur gagne +1 Puissance jusqu'à la fin du tour.",
        effects: [{ type: "buff", target: { kind: "equippedUnit" }, attackAmount: { kind: "flat", value: 1 }, permanent: false }],
      },
    ],
  },
  {
    id: "casque-coquille",
    name: "Casque-Coquille",
    type: "equipement",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    permanent: true,
    cost: 2,
    health: 1,
    equipTargetArchetype: "cra-poiscail",
    text:
      "Équipez une unité Cra-Poiscail. Il gagne +1 Résistance. La première fois qu'il devrait subir des dégâts d'un " +
      "effet, réduisez ces dégâts de 1 puis détruisez cet Équipement.",
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { healthAmount: 1 },
    // "Dégâts d'un effet" = la Marée et le texte d'une carte, jamais le
    // combat (arbitrage du 2026-09-14). Le +1 Résistance étant une aura
    // (`equipGrantsBuff`), le porteur le PERD avec la destruction du Casque,
    // comme pour tout Équipement qui quitte le plateau.
    reduceEquippedEffectDamageThenDestroy: 1,
  },
  {
    id: "le-tas-de-trucs",
    name: "Le Tas de Trucs",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 2,
    health: 3,
    text:
      "La première fois à chaque tour que vous Brisez un Objet, vous pouvez choisir une unité Cra-Poiscail que vous " +
      "contrôlez : elle gagne +1 / +1 jusqu'à la fin du tour.",
    // "Choisissez" passe par une fenêtre de réaction (`mode: "optional"`),
    // seul mécanisme du moteur qui laisse le joueur DÉSIGNER sa cible.
    // Écart assumé (arbitrage du 2026-09-14) : l'effet devient refusable,
    // ce que le design accepte — « si on peut choisir quelque chose on le
    // fait, et faut nous laisser cibler ». La fenêtre ne s'ouvre de toute
    // façon que s'il existe un Cra-Poiscail à renforcer.
    abilities: [
      {
        trigger: "onObjectBroken",
        // Filtre vide, comme le Cra-Poiscail Ramasseur : n'importe quel
        // Objet, du moment que c'est SON contrôleur qui le brise
        // (`sameController` par défaut). L'Objet brisé a déjà quitté le
        // plateau quand l'événement part : seul ce chemin d'observateur
        // voit le Bris.
        triggeredBy: {},
        mode: "optional",
        oncePerTurnKey: "tasDeTrucsBreak",
        description: "Choisissez un Cra-Poiscail : il gagne +1 / +1 jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { archetype: "cra-poiscail" } },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "le-trone-de-bouchon",
    name: "Le Trône de Bouchon",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 3,
    health: 4,
    maxCopies: 2,
    text: "Tant que vous contrôlez au moins 3 unités Cra-Poiscail, vos unités Cra-Poiscail gagnent +1 Puissance.",
    auraBuffOtherArchetypeUnits: { archetype: "cra-poiscail", attackAmount: 1, requiresArchetypeCountAtLeast: 3 },
  },
  {
    id: "la-grande-migration",
    name: "La Grande Migration",
    type: "anomalie",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_2,
    cost: 4,
    // Pas de Résistance, comme toute Anomalie (cf. « Le Fond Vous Regarde »).
    maxCopies: 2,
    durationTurns: 2,
    text:
      "Pendant 2 tours, la première fois à chaque tour qu'une unité Cra-Poiscail que vous contrôlez est détruite, " +
      "invoquez 1 Péon Cra-Poiscail 1 / 1.",
    // « une UNITÉ Cra-Poiscail » : une Structure, un Équipement ou un Objet
    // de la famille qui part ne compte pas — et l'Anomalie elle-même non
    // plus (ce n'est pas une unité, et elle a déjà quitté le plateau quand
    // les observateurs sont balayés).
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"], destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "grandeMigrationAllyDeath",
        description: "Un de vos Cra-Poiscail est détruit : invoquez 1 Péon Cra-Poiscail.",
        effects: [{ type: "summon", target: { kind: "controllerPlayer" }, cardId: "peon-cra-poiscail" }],
      },
    ],
  },

  // ======================================================================
  // LOT 10 — Cra-Poiscail (Booster 3) + variantes Abyssales
  // ======================================================================
  // Branche pseudo-médiévale (Chevalier / Destrier / Bourreau) et finishers.
  {
    id: "ecuyer-cra-poiscail",
    name: "Écuyer Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 2,
    attack: 1,
    health: 3,
    text: "Votre Chevalier Cra-Poiscail gagne +1 Résistance tant que l'Écuyer est en jeu.",
    auraBuffCardIds: { cardIds: ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal"], healthAmount: 1 },
  },
  {
    id: "chevalier-cra-poiscail",
    name: "Chevalier Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    attack: 3,
    health: 3,
    maxCopies: 2,
    text: "Tant que vous contrôlez un Destrier du Grand Étang, il gagne +1 Puissance et Garde.",
    selfBuffWhileControllingCardIds: { cardIds: ["destrier-du-grand-etang"], attackAmount: 1 },
    conditionalKeywords: [{ keyword: "garde", controllingCardIds: ["destrier-du-grand-etang"] }],
  },
  {
    id: "destrier-du-grand-etang",
    name: "Destrier du Grand Étang",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 2,
    attack: 2,
    health: 3,
    text: "Tant qu'il est en jeu, votre Chevalier Cra-Poiscail gagne +1 Résistance.",
    auraBuffCardIds: { cardIds: ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal"], healthAmount: 1 },
  },
  {
    id: "bourreau-cra-poiscail",
    name: "Bourreau Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    attack: 3,
    health: 2,
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez est détruite, il gagne +1 " +
      "Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"], destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "bourreauAllyDeath",
        description: "Un autre Cra-Poiscail est détruit : +1 Puissance jusqu'à la fin du tour.",
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, permanent: false }],
      },
    ],
  },
  {
    id: "cra-poiscail-porte-etendard",
    name: "Cra-Poiscail Porte-Étendard",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    attack: 1,
    health: 4,
    maxCopies: 2,
    text: "Vos autres unités Cra-Poiscail gagnent +1 Puissance.",
    auraBuffOtherArchetypeUnits: { archetype: "cra-poiscail", attackAmount: 1 },
  },
  {
    id: "roi-cra-poiscail",
    name: "Roi Cra-Poiscail",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 5,
    attack: 4,
    health: 5,
    maxCopies: 1,
    text:
      "À son arrivée, si vous contrôlez déjà au moins 2 autres unités Cra-Poiscail, invoquez 2 Péons Cra-Poiscail 1 " +
      "/ 1. Vos autres unités Cra-Poiscail gagnent +1 Puissance.",
    onPlayEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        count: 2,
        conditionControlledArchetypeAtLeast: { archetype: "cra-poiscail", count: 2, excludeSelf: true },
      },
    ],
    auraBuffOtherArchetypeUnits: { archetype: "cra-poiscail", attackAmount: 1 },
  },
  {
    id: "ptite-fesse-grand-reve",
    name: "P'tite Fesse, Grand Rêve",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 2,
    attack: 1,
    health: 2,
    maxCopies: 2,
    // Standard Verrier (01/10/2026, validé par le propriétaire) : le banc
    // grossit — le gain est conservé. Coût et statistiques inchangés.
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez gagne de la Puissance, " +
      "P'tite Fesse, Grand Rêve gagne +1 Puissance.",
    abilities: [
      {
        trigger: "onPowerGained",
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "grandReveAllyPowerGain",
        description: "Un autre Cra-Poiscail gagne de la Puissance : +1 Puissance, conservée.",
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, permanent: true }],
      },
    ],
  },
  {
    id: "fourchette-du-grand-etang",
    name: "Fourchette du Grand Étang",
    type: "equipement",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    permanent: true,
    cost: 2,
    health: 2,
    equipTargetArchetype: "cra-poiscail",
    text:
      "Équipez une unité Cra-Poiscail. Il gagne +1 Puissance. La première fois à chaque tour qu'il attaque, vous " +
      "pouvez choisir une autre unité Cra-Poiscail que vous contrôlez : elle gagne +1 Puissance jusqu'à la fin du " +
      "tour.",
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { attackAmount: 1 },
    // « un autre Cra-Poiscail » est DÉSIGNÉ par le joueur, en fenêtre de
    // réaction (décision du 17/09/2026 : le moteur ne choisit jamais une
    // cible à sa place, et le joueur peut refuser). `equippedUnit` fait
    // suivre le porteur : c'est LUI qui attaque, et c'est lui que « un
    // autre » exclut, avec l'Équipement lui-même.
    abilities: [
      {
        trigger: "onAttack",
        mode: "optional",
        triggeredBy: { equippedUnit: true },
        oncePerTurnKey: "fourchetteBearerAttack",
        description: "Un autre Cra-Poiscail gagne +1 Puissance jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { archetype: "cra-poiscail", excludeSource: true } },
            attackAmount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "banniere-en-vieille-chaussette",
    name: "Bannière en Vieille Chaussette",
    type: "equipement",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    permanent: true,
    cost: 3,
    health: 2,
    maxCopies: 2,
    equipTargetArchetype: "cra-poiscail",
    text:
      "Équipez une unité Cra-Poiscail. Il gagne +1 Résistance. La première fois à chaque tour que vous invoquez une " +
      "unité Cra-Poiscail, cette unité gagne +1 Puissance jusqu'à la fin du tour.",
    onPlayEffects: [
      { type: "attachEquipment", target: { kind: "chosenUnit" } },
    ],
    // Aura, pas un modificateur posé : le bonus disparaît avec l'Équipement.
    equipGrantsBuff: { healthAmount: 1 },
    abilities: [
      {
        trigger: "onEnterPlay",
        // "que vous INVOQUEZ" : une carte posée depuis la main ne compte pas.
        triggeredBy: { archetype: "cra-poiscail", onlySummoned: true, cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "banniereSummon",
        description: "Vous invoquez un Cra-Poiscail : il gagne +1 Puissance jusqu'à la fin du tour.",
        effects: [{ type: "buff", target: { kind: "triggerSource" }, attackAmount: { kind: "flat", value: 1 }, permanent: false }],
      },
    ],
  },
  {
    id: "la-quete-du-grand-nenuphar",
    name: "La Quête du Grand Nénuphar",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    health: 4,
    maxCopies: 2,
    durationTurns: 4,
    text:
      "Durée : 4 tours. La première fois à chaque tour que votre Chevalier Cra-Poiscail attaque alors que vous " +
      "contrôlez un Destrier du Grand Étang, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onAttack",
        triggeredBy: { cardIds: ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal"] },
        oncePerTurnKey: "queteChevalierAttack",
        // Condition AU NIVEAU de la capacité : une attaque sans Destrier ne
        // doit pas consommer le « une fois par tour ».
        condition: { controlsAnyCardIds: ["destrier-du-grand-etang"] },
        description: "Votre Chevalier attaque avec son Destrier : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "le-grand-saut",
    name: "Le Grand Saut",
    type: "anomalie",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    permanent: false,
    cost: 5,
    maxCopies: 1,
    text: "Invoquez 3 Péons Cra-Poiscail 1 / 1. Ils gagnent +1 Puissance et Pied marin jusqu'à la fin du tour.",
    onPlayEffects: [
      {
        type: "summon",
        target: { kind: "controllerPlayer" },
        cardId: "peon-cra-poiscail",
        count: 3,
        rush: true,
        summonBuff: { attackAmount: 1 },
      },
    ],
  },
  {
    id: "le-tournoi-du-grand-etang",
    name: "Le Tournoi du Grand Étang",
    type: "anomalie",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    permanent: false,
    cost: 4,
    maxCopies: 2,
    text:
      "Jusqu'à la fin du tour, vos Chevalier Cra-Poiscail, Destrier du Grand Étang et Bourreau Cra-Poiscail " +
      "gagnent +1 / +1. Si vous contrôlez les trois à la résolution, piochez 1 carte.",
    onPlayEffects: [
      {
        type: "buff",
        target: {
          kind: "allyUnitsWithCardIds",
          cardIds: ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal", "destrier-du-grand-etang", "bourreau-cra-poiscail"],
        },
        attackAmount: { kind: "flat", value: 1 },
        healthAmount: { kind: "flat", value: 1 },
        permanent: false,
      },
      {
        type: "draw",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        // « les trois » : le Chevalier peut être l'une ou l'autre version.
        conditionControlsAllCardIds: [
          ["chevalier-cra-poiscail", "chevalier-cra-poiscail-abyssal"],
          "destrier-du-grand-etang",
          "bourreau-cra-poiscail",
        ],
      },
    ],
  },
  {
    id: "roi-cra-poiscail-abyssal",
    name: "Roi Cra-Poiscail",
    type: "creature",
    variant: "abyssale",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 6,
    attack: 5,
    health: 7,
    maxCopies: 1,
    text:
      "À son arrivée, invoquez 2 Péons Cra-Poiscail 1 / 1. Vos autres unités Cra-Poiscail gagnent +1 / +1. La " +
      "première fois à chaque tour qu'une unité Péon Cra-Poiscail arrive en jeu sous votre contrôle, vous perdez 1 " +
      "Raison.",
    onPlayEffects: [
      { type: "summon", target: { kind: "controllerPlayer" }, cardId: "peon-cra-poiscail", count: 2 },
    ],
    auraBuffOtherArchetypeUnits: { archetype: "cra-poiscail", attackAmount: 1, healthAmount: 1 },
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { cardIds: ["peon-cra-poiscail"] },
        oncePerTurnKey: "roiAbyssalPeonEnter",
        description: "Un Péon arrive sous votre contrôle : vous perdez 1 Raison.",
        effects: [{ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "ptite-fesse-grand-reve-abyssal",
    name: "P'tite Fesse, Grand Rêve",
    type: "creature",
    variant: "abyssale",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 3,
    attack: 2,
    health: 3,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez gagne de la Puissance, " +
      "P'tite Fesse, Grand Rêve gagne +2 Puissance et Pied marin jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onPowerGained",
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "grandReveAbyssalAllyPowerGain",
        description: "Un autre Cra-Poiscail gagne de la Puissance : +2 Puissance et Pied marin jusqu'à la fin du tour.",
        // Pied marin = peut attaquer dès le tour de son arrivée (`KEYWORD_PIED_MARIN`).
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 2 }, grantKeywords: ["pied-marin"] }],
      },
    ],
  },
  {
    id: "chevalier-cra-poiscail-abyssal",
    name: "Chevalier Cra-Poiscail",
    type: "creature",
    variant: "abyssale",
    archetype: "cra-poiscail",
    setCode: CRA_POISCAIL_BOOSTER_3,
    cost: 4,
    attack: 4,
    health: 5,
    maxCopies: 1,
    text:
      "Tant que vous contrôlez un Destrier du Grand Étang, il gagne Garde et +1 Puissance. La première fois à " +
      "chaque tour qu'il attaque, vous pouvez choisir une autre unité Cra-Poiscail que vous contrôlez : elle gagne " +
      "+1 / +1 jusqu'à la fin du tour.",
    selfBuffWhileControllingCardIds: { cardIds: ["destrier-du-grand-etang"], attackAmount: 1 },
    conditionalKeywords: [{ keyword: "garde", controllingCardIds: ["destrier-du-grand-etang"] }],
    // Seconde phrase : même règle que la Fourchette du Grand Étang — la
    // cible est désignée par le joueur en fenêtre de réaction. Déclencheur
    // PERSONNEL ici : c'est le Chevalier lui-même qui attaque, et
    // `excludeSource` l'écarte de ses propres cibles.
    abilities: [
      {
        trigger: "onAttack",
        mode: "optional",
        oncePerTurnKey: "chevalierAbyssalAttack",
        description: "Un autre Cra-Poiscail gagne +1 / +1 jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { archetype: "cra-poiscail", excludeSource: true } },
            attackAmount: { kind: "flat", value: 1 },
            healthAmount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  // ======================================================================
  // LOT 11 — LES MASQUES NOYÉS / THÉÂTRE ENGLOUTI
  // ======================================================================
  // Source : Notion « Lot 11 — Les Masques Noyés / Théâtre Englouti »,
  // passe d'équilibrage du 15 septembre 2026.
  //
  // Mini-archétype de SOUS-TYPE, pas d'`archetype` au sens
  // `game/cards/archetypes.ts` : la troupe se reconnaît au sous-type
  // `MARIONNETTE`, et les effets de dénombrement d'archétype (seuils
  // Cra-Poiscail) ne doivent pas s'y appliquer.
  //
  // Boucle : jouer une Marionnette → profiter de son arrivée → la renvoyer
  // en main → la rejouer. Toutes les répétitions, réductions et
  // remboursements sont limités à la première fois par tour ; aucune
  // réduction ne descend sous 1 Raison (plancher tenu par
  // `MIN_DISCOUNTED_COST`, cf. `game/actions/playCard.ts`).
  {
    id: "pulcinella-gonfle",
    name: "Pulcinella Gonflé",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    attack: 2,
    health: 3,
    maxCopies: 3,
    // Test Verrier (30/09/2026) : l'effet joue AUSSI à l'arrivée. Mort
    // seulement, Pulcinella n'avait rien à offrir au rappel du Théâtre —
    // le rejouer ne rapportait rien. Mesuré sur 60 parties : Δ +16, le
    // Théâtre de 39 % à 44 %. Validé par le propriétaire le 30/09/2026.
    text: "À son arrivée et quand il est détruit, vous pouvez choisir une Créature adverse : infligez-lui 1 dégât.",
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "À son arrivée : 1 dégât à une créature ennemie.",
        effects: [
          {
            type: "damage",
            target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["creature"] } },
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
      {
        trigger: "onDeath",
        // « Quand il est DÉTRUIT » : un Sabordage n'en est pas un.
        condition: { destroyedBy: ["combat", "effect", "tide"] },
        mode: "optional",
        description: "Détruit : 1 dégât à une créature ennemie.",
        // La cible est désignée par le joueur, depuis le cimetière : Pulcinella
        // est déjà mort quand la fenêtre s'ouvre.
        effects: [
          {
            type: "damage",
            target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["creature"] } },
            amount: { kind: "flat", value: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "arlecchino-des-profondeurs",
    name: "Arlecchino des Profondeurs",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    attack: 2,
    health: 2,
    maxCopies: 3,
    text:
      "À son arrivée, vous pouvez renvoyer une autre unité Marionnette que vous contrôlez dans votre main. Si vous " +
      "le faites, il gagne +2 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Renvoyez une autre Marionnette alliée en main : il gagne +2 Puissance jusqu'à la fin du tour.",
        effects: [
          { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, unitsOnly: true, excludeSource: true } } },
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 2 }, permanent: false },
        ],
      },
    ],
  },
  {
    id: "le-masque-fendu",
    name: "Le Masque Fendu",
    type: "objet",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    maxCopies: 3,
    text:
      "Brisez cet Objet : renvoyez une unité Marionnette que vous contrôlez dans votre main, puis piochez 1 carte " +
      "et défaussez 1 carte.",
    onBreakEffects: [
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, unitsOnly: true } } },
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "colombina-aux-cent-visages",
    name: "Colombina aux Cent Visages",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 3,
    attack: 3,
    health: 3,
    maxCopies: 2,
    text:
      "À son arrivée, choisissez une autre unité Marionnette que vous contrôlez : répétez son effet d'arrivée. Une " +
      "seule fois par tour.",
    // « Choisissez » : c'est le joueur qui désigne la Marionnette, via la
    // fenêtre de réaction. La répétition rallume l'arrivée de la cible
    // (`ENTER_EFFECTS_REPEATED`) : ses capacités automatiques se résolvent,
    // ses capacités facultatives (Il Dottore, Arlecchino) se reproposent.
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        oncePerTurnKey: "colombinaRepeat",
        description: "Répète l'effet d'arrivée d'une autre Marionnette alliée.",
        effects: [
          { type: "repeatEnterEffects", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, unitsOnly: true, excludeSource: true } } },
        ],
      },
    ],
  },
  {
    id: "pantalone-sans-sou",
    name: "Pantalone Sans-Sou",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 3,
    text: "La première fois à chaque tour que vous Brisez un Objet directement depuis votre main, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onObjectBroken",
        // Observateur : l'événement vise l'Objet brisé, jamais Pantalone —
        // sans ce filtre la capacité n'est collectée par aucun circuit.
        // `fromHand` est sur le FILTRE et pas seulement sur l'effet : un Bris
        // depuis le PLATEAU ne doit pas réveiller la capacité, sinon il
        // consomme le « une fois par tour » sans rien rendre, et le Bris
        // depuis la main qui suit dans le même tour ne rembourse plus rien.
        triggeredBy: { fromHand: true },
        oncePerTurnKey: "pantaloneHandBreak",
        description: "Premier Bris depuis la main du tour : récupérez 1 Raison.",
        // Le remboursement ne vaut QUE pour un Bris depuis la main : sinon
        // les Objets déjà posés sur le board deviendraient gratuits.
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, conditionBrokenFromHand: true }],
      },
    ],
  },
  {
    id: "il-capitano-naufrage",
    name: "Il Capitano Naufragé",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 4,
    attack: 6,
    health: 6,
    maxCopies: 2,
    text: "La première fois qu'il subit des dégâts de combat, il perd 3 Puissance et 2 Résistance.",
    abilities: [
      {
        trigger: "onDamaged",
        oncePerTurnKey: "capitanoDeflated",
        onceEver: true,
        description: "Première blessure : -3 Puissance et -2 Résistance, définitivement.",
        // Volontairement sur-staté avant sa première blessure ; après
        // déclenchement il devient 3 / 4, cohérent avec son fanfaron.
        effects: [
          {
            type: "debuff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 3 },
            healthAmount: { kind: "flat", value: 2 },
            permanent: true,
          },
        ],
      },
    ],
  },
  {
    id: "il-dottore-des-noyes",
    name: "Il Dottore des Noyés",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 2,
    text:
      "À son arrivée, choisissez : une unité que vous contrôlez gagne +2 / +2 jusqu'à votre prochain tour ; ou une " +
      "unité adverse perd 2 Puissance et 2 Résistance jusqu'à votre prochain tour.",
    // Les DEUX modes sont deux capacités facultatives distinctes, proposées
    // ensemble dans la fenêtre de réaction ; elles forment un groupe de
    // choix : en activer une écarte l'autre (`choiceGroup`, pas une clé
    // « une fois par tour » — Colombina doit pouvoir rejouer le choix dans
    // le même tour). Chaque cible est filtrée par son camp — sans quoi le
    // « +2 / +2 » se posait sur une créature ENNEMIE (constaté le 2026-09-16).
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        choiceGroup: "dottoreArrival",
        description: "Une créature alliée gagne +2 / +2 jusqu'à votre prochain tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { unitsOnly: true } },
            attackAmount: { kind: "flat", value: 2 },
            healthAmount: { kind: "flat", value: 2 },
            duration: "untilYourNextTurn",
          },
        ],
      },
      {
        trigger: "onEnterPlay",
        mode: "optional",
        choiceGroup: "dottoreArrival",
        description: "Une créature ennemie perd 2 / 2 jusqu'à votre prochain tour.",
        effects: [
          {
            type: "debuff",
            target: { kind: "chosenUnit", among: { unitsOnly: true, opponentOnly: true } },
            // Un `debuff` RETIRE ses montants : 2 et 2, pas -2 et -2.
            attackAmount: { kind: "flat", value: 2 },
            healthAmount: { kind: "flat", value: 2 },
            duration: "untilYourNextTurn",
            // « jusqu'à VOTRE prochain tour » : celui du lanceur, pas celui
            // du propriétaire de l'unité visée — sans quoi le malus tombait
            // dès l'entame du tour adverse.
            expiresOnControllersTurn: true,
          },
        ],
      },
    ],
  },
  {
    id: "le-regisseur-sans-visage",
    name: "Le Régisseur Sans Visage",
    type: "creature",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 5,
    attack: 4,
    health: 6,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre unité Marionnette que vous contrôlez arrive en jeu, vous pouvez " +
      "renvoyer une autre unité Marionnette que vous contrôlez de coût 2 ou moins dans votre main. Si vous le " +
      "faites, la prochaine unité Marionnette que vous jouez ce tour coûte 1 de moins, minimum 1.",
    abilities: [
      {
        trigger: "onEnterPlay",
        // « arrive en jeu » : une arrivée rejouée n'en est pas une.
        triggeredBy: { subtype: MARIONNETTE, cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "regisseurRecall",
        mode: "optional",
        description: "Renvoyez une autre Marionnette de coût 2 ou moins en main : la prochaine coûte 1 de moins ce tour.",
        // Le plafond de coût 2 empêche les boucles de valeur avec Colombina
        // ou Il Dottore (audit du 15 septembre).
        // « une AUTRE unité Marionnette » : autre que le Régisseur
        // (`excludeSource`) ET autre que celle qui vient d'arriver
        // (`excludeTriggerSource`) — le texte oppose les deux.
        effects: [
          {
            type: "moveZone",
            toZone: "hand",
            target: {
              kind: "chosenUnit",
              among: { subtype: MARIONNETTE, unitsOnly: true, excludeSource: true, excludeTriggerSource: true, maxCost: 2 },
            },
          },
          { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, filter: { subtype: MARIONNETTE, cardTypes: ["marin", "creature"] } },
        ],
      },
    ],
  },
  {
    id: "la-clochette-du-rappel",
    name: "La Clochette du Rappel",
    type: "objet",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 3,
    maxCopies: 3,
    text:
      "Brisez cet Objet : renvoyez une carte Marionnette que vous contrôlez dans votre main. La prochaine carte " +
      "Marionnette que vous jouez ce tour coûte 1 de moins, minimum 1.",
    onBreakEffects: [
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE } } },
      { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, filter: { subtype: MARIONNETTE } },
    ],
  },
  {
    id: "le-theatre-englouti",
    name: "Le Théâtre Englouti",
    type: "structure",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 4,
    health: 4,
    durationTurns: 4,
    maxCopies: 1,
    text:
      "Durée : 4 tours. La première fois à chaque tour qu'une unité Marionnette que vous contrôlez revient dans " +
      "votre main, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE, cardTypes: ["marin", "creature"], excludeSelf: false },
        oncePerTurnKey: "theatreRecall",
        description: "Première Marionnette revenue en main du tour : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
    // Décision du 2026-09-16 : l'effet se limite à cette phrase (la clause
    // « 3 Marionnettes de noms différents » du lot initial est abandonnée).
  },
  {
    id: "changement-de-role",
    name: "Changement de rôle !",
    type: "objet",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 2,
    maxCopies: 3,
    // REFONTE (décision du propriétaire, 01/10/2026) : une substitution de
    // scène — une Marionnette sort, une AUTRE entre, gratuitement. L'ancien
    // texte (renvoi + remise de 1) ne faisait que rendre la monnaie. Une
    // seule par tour, par NOM : plusieurs exemplaires ne videraient pas la
    // main gratuitement. Coût inchangé.
    text:
      "Brisez cet Objet : renvoyez une unité Marionnette que vous contrôlez dans votre main. Vous pouvez jouer une " +
      "autre Marionnette depuis votre main ce tour sans payer son coût de Raison. Une seule carte nommée " +
      "Changement de rôle ! peut être Brisée par tour.",
    breakOncePerTurnByName: true,
    onBreakEffects: [
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, unitsOnly: true } } },
      {
        type: "discountNextCards",
        target: { kind: "controllerPlayer" },
        free: true,
        // « une AUTRE Marionnette » : celle qui vient de sortir n'en profite pas.
        filter: { subtype: MARIONNETTE, excludeChosenTarget: true },
      },
    ],
  },
  {
    id: "rappel-du-public",
    name: "Rappel du Public",
    type: "objet",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 3,
    maxCopies: 3,
    text: "Brisez cet Objet : choisissez une carte Marionnette dans votre Cimetière. Remettez-la dans votre main.",
    // Décision du 2026-09-16 : pas de réduction conditionnelle, le Bris
    // récupère simplement une Marionnette du Cimetière.
    onBreakEffects: [
      { type: "moveGraveyardCardToHand", target: { kind: "controllerPlayer" }, filter: { subtype: MARIONNETTE } },
    ],
  },
  {
    id: "le-rideau-se-leve",
    name: "Le Rideau se Lève",
    type: "anomalie",
    subtype: MARIONNETTE,
    setCode: THEATRE_ENGLOUTI,
    cost: 5,
    durationTurns: 2,
    maxCopies: 1,
    text:
      "Pendant 2 tours, la première carte Marionnette que vous jouez à chacun de vos tours déclenche une seconde " +
      "fois son effet d'arrivée.",
    // « que vous JOUEZ » : une carte posée depuis la main (`onlyPlayed`) — ni
    // un Péon invoqué, ni une arrivée rejouée par Colombina ou le Régisseur,
    // qui brûlaient sinon l'usage du tour. Le Rideau ne se compte pas
    // lui-même (`excludeSelf` par défaut) : sa pose n'a aucun effet d'arrivée
    // à rejouer, et la compter consommait le premier de ses deux tours.
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { subtype: MARIONNETTE, onlyPlayed: true },
        oncePerTurnKey: "rideauEncore",
        description: "Première Marionnette du tour : son effet d'arrivée se déclenche une seconde fois.",
        effects: [{ type: "repeatEnterEffects", target: { kind: "triggerSource" } }],
      },
    ],
  },

  // --- Variantes ABYSSALES du Lot 11 ------------------------------------
  {
    id: "arlecchino-celui-derriere-le-masque-abyssal",
    name: "Arlecchino, Celui derrière le Masque",
    type: "creature",
    subtype: MARIONNETTE,
    variant: "abyssale",
    setCode: THEATRE_ENGLOUTI,
    cost: 4,
    attack: 4,
    health: 4,
    maxCopies: 1,
    text:
      "À son arrivée, vous pouvez renvoyer une autre unité Marionnette que vous contrôlez dans votre main. Si vous " +
      "le faites, il gagne +2 / +2 jusqu'à votre prochain tour et la prochaine carte Marionnette que vous jouez ce " +
      "tour coûte 2 de moins, minimum 1.",
    // Décision du 2026-09-16 : la clause « le laisser en jeu » du lot initial
    // est abandonnée ; le renvoi lui donne +2 / +2, sans condition.
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        description: "Renvoyez une autre Marionnette alliée en main : il gagne +2 / +2 et la prochaine coûte 2 de moins ce tour.",
        effects: [
          { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, unitsOnly: true, excludeSource: true } } },
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 2 },
            healthAmount: { kind: "flat", value: 2 },
            duration: "untilYourNextTurn",
          },
          { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 }, filter: { subtype: MARIONNETTE } },
        ],
      },
    ],
  },
  {
    id: "le-regisseur-des-profondeurs-abyssal",
    name: "Le Régisseur des Profondeurs",
    type: "creature",
    subtype: MARIONNETTE,
    variant: "abyssale",
    setCode: THEATRE_ENGLOUTI,
    cost: 7,
    attack: 6,
    health: 8,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre unité Marionnette que vous contrôlez arrive en jeu, répétez son " +
      "effet d'arrivée. La première fois à chaque tour qu'une unité Marionnette que vous contrôlez revient dans " +
      "votre main, la prochaine unité Marionnette que vous jouez ce tour coûte 1 de moins, minimum 1.",
    abilities: [
      {
        trigger: "onEnterPlay",
        // Une arrivée REJOUÉE n'est pas une arrivée (défaut des observateurs) :
        // la répétition d'une autre carte (Colombina, Le Rideau) ne brûle pas
        // l'usage du tour.
        triggeredBy: { subtype: MARIONNETTE, cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "regisseurAbyssalEcho",
        description: "Première autre Marionnette du tour : son effet d'arrivée se répète.",
        effects: [{ type: "repeatEnterEffects", target: { kind: "triggerSource" } }],
      },
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE, cardTypes: ["marin", "creature"], excludeSelf: false },
        oncePerTurnKey: "regisseurAbyssalRecall",
        description: "Première Marionnette revenue en main du tour : la prochaine coûte 1 de moins.",
        effects: [
          { type: "discountNextCards", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 }, filter: { subtype: MARIONNETTE, cardTypes: ["marin", "creature"] } },
        ],
      },
    ],
  },
  // ======================================================================
  // Lot 12 — Rapiécer la Coque (Notion « Catalogue de cartes », 18/09/2026)
  //
  // Lot TRANSVERSAL de consolidation : pioche et filtrage, récupération
  // d'Ancrage, Garde, Pied marin, volatiles, et renforts ciblés des familles
  // existantes (Cra-Poiscail, Marionnettes). Aucun nouveau mot-clé, et aucune
  // primitive nouvelle en dehors de `condition.controllerHandAtLeast` — tout
  // le reste se dit avec ce que le moteur portait déjà.
  //
  // Le « piochez puis défaussez » du lot s'appuie sur l'effet `discard` :
  // c'est le JOUEUR qui désigne la carte défaussée (choix `handDiscard`), et
  // la suite du texte reprend une fois sa réponse donnée
  // (`resolveEffectSequence`) — le moteur ne choisit jamais à sa place.
  // ======================================================================
  {
    id: "mousse-des-quarts",
    name: "Mousse des Quarts",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    attack: 1,
    health: 2,
    text: "À son arrivée, piochez 1 carte puis défaussez 1 carte.",
    onPlayEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    // `condition.controllerHandAtLeast` plutôt qu'une condition par effet :
    // la défausse précède la pioche, donc une condition posée sur la pioche
    // lirait une main déjà amputée et le texte casserait pile au seuil.
    id: "gabier-au-carnet-mouille",
    name: "Gabier au Carnet Mouillé",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 2,
    health: 2,
    text: "À son arrivée, si vous avez au moins 4 cartes en main, défaussez 1 carte puis piochez 1 carte.",
    abilities: [
      {
        trigger: "onEnterPlay",
        condition: { controllerHandAtLeast: 4 },
        description: "À son arrivée, avec 4 cartes en main ou plus : défaussez 1 carte puis piochez 1 carte.",
        effects: [
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "quartier-maitre-des-vivres",
    name: "Quartier-maître des Vivres",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    text: "À votre début de tour, si vous avez au moins 5 cartes en main, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "startOfTurn",
        condition: { controllerHandAtLeast: 5 },
        description: "Début de tour, main de 5 cartes ou plus : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "charpentiere-de-veille",
    name: "Charpentière de Veille",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 1,
    health: 3,
    maxCopies: 2,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite ou Sabordée, récupérez " +
      "1 Ancrage.",
    abilities: [
      {
        // Un Sabordage émet TOUJOURS `onDeath` en plus de `onSaborde` : un
        // seul déclencheur couvre les deux cas du texte.
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["structure"] },
        oncePerTurnKey: "charpentiereAncrage",
        description: "Une de vos Structures part : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "chirurgien-de-coque",
    name: "Chirurgien de Coque",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 3,
    text: "À son arrivée, récupérez 1 Ancrage. Si vous avez 0 Raison ou moins, récupérez également 1 Raison.",
    onPlayEffects: [
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionControllerReasonAtMost: 0,
      },
    ],
  },
  {
    id: "capitaine-du-dernier-retour",
    name: "Capitaine du Dernier Retour",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 2,
    text: "À la fin de votre tour, si vous avez 3 Raison ou moins, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "endOfTurn",
        description: "Fin de tour en Raison basse : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          {
            type: "draw",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionControllerReasonAtMost: 3,
          },
          {
            type: "discard",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionControllerReasonAtMost: 3,
          },
        ],
      },
    ],
  },
  {
    id: "journal-de-bord-detrempe",
    name: "Journal de Bord Détrempé",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    maxCopies: 2,
    text: "Brisez cet Objet : piochez 2 cartes puis défaussez 1 carte.",
    onBreakEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "pansements-de-coque",
    name: "Pansements de Coque",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    text: "Brisez cet Objet : récupérez 1 Ancrage. Si vous avez 0 Raison ou moins, récupérez également 2 Raison.",
    onBreakEffects: [
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 2 },
        conditionControllerReasonAtMost: 0,
      },
    ],
  },
  {
    id: "caisse-de-pieces-seches",
    name: "Caisse de Pièces Sèches",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    text: "Brisez cet Objet : récupérez 2 Ancrage puis perdez 1 Raison.",
    onBreakEffects: [
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
      { type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "rations-du-matin-gris",
    name: "Rations du Matin Gris",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    text: "Brisez cet Objet : piochez 1 carte puis défaussez 1 carte. Si vous avez 3 Raison ou moins, récupérez 1 Raison.",
    onBreakEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "reasonGain",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionControllerReasonAtMost: 3,
      },
    ],
  },
  {
    id: "derniere-planche",
    name: "Dernière Planche",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    maxCopies: 2,
    requiresTideStateForBreak: ["tempete", "abysses"],
    text: "Brisable seulement pendant Tempête ou Abysses. Brisez cet Objet : récupérez 3 Ancrage.",
    onBreakEffects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 3 } }],
  },
  {
    id: "lettre-jamais-ouverte",
    name: "Lettre Jamais Ouverte",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    text: "Brisez cet Objet : piochez 1 carte. Pendant Abysses, piochez 1 carte supplémentaire puis défaussez 1 carte.",
    onBreakEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "draw",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionTideStateIn: ["abysses"],
      },
      {
        type: "discard",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        conditionTideStateIn: ["abysses"],
      },
    ],
  },
  {
    id: "atelier-de-calfatage",
    name: "Atelier de Calfatage",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 4,
    durationTurns: 4,
    maxCopies: 2,
    text:
      "Durée : 4 tours. La première fois à chaque tour qu'une autre Structure que vous contrôlez est Sabordée, " +
      "récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onSaborde",
        triggeredBy: { cardTypes: ["structure"], excludeSelf: true },
        oncePerTurnKey: "atelierAncrage",
        description: "Une autre de vos Structures est Sabordée : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "infirmerie-de-pont",
    name: "Infirmerie de Pont",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 4,
    durationTurns: 3,
    maxCopies: 2,
    text: "Durée : 3 tours. À la fin de votre tour, si vous avez 3 Raison ou moins, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "endOfTurn",
        description: "Fin de tour en Raison basse : récupérez 1 Ancrage.",
        effects: [
          {
            type: "heal",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionControllerReasonAtMost: 3,
          },
        ],
      },
    ],
  },
  {
    id: "bibliotheque-salee",
    name: "Bibliothèque Salée",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 3,
    durationTurns: 4,
    text: "Durée : 4 tours. À votre début de tour, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "startOfTurn",
        description: "Début de tour : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "caisse-des-dernieres-planches",
    name: "Caisse des Dernières Planches",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 4,
    durationTurns: 3,
    text: "Durée : 3 tours. Sabordage : récupérez 1 Ancrage et piochez 1 carte.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : récupérez 1 Ancrage et piochez 1 carte.",
        effects: [
          { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "caisse-des-dernieres-planches-abyssal",
    name: "Caisse des Dernières Planches",
    type: "structure",
    variant: "abyssale",
    setCode: RAPIECER_LA_COQUE,
    cost: 4,
    health: 5,
    durationTurns: 3,
    maxCopies: 1,
    text:
      "Durée : 3 tours. Sabordage : récupérez 2 Ancrage et piochez 1 carte. Si vous avez 0 Raison ou moins, " +
      "récupérez également 1 Raison.",
    abilities: [
      {
        trigger: "onSaborde",
        description: "Sabordage : 2 Ancrage, 1 carte, et 1 Raison si vous êtes en Déraison.",
        effects: [
          { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          {
            type: "reasonGain",
            target: { kind: "controllerPlayer" },
            amount: { kind: "flat", value: 1 },
            conditionControllerReasonAtMost: 0,
          },
        ],
      },
    ],
  },
  {
    id: "longue-vue-rayee",
    name: "Longue-Vue Rayée",
    type: "equipement",
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    health: 2,
    text:
      "Équipez un Marin ou une Créature. La première fois à chaque tour que l'unité équipée attaque, piochez " +
      "1 carte puis défaussez 1 carte.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "onAttack",
        triggeredBy: { equippedUnit: true },
        oncePerTurnKey: "longueVueFiltre",
        description: "Le porteur attaque : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  // --- Volatiles : le sous-type du lot. Aucun mot-clé propre — il sert de
  // famille de ciblage et d'identité visuelle, comme « objet flottant ».
  {
    id: "sterne-des-embruns",
    name: "Sterne des Embruns",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    attack: 1,
    health: 1,
    keywords: ["pied-marin"],
    text: "Pied marin. Lorsqu'elle attaque, elle gagne +1 Puissance jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onAttack",
        description: "Elle attaque : +1 Puissance jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 1 },
            duration: "endOfTurn",
          },
        ],
      },
    ],
  },
  {
    id: "goeland-chapardeur",
    name: "Goéland Chapardeur",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 2,
    health: 2,
    keywords: ["pied-marin"],
    text: "Pied marin. La première fois à chaque tour qu'il attaque, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "onAttack",
        oncePerTurnKey: "goelandFiltre",
        description: "Il attaque : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "cormoran-de-fer",
    name: "Cormoran de Fer",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    keywords: ["garde", "pied-marin"],
    text: "Garde. Pied marin.",
  },
  {
    id: "cormoran-de-fer-abyssal",
    name: "Cormoran de Fer",
    type: "creature",
    subtype: VOLATILE,
    variant: "abyssale",
    setCode: RAPIECER_LA_COQUE,
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 1,
    keywords: ["garde", "pied-marin"],
    text: "Garde. Pied marin. La première fois à chaque tour qu'il attaque, récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onAttack",
        oncePerTurnKey: "cormoranRaison",
        description: "Il attaque : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "albatros-de-mauvais-temps",
    name: "Albatros de Mauvais Temps",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 4,
    attack: 4,
    health: 3,
    maxCopies: 2,
    keywords: ["pied-marin"],
    // Le contournement de Garde est un champ de données, pas un mot-clé
    // accordé : il ne vaut que pour CET attaquant, pendant Tempête.
    // « +1 Puissance » est une vraie Puissance (affichée, en riposte, lue par
    // les conditions) : affinité de Marée 4 → 5 en Tempête, et non un bonus
    // de dégâts à l'attaque seulement.
    tideAffinity: { tempete: { attack: 5 } },
    bypassesGardeTideStateIn: ["tempete"],
    text: "Pied marin. Pendant Tempête, il gagne +1 Puissance et ignore Garde.",
  },
  {
    id: "pelican-des-cales",
    name: "Pélican des Cales",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    text: "À son arrivée, piochez 1 carte puis défaussez 1 carte.",
    onPlayEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "mouette-du-brise-lames",
    name: "Mouette du Brise-Lames",
    type: "creature",
    subtype: VOLATILE,
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 1,
    health: 4,
    keywords: ["garde"],
    // Standard Verrier (30/09/2026, validé par le propriétaire) : la Forteresse
    // « encaisse, grandit, frappe ». Coût et statistiques inchangés.
    text: "Garde. La première fois à chaque tour qu'elle survit à des dégâts, elle gagne +1 Puissance.",
    abilities: [
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "survieMouetteBriseLames",
        description: "Elle tient bon : +1 Puissance, conservée.",
        effects: [
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "harnois-de-vigie",
    name: "Harnois de Vigie",
    type: "equipement",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 2,
    equipGrantsBuff: { healthAmount: 1 },
    equipGrantsKeywords: ["garde"],
    text: "Équipez un Marin ou une Créature. Il gagne +1 Résistance et Garde.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
  },
  {
    id: "cra-poiscail-medecin",
    name: "Cra-Poiscail Médecin",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 1,
    health: 3,
    text: "La première fois à chaque tour que vous Brisez un Objet, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onObjectBroken",
        // L'événement vise l'Objet brisé, déjà parti au Cimetière : sans ce
        // filtre d'observateur, la capacité n'est collectée par aucun
        // circuit et ne se déclenche jamais (cf. Cra-Poiscail Ramasseur).
        triggeredBy: {},
        oncePerTurnKey: "medecinAncrage",
        description: "Vous Brisez un Objet : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "cra-poiscail-medecin-abyssal",
    name: "Cra-Poiscail Médecin",
    type: "creature",
    archetype: "cra-poiscail",
    variant: "abyssale",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 1,
    text: "La première fois à chaque tour que vous Brisez un Objet, récupérez 1 Ancrage et piochez 1 carte.",
    abilities: [
      {
        trigger: "onObjectBroken",
        // Même observateur que la version standard : sans `triggeredBy`, la
        // capacité n'est réveillée par aucun circuit.
        triggeredBy: {},
        oncePerTurnKey: "medecinAncrage",
        description: "Vous Brisez un Objet : récupérez 1 Ancrage et piochez 1 carte.",
        effects: [
          { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "cra-poiscail-messager",
    name: "Cra-Poiscail Messager",
    type: "creature",
    archetype: "cra-poiscail",
    setCode: RAPIECER_LA_COQUE,
    cost: 1,
    attack: 1,
    health: 1,
    keywords: ["pied-marin"],
    text:
      "Pied marin. Lorsqu'il attaque, si vous contrôlez au moins 3 unités Cra-Poiscail, il gagne +1 Puissance " +
      "jusqu'à la fin du tour.",
    abilities: [
      {
        trigger: "onAttack",
        description: "Il attaque avec un banc de 3 Cra-Poiscail : +1 Puissance jusqu'à la fin du tour.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 1 },
            duration: "endOfTurn",
            // « au moins 3 unités » : lui compris, d'où `excludeSelf: false`.
            conditionControlledArchetypeAtLeast: { archetype: "cra-poiscail", count: 3, excludeSelf: false },
          },
        ],
      },
    ],
  },
  {
    id: "tas-de-bouts-de-bois",
    name: "Tas de Bouts de Bois",
    type: "structure",
    archetype: "cra-poiscail",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 3,
    durationTurns: 3,
    text:
      "Durée : 3 tours. La première fois à chaque tour qu'une unité Cra-Poiscail que vous contrôlez est détruite, " +
      "cette Structure gagne +1 Résistance. Sabordage : récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { archetype: "cra-poiscail", cardTypes: ["marin", "creature"], destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "tasDeBoisRenfort",
        description: "Un de vos Cra-Poiscail tombe : +1 Résistance, définitivement.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            healthAmount: { kind: "flat", value: 1 },
            duration: "permanent",
          },
        ],
      },
      {
        trigger: "onSaborde",
        description: "Sabordage : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "la-prima-noyee",
    name: "La Prima Noyée",
    type: "marin",
    subtype: MARIONNETTE,
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    text:
      "La première fois à chaque tour qu'une autre unité Marionnette que vous contrôlez revient dans votre main, " +
      "piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE, cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "primaFiltre",
        description: "Une autre Marionnette revient en main : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "la-prima-noyee-abyssal",
    name: "La Prima Noyée",
    type: "marin",
    subtype: MARIONNETTE,
    variant: "abyssale",
    setCode: RAPIECER_LA_COQUE,
    cost: 5,
    attack: 4,
    health: 5,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre unité Marionnette que vous contrôlez revient dans votre main, " +
      "piochez 1 carte et récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE, cardTypes: ["marin", "creature"] },
        oncePerTurnKey: "primaFiltre",
        description: "Une autre Marionnette revient en main : piochez 1 carte et récupérez 1 Raison.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "arlequin-raccommodeur",
    name: "Arlequin Raccommodeur",
    type: "marin",
    subtype: MARIONNETTE,
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    attack: 2,
    health: 3,
    text: "Quand il est détruit, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onDeath",
        // « Quand il est DÉTRUIT » : un Sabordage n'en est pas un.
        condition: { destroyedBy: ["combat", "effect", "tide"] },
        description: "Il est détruit : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "trappe-du-souffleur",
    name: "Trappe du Souffleur",
    type: "structure",
    subtype: MARIONNETTE,
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 3,
    durationTurns: 3,
    maxCopies: 2,
    text:
      "Durée : 3 tours. La première fois à chaque tour qu'une carte Marionnette que vous contrôlez revient dans " +
      "votre main, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "onReturnedToHand",
        triggeredBy: { subtype: MARIONNETTE },
        oncePerTurnKey: "trappeAncrage",
        description: "Une Marionnette revient en main : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "charpentier-des-epaves",
    name: "Charpentier des Épaves",
    type: "marin",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    attack: 2,
    health: 4,
    text:
      "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite ou Sabordée, piochez " +
      "1 carte puis défaussez 1 carte, et il gagne +1 Puissance.",
    // Standard Verrier (30/09/2026, validé par le propriétaire) : « un piège
    // part, la troupe grandit ». Coût et statistiques inchangés.
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["structure"] },
        oncePerTurnKey: "charpentierFiltre",
        description: "Une de vos Structures part : piochez 1 carte puis défaussez 1 carte, +1 Puissance conservée.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
        ],
      },
    ],
  },
  {
    id: "barge-de-reparation",
    name: "Barge de Réparation",
    type: "structure",
    subtype: "objet-flottant",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    health: 4,
    durationTurns: 3,
    visibleDuringTide: ["houle", "tempete"],
    maxCopies: 2,
    text: "Durée : 3 tours. Visible pendant Houle et Tempête. À votre début de tour, si elle est visible, récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "startOfTurn",
        condition: { selfVisible: true },
        description: "Début de tour, si elle est visible : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "clous-de-recuperation",
    name: "Clous de Récupération",
    type: "objet",
    setCode: RAPIECER_LA_COQUE,
    cost: 3,
    text: "Brisez cet Objet : choisissez une Structure dans votre Cimetière. Remettez-la dans votre main.",
    onBreakEffects: [
      {
        type: "moveGraveyardCardToHand",
        target: { kind: "controllerPlayer" },
        filter: { cardType: "structure" },
      },
    ],
  },
  {
    id: "etau-du-calfat",
    name: "Étau du Calfat",
    type: "equipement",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 3,
    equipTargetTypes: ["structure"],
    text: "Équipez une Structure. Quand la Structure équipée est Sabordée, récupérez 1 Ancrage.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit", among: { cardTypes: ["structure"] } } }],
    abilities: [
      {
        trigger: "onSaborde",
        triggeredBy: { equippedUnit: true },
        description: "La Structure équipée est Sabordée : récupérez 1 Ancrage.",
        effects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "sonde-des-courants-perdus",
    name: "Sonde des Courants Perdus",
    type: "structure",
    setCode: RAPIECER_LA_COQUE,
    cost: 2,
    health: 3,
    durationTurns: 4,
    maxCopies: 2,
    text: "Durée : 4 tours. La première fois à chaque tour que la Marée change, piochez 1 carte puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "onTideStateEntered",
        oncePerTurnKey: "sondeFiltre",
        description: "La Marée change : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  // ======================================================================
  // LOT 13 — Un Dead / La Veillée des Disparus
  // ======================================================================
  // Les Un Dead ne sont pas les marins morts : ils naissent de la mélancolie
  // laissée par les disparus. Mécaniquement, une famille qui CHOISIT d'aller
  // au Cimetière — défausse volontaire, récursion filtrée, attrition — et qui
  // convertit chaque perte en pression sur le Navire adverse.
  //
  // Sous-type ET archétype (décision du 18/09/2026). Le premier jet n'avait
  // posé que le sous-type, en craignant que l'archétype ne fasse compter ces
  // cartes dans les seuils Cra-Poiscail : c'était faux. `countArchetypeUnits`
  // prend l'archétype EN PARAMÈTRE, et `conditionControlledArchetypeAtLeast`
  // nomme le sien — deux familles ne se mélangent jamais. Les Un Dead sont
  // donc une famille de plein droit, comme les Cra-Poiscail : le sous-type
  // porte le ciblage déjà écrit, l'archétype porte l'appartenance.
  {
    id: "ptit-bout",
    name: "P'tit Bout",
    type: "creature",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 1,
    attack: 1,
    health: 2,
    text: "Quand cette carte est défaussée, récupérez 1 Raison.",
    // Le déclencheur se lit sur la DÉFINITION : la carte n'a jamais été sur
    // le plateau, elle est passée de la main au Cimetière.
    abilities: [
      {
        trigger: "onDiscarded",
        description: "Défaussée : récupérez 1 Raison.",
        effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "cache-cache",
    name: "Cache-Cache",
    type: "creature",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 1,
    attack: 2,
    health: 1,
    text:
      "La première fois pendant votre tour qu'une de vos cartes rejoint le Cimetière depuis votre main ou votre pioche, " +
      "elle gagne +1 Puissance.",
    // « ou votre pioche » (Test Verrier, 30/09/2026) : le meulage nourrit la
    // Veillée comme la défausse (`onCardPutIntoGraveyard`).
    // Standard Verrier (01/10/2026, validé par le propriétaire) : les gains de
    // la Veillée RESTENT. Coût et statistiques inchangés.
    abilities: [
      {
        trigger: "onCardPutIntoGraveyard",
        triggeredBy: {},
        // « La première fois PENDANT VOTRE TOUR » : une défausse imposée
        // pendant le tour adverse ne compte pas (et ne brûle pas l'usage).
        condition: { duringOwnTurn: true },
        oncePerTurnKey: "cacheCacheDefausse",
        description: "Une de vos cartes rejoint le Cimetière (main ou pioche) : +1 Puissance, conservée.",
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true }],
      },
    ],
  },
  {
    id: "doudou",
    name: "Doudou",
    type: "equipement",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 1,
    health: 1,
    equipTargetSubtype: UN_DEAD,
    text: "Équipez une unité Un Dead. Quand l'unité équipée est détruite, piochez 1 carte puis défaussez 1 carte.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { equippedUnit: true, destroyedBy: ["combat", "effect", "tide"] },
        description: "Le porteur meurt : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "encore-cinq-minutes",
    name: "Encore cinq minutes",
    type: "creature",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 2,
    attack: 2,
    health: 3,
    // `tideStateIn` absent : la survie ne dépend d'aucune Marée, contrairement
    // à la Revenante de la Fosse. `from: ["combat"]` réalise « AU COMBAT » à
    // la lettre : ni un effet de destruction, ni la Marée ne la sauvent.
    survivesLethalOncePerTurn: { from: ["combat"] },
    // Standard Verrier (01/10/2026, validé par le propriétaire) : les gains de
    // la Veillée RESTENT. Coût et statistiques inchangés.
    text:
      "La première fois à chaque tour qu'elle devrait être détruite au combat, elle reste à 1 Résistance. La première " +
      "fois à chaque tour qu'elle survit à des dégâts, elle gagne +1 Puissance.",
    abilities: [
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "cinqMinutesTientBon",
        description: "Elle tient bon : +1 Puissance, conservée.",
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true }],
      },
    ],
  },
  {
    id: "le-gouter",
    name: "Le Goûter",
    type: "objet",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 2,
    text:
      "Brisez cet Objet : piochez 1 carte puis défaussez 1 carte. Si une carte Un Dead a rejoint votre Cimetière " +
      "ce tour, piochez 1 carte supplémentaire.",
    // La condition est portée par l'EFFET et non par la carte : la défausse
    // qui précède peut elle-même la remplir, et c'est tout l'intérêt du
    // texte. Évaluée après la réponse du joueur, comme la séquence l'impose.
    onBreakEffects: [
      { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      {
        type: "draw",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        // `excludeSource` : Le Goûter, lui-même Un Dead, rejoint le Cimetière
        // en se brisant, AVANT ses effets — il ne remplit pas sa propre
        // condition (il piochait sinon 2 cartes à chaque Bris).
        conditionGraveyardArrival: { subtype: UN_DEAD, since: "thisTurn", excludeSource: true },
      },
    ],
  },
  {
    id: "papa-est-en-mer",
    name: "Papa est en mer",
    type: "marin",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 2,
    attack: 2,
    health: 2,
    text:
      "Quand une autre de vos unités Un Dead est détruite, il gagne +1 Puissance. Une fois par tour.",
    // Standard Verrier (01/10/2026, validé par le propriétaire) : les gains de
    // la Veillée RESTENT. Coût et statistiques inchangés.
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { subtype: UN_DEAD, cardTypes: ["marin", "creature"], destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "papaAllieDetruit",
        description: "Un autre Un Dead meurt : +1 Puissance, conservée.",
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true }],
      },
    ],
  },
  {
    id: "promis-jattends",
    name: "Promis, j'attends",
    type: "creature",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 2,
    attack: 1,
    health: 4,
    text:
      "À votre début de tour, elle gagne +1 Puissance de façon permanente si une carte Un Dead a rejoint votre " +
      "Cimetière depuis votre dernier tour.",
    // Elle rendait 1 Raison. Elle ne rendait rien : la Raison se recharge à
    // son plafond au début de votre tour, JUSTE AVANT que ses capacités ne
    // se déclenchent, et le point était perdu — sauf en sortie de Déraison,
    // où la recharge n'est que partielle. Un texte qui ne paie que dans un
    // cas que rien n'annonce (décision du 18/09/2026).
    //
    // Le renforcement permanent, lui, tombe toujours. Il donne aussi au lot
    // ce qui lui manquait : six de ses effets cognent le Navire adverse pour
    // 1, et son filtrage est déjà couvert trois fois — mais aucun de ses
    // corps ne devient une menace. Un 1/4 qui s'endurcit à chaque perte est
    // la carte qui attend, et qui finit par ne plus attendre.
    abilities: [
      {
        trigger: "startOfTurn",
        // « depuis votre dernier tour » : la fenêtre couvre le tour adverse
        // qui vient de s'écouler, pas seulement celui qui commence.
        condition: { graveyardArrival: { subtype: UN_DEAD, since: "lastOwnTurn" } },
        description: "Un Un Dead est parti au Cimetière depuis votre dernier tour : +1 Puissance, définitivement.",
        effects: [
          {
            type: "buff",
            target: { kind: "self" },
            attackAmount: { kind: "flat", value: 1 },
            permanent: true,
          },
        ],
      },
    ],
  },
  {
    id: "la-petite-chanson",
    name: "La Petite Chanson",
    type: "objet",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 2,
    maxCopies: 2,
    text: "Brisez cet Objet : choisissez une unité Un Dead de coût 1 dans votre Cimetière. Remettez-la dans votre main.",
    onBreakEffects: [
      {
        type: "moveGraveyardCardToHand",
        target: { kind: "controllerPlayer" },
        filter: { subtype: UN_DEAD, cardTypes: ["marin", "creature"], maxCost: 1 },
      },
    ],
  },
  {
    id: "on-rentre-bientot",
    name: "On rentre bientôt",
    type: "creature",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 3,
    attack: 3,
    health: 3,
    text:
      "À son arrivée, vous pouvez défausser 1 carte. Si vous le faites, piochez 1 carte et elle gagne " +
      "+1 Résistance jusqu'à votre prochain tour.",
    // Défausse PUIS pioche, dans l'ordre du texte : la défausse est le prix,
    // payé avant de voir la carte piochée. « Si vous le faites » est tenu
    // par la condition de CAPACITÉ (au moins 1 carte en main) : la capacité
    // n'est proposée que si la défausse est possible, et une fois activée la
    // défausse (au choix du joueur) a forcément lieu — la pioche et le bonus
    // suivent sans autre garde.
    abilities: [
      {
        trigger: "onEnterPlay",
        mode: "optional",
        condition: { controllerHandAtLeast: 1 },
        description: "Défaussez 1 carte : piochez 1 carte et +1 Résistance jusqu'à votre prochain tour.",
        effects: [
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          {
            type: "buff",
            target: { kind: "self" },
            healthAmount: { kind: "flat", value: 1 },
            duration: "untilYourNextTurn",
          },
        ],
      },
    ],
  },
  {
    id: "maman-revient",
    name: "Maman revient",
    type: "marin",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 3,
    attack: 2,
    health: 4,
    maxCopies: 2,
    text:
      "La première fois à chaque tour que vous récupérez une carte depuis votre Cimetière, infligez 1 dégât " +
      "au Navire adverse.",
    abilities: [
      {
        trigger: "onCardRecoveredFromGraveyard",
        triggeredBy: {},
        oncePerTurnKey: "mamanRecuperation",
        description: "Vous repêchez une carte : 1 dégât au Navire adverse.",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "le-copain-du-dessous",
    name: "Le Copain du dessous",
    type: "creature",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 3,
    attack: 3,
    health: 2,
    text: "Quand elle est détruite, infligez 1 dégât au Navire adverse.",
    abilities: [
      {
        trigger: "onDeath",
        // « Quand il est DÉTRUIT » : un Sabordage n'en est pas un.
        condition: { destroyedBy: ["combat", "effect", "tide"] },
        description: "Détruite : 1 dégât au Navire adverse.",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "tu-mavais-promis",
    name: "Tu m'avais promis",
    type: "marin",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 3,
    attack: 3,
    health: 4,
    maxCopies: 2,
    text:
      "La première fois à chaque tour qu'une autre de vos unités Un Dead est détruite, vous pouvez choisir une " +
      "unité Un Dead de coût 1 dans votre Cimetière. Remettez-la dans votre main.",
    // « vous pouvez » → fenêtre de réaction ; le joueur y désigne ensuite la
    // carte du Cimetière (`chosenGraveyardInstanceId`). Deux décisions, deux
    // gestes : activer, puis choisir.
    abilities: [
      {
        trigger: "onDeath",
        mode: "optional",
        triggeredBy: { subtype: UN_DEAD, cardTypes: ["marin", "creature"], destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "tuMavaisPromis",
        description: "Un autre Un Dead meurt : repêchez une unité Un Dead de coût 1.",
        effects: [
          {
            type: "moveGraveyardCardToHand",
            target: { kind: "controllerPlayer" },
            filter: { subtype: UN_DEAD, cardTypes: ["marin", "creature"], maxCost: 1 },
          },
        ],
      },
    ],
  },
  {
    id: "la-marelle",
    name: "La Marelle",
    type: "structure",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 3,
    health: 4,
    durationTurns: 4,
    maxCopies: 2,
    text:
      "Durée : 4 tours. La première fois à chaque tour qu'une carte rejoint votre Cimetière depuis votre main ou votre pioche, " +
      "infligez 1 dégât au Navire adverse.",
    // « ou votre pioche » (Test Verrier, 30/09/2026) : vider sa pioche devient une menace.
    abilities: [
      {
        trigger: "onCardPutIntoGraveyard",
        triggeredBy: {},
        oncePerTurnKey: "marelleDefausse",
        description: "Une carte rejoint votre Cimetière (main ou pioche) : 1 dégât au Navire adverse.",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "bonne-nuit",
    name: "Bonne nuit",
    type: "objet",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 3,
    maxCopies: 2,
    text:
      "Brisez cet Objet : choisissez une unité Un Dead de coût 2 ou moins dans votre Cimetière. " +
      "Remettez-la dans votre main. Puis perdez 1 Raison.",
    onBreakEffects: [
      {
        type: "moveGraveyardCardToHand",
        target: { kind: "controllerPlayer" },
        filter: { subtype: UN_DEAD, cardTypes: ["marin", "creature"], maxCost: 2 },
      },
      { type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
    ],
  },
  {
    id: "tout-le-monde-a-table",
    name: "Tout le monde à table",
    type: "structure",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 4,
    health: 5,
    durationTurns: 4,
    maxCopies: 2,
    text:
      "Durée : 4 tours. La première fois à chaque tour qu'une de vos unités est détruite, piochez 1 carte " +
      "puis défaussez 1 carte.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["marin", "creature"], destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "tableUniteDetruite",
        description: "Une de vos unités meurt : piochez 1 carte puis défaussez 1 carte.",
        effects: [
          { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "discard", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  {
    id: "tu-viens-jouer",
    name: "Tu viens jouer ?",
    type: "creature",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 4,
    attack: 4,
    health: 4,
    maxCopies: 2,
    text:
      "À son arrivée, choisissez une unité Un Dead de coût 2 ou moins dans votre Cimetière. Remettez-la dans " +
      "votre main. Si une unité Un Dead a été détruite ce tour, elle coûte 1 Raison de moins à jouer ce tour, " +
      "minimum 1.",
    // La réduction porte sur la carte qu'on vient de repêcher, et sur elle
    // seule (`discountOnlyRecoveredCard`) : une autre unité Un Dead déjà en
    // main n'en profite pas, et rien n'est posé si rien n'a été repêché. Le
    // filtre (coût 2 ou moins compris) reprend celui de la récupération.
    //
    // `fromZone: "board"` : « DÉTRUITE ce tour », pas défaussée — la nuance
    // compte pour une famille qui fait les deux. Et une UNITÉ détruite : ni
    // un Objet brisé, ni un Équipement, ni un Sabordage (`cardTypes`,
    // `destroyedBy`).
    onPlayEffects: [
      {
        type: "moveGraveyardCardToHand",
        target: { kind: "controllerPlayer" },
        filter: { subtype: UN_DEAD, cardTypes: ["marin", "creature"], maxCost: 2 },
      },
      {
        type: "discountNextCards",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 1 },
        filter: { subtype: UN_DEAD, cardTypes: ["marin", "creature"], maxCost: 2 },
        discountOnlyRecoveredCard: true,
        conditionGraveyardArrival: {
          subtype: UN_DEAD,
          fromZone: "board",
          cardTypes: ["marin", "creature"],
          destroyedBy: ["combat", "effect", "tide"],
          since: "thisTurn",
        },
      },
    ],
  },
  {
    id: "on-avait-dit-tous-ensemble",
    name: "On avait dit tous ensemble",
    type: "creature",
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 5,
    attack: 5,
    health: 5,
    maxCopies: 1,
    text:
      "La première fois à chaque tour qu'une autre de vos cartes Un Dead est détruite ou rejoint votre Cimetière " +
      "depuis votre main ou votre pioche, infligez 1 dégât au Navire adverse.",
    // « Détruite OU défaussée / meulée » : deux déclencheurs, UNE seule clé de suivi.
    // (« ou votre pioche » : Test Verrier, 30/09/2026.)
    // `oncePerTurnFlags` est porté par la carte et non par la capacité, donc
    // la même clé donne bien « une fois par tour » au total, pas une fois
    // par voie.
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { subtype: UN_DEAD, destroyedBy: ["combat", "effect", "tide"] },
        oncePerTurnKey: "tousEnsemble",
        description: "Un autre Un Dead meurt : 1 dégât au Navire adverse.",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onCardPutIntoGraveyard",
        triggeredBy: { subtype: UN_DEAD },
        oncePerTurnKey: "tousEnsemble",
        description: "Un autre Un Dead rejoint le Cimetière (main ou pioche) : 1 dégât au Navire adverse.",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  },
  {
    id: "maman-revient-abyssal",
    name: "Maman revient",
    type: "marin",
    subtype: UN_DEAD,
    archetype: "un-dead",
    variant: "abyssale",
    setCode: VEILLEE_DES_DISPARUS,
    cost: 4,
    attack: 3,
    health: 5,
    maxCopies: 1,
    text:
      "La première fois à chaque tour que vous récupérez une carte depuis votre Cimetière, infligez 1 dégât " +
      "au Navire adverse et récupérez 1 Raison.",
    abilities: [
      {
        trigger: "onCardRecoveredFromGraveyard",
        triggeredBy: {},
        oncePerTurnKey: "mamanRecuperation",
        description: "Vous repêchez une carte : 1 dégât au Navire adverse et 1 Raison.",
        effects: [
          { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } },
          { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
        ],
      },
    ],
  },
  // =====================================================================
  // LOT 14 — NÉCESSAIRE DU MARIN (22/09/2026)
  // =====================================================================
  //
  // Notion « Nécessaire du Marin — Lot 14 · 48 cartes ». Un lot de
  // CONSOLIDATION : pas un archétype, pas une histoire — les outils
  // génériques qui manquaient à tout le monde. L'audit du catalogue les
  // avait listés comme trous béants : zéro removal visant l'adversaire, une
  // seule carte de soin d'unité, deux anti-swarm, aucune carte au-dessus de
  // 5 que les decks jouent vraiment.
  //
  // Les 48 cartes sont sans `archetype` NI `subtype`, à dessein : elles
  // doivent entrer dans n'importe quel deck sans en trahir la famille.
  //
  // --- Structures-pièges : la règle de design du lot -------------------
  //
  // Une Structure-piège est une CARTOUCHE, pas un moteur. Sa Réaction
  // cachée est volontairement plus puissante qu'un effet permanent de coût
  // comparable, et la Structure est détruite après résolution — d'où le
  // `destroy` sur `self` qui ferme chacune d'elles. C'est ce qui autorise
  // des effets aussi durs sans qu'ils s'installent.
  //
  // La fenêtre de visibilité (Tempête + Abysses) n'est pas donnée par la
  // page de lot : elle reprend celle de La Nasse Trop Pleine, seule
  // Structure-piège déjà au catalogue et carte de référence de la même
  // famille. À rearbitrer si le design veut autre chose.
  {
    id: "jugement-du-phare",
    name: "Jugement du Phare",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    health: 4,
    durationTurns: 3,
    maxCopies: 1,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. La première fois à chaque tour qu'une unité adverse " +
      "arrive alors que l'adversaire contrôle au moins 4 unités, cette unité subit 2 dégâts. Réaction cachée : " +
      "lorsqu'une unité adverse arrive alors que l'adversaire contrôle au moins 5 unités, vous pouvez payer " +
      "3 Ancrage : détruisez toutes les unités adverses. Détruisez ensuite Jugement du Phare.",
    abilities: [
      {
        trigger: "onEnterPlay",
        triggeredBy: { cardTypes: ["marin", "creature"], opponentOnly: true },
        oncePerTurnKey: "jugementDuPhare",
        condition: { selfVisible: true, opponentUnitsAtLeast: 4 },
        description: "Une quatrième unité adverse arrive : elle subit 2 dégâts.",
        effects: [{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 2 } }],
      },
      {
        // Volontairement nucléaire (garde-fou de playtest Notion : « ne pas
        // l'affaiblir avant test »). Trois garde-fous le tiennent quand
        // même : cinq corps adverses, 3 Ancrage de sa propre coque, et la
        // Structure part avec.
        trigger: "onEnterPlay",
        triggeredBy: { cardTypes: ["marin", "creature"], opponentOnly: true },
        mode: "optional",
        hiddenReaction: true,
        cost: { anchor: 3 },
        condition: { selfHidden: true, opponentUnitsAtLeast: 5 },
        description: "Payez 3 Ancrage : détruisez toutes les unités adverses, puis Jugement du Phare.",
        effects: [
          { type: "destroy", target: { kind: "allEnemyUnits" }, filter: { cardTypes: ["marin", "creature"] } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "barils-de-poudre",
    name: "Barils de Poudre",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    health: 3,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. La première unité adverse jouée après la troisième " +
      "chaque tour subit 1 dégât. Réaction cachée : lorsqu'une unité adverse arrive alors que l'adversaire en " +
      "contrôle au moins 4, infligez 2 dégâts à toutes les unités adverses. Détruisez ensuite Barils de Poudre.",
    abilities: [
      {
        // Texte Notion (revue du 02/10/2026) : un compte des unités JOUÉES
        // ce tour par l'adversaire, pas de celles qu'il contrôle — un
        // plateau déjà plein ne déclenche rien, la quatrième pose du tour oui.
        trigger: "onEnterPlay",
        triggeredBy: { cardTypes: ["marin", "creature"], opponentOnly: true, onlyPlayed: true },
        oncePerTurnKey: "barilsDePoudre",
        condition: { selfVisible: true, opponentUnitsPlayedThisTurnAtLeast: 4 },
        description: "La quatrième unité adverse jouée ce tour subit 1 dégât.",
        effects: [{ type: "damage", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onEnterPlay",
        triggeredBy: { cardTypes: ["marin", "creature"], opponentOnly: true },
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true, opponentUnitsAtLeast: 4 },
        description: "2 dégâts à toutes les unités adverses, puis détruisez Barils de Poudre.",
        effects: [
          { type: "damage", target: { kind: "allEnemyUnits" }, filter: { cardTypes: ["marin", "creature"] }, amount: { kind: "flat", value: 2 } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "pont-mine",
    name: "Pont Miné",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    health: 3,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. La première unité adverse de Puissance 5 ou plus qui " +
      "attaque chaque tour perd 2 Puissance pour cette attaque. Réaction cachée : lorsqu'une unité adverse de " +
      "Puissance 5 ou plus attaque, détruisez cette unité avant qu'elle n'inflige ses dégâts. Détruisez ensuite " +
      "Pont Miné.",
    abilities: [
      {
        trigger: "onUnitAttackDeclared",
        oncePerTurnKey: "pontMine",
        condition: { selfVisible: true, attackerPowerAtLeast: 5 },
        description: "Une grosse unité adverse attaque : elle perd 2 Puissance pour cette attaque.",
        effects: [{ type: "modifyAttackerPower", target: { kind: "self" }, amount: { kind: "flat", value: 2 } }],
      },
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true, attackerPowerAtLeast: 5 },
        description: "Détruisez l'attaquant avant ses dégâts, puis Pont Miné.",
        effects: [
          { type: "destroy", target: { kind: "pendingAttacker" } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "cloison-etanche",
    name: "Cloison Étanche",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 2,
    health: 4,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. Vos autres Structures ont +1 Résistance. Réaction " +
      "cachée : lorsqu'une de vos Structures devrait être détruite, elle reste en jeu avec 1 Résistance. " +
      "Détruisez ensuite Cloison Étanche.",
    // L'aura ne porte que tant qu'elle est visible : une Structure masquée
    // est inactive, ses auras comprises. Elle ne s'applique jamais à
    // elle-même, ce qui dit « vos AUTRES Structures » sans rien déclarer.
    auraBuffControllerCardTypes: { targetTypes: ["structure"], healthAmount: 1, whileSelfVisible: true },
    abilities: [
      {
        trigger: "onPermanentWouldBeDestroyed",
        triggeredBy: { cardTypes: ["structure"] },
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true },
        description: "Votre Structure reste en jeu avec 1 Résistance, puis Cloison Étanche est détruite.",
        effects: [
          { type: "surviveWithHealth", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "cale-inondable",
    name: "Cale Inondable",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    health: 4,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. Si l'adversaire contrôle plus d'unités que vous, la " +
      "première unité adverse qui attaque chaque tour perd 1 Puissance pour cette attaque. Réaction cachée : " +
      "lorsque la troisième unité adverse attaque pendant un même tour, toutes les unités adverses perdent " +
      "3 Puissance jusqu'à la fin du tour. Détruisez ensuite Cale Inondable.",
    abilities: [
      {
        trigger: "onUnitAttackDeclared",
        oncePerTurnKey: "caleInondable",
        // « la PREMIÈRE unité adverse qui attaque chaque tour » : la première
        // attaque seulement, même si la comparaison des plateaux l'écarte.
        condition: { selfVisible: true, opponentUnitsMoreThanController: true, opponentAttacksThisTurnAtMost: 1 },
        description: "L'adversaire a plus de corps : son attaquant perd 1 Puissance.",
        effects: [{ type: "modifyAttackerPower", target: { kind: "self" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true, opponentAttacksThisTurnAtLeast: 3 },
        description: "Toutes les unités adverses perdent 3 Puissance, puis Cale Inondable est détruite.",
        effects: [
          {
            type: "debuff",
            target: { kind: "allEnemyUnits" },
            filter: { cardTypes: ["marin", "creature"] },
            attackAmount: { kind: "flat", value: 3 },
            duration: "endOfTurn",
          },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "chaine-de-travers",
    name: "Chaîne de Travers",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 2,
    health: 3,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. La première unité adverse jouée chaque tour perd " +
      "1 Puissance jusqu'à la fin du tour. Réaction cachée : lorsqu'une unité adverse arrive, elle ne peut ni " +
      "attaquer ni activer ses effets jusqu'au prochain tour de son propriétaire. Détruisez ensuite Chaîne de " +
      "Travers.",
    abilities: [
      {
        trigger: "onEnterPlay",
        // « JOUÉE » : une unité invoquée par un effet n'en est pas une.
        triggeredBy: { cardTypes: ["marin", "creature"], opponentOnly: true, onlyPlayed: true },
        oncePerTurnKey: "chaineDeTravers",
        condition: { selfVisible: true },
        description: "La première unité adverse du tour perd 1 Puissance.",
        effects: [
          { type: "debuff", target: { kind: "triggerSource" }, attackAmount: { kind: "flat", value: 1 }, duration: "endOfTurn" },
        ],
      },
      {
        trigger: "onEnterPlay",
        triggeredBy: { cardTypes: ["marin", "creature"], opponentOnly: true },
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true },
        description: "L'unité qui arrive est entravée jusqu'au tour suivant, puis Chaîne de Travers est détruite.",
        effects: [
          // `untilYourNextTurn` dit exactement « jusqu'au prochain tour de
          // son propriétaire » : l'entrave se lève d'elle-même.
          {
            type: "debuff",
            target: { kind: "triggerSource" },
            attackAmount: { kind: "flat", value: 0 },
            duration: "untilYourNextTurn",
            silences: true,
          },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "derniere-barricade",
    name: "Dernière Barricade",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    health: 4,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. La première fois à chaque tour que votre Navire subit " +
      "des dégâts directs d'une attaque, réduisez-les de 1. Réaction cachée : lorsque votre Navire devrait subir " +
      "des dégâts directs d'une attaque, annulez ces dégâts. Détruisez ensuite Dernière Barricade.",
    abilities: [
      {
        trigger: "onIncomingDirectAttack",
        oncePerTurnKey: "derniereBarricade",
        condition: { selfVisible: true },
        description: "Réduit de 1 les dégâts directs de l'attaque en cours.",
        effects: [{ type: "reduceIncomingDamage", target: { kind: "self" }, amount: { kind: "flat", value: 1 } }],
      },
      {
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true },
        description: "Annulez les dégâts directs, puis détruisez Dernière Barricade.",
        effects: [
          { type: "cancelIncomingAttack", target: { kind: "self" } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "fausse-cargaison",
    name: "Fausse Cargaison",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 2,
    health: 3,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. La première activation d'Objet adverse de chaque tour " +
      "coûte 1 Raison supplémentaire. Réaction cachée : lorsqu'un adversaire Brise un Objet, annulez l'effet de " +
      "cet Objet. Détruisez ensuite Fausse Cargaison.",
    // Même champ de données que la Cloche d'Alerte : une taxe de Bris
    // adverse, une fois par tour, tant que la carte est visible.
    taxOpponentObjectBreakOncePerTurnWhileVisible: { amount: 1 },
    abilities: [
      {
        trigger: "onObjectBroken",
        triggeredBy: { opponentOnly: true },
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true },
        description: "Annulez l'effet de l'Objet adverse, puis détruisez Fausse Cargaison.",
        effects: [
          { type: "cancelObjectEffect", target: { kind: "self" } },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "filet-de-sauvetage",
    name: "Filet de Sauvetage",
    type: "structure",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 2,
    health: 3,
    durationTurns: 3,
    maxCopies: 2,
    visibleDuringTide: ["tempete", "abysses"],
    text:
      "Durée : 3 tours. Visible pendant Tempête et Abysses. Les unités que vous contrôlez ont +2 Résistance tant " +
      "que Filet de Sauvetage est visible. Réaction cachée : lorsqu'une de vos unités devrait être détruite, " +
      "empêchez cette destruction et elle gagne +2 Résistance. Détruisez ensuite Filet de Sauvetage.",
    // BUFF DE RÉSISTANCE MAXIMALE, jamais une restauration (correction
    // retenue, Notion) : les dégâts déjà subis ne sont pas soignés, et le
    // bonus disparaît avec la visibilité de la Structure — une unité dont
    // les dégâts dépassent alors sa Résistance retombée meurt au contrôle
    // de morts suivant. C'est la différence exacte entre « +2 Résistance »
    // et « restaurez 2 Résistance ».
    auraBuffControllerCardTypes: { targetTypes: ["marin", "creature"], healthAmount: 2, whileSelfVisible: true },
    abilities: [
      {
        trigger: "onPermanentWouldBeDestroyed",
        triggeredBy: { cardTypes: ["marin", "creature"] },
        mode: "optional",
        hiddenReaction: true,
        condition: { selfHidden: true },
        description: "Votre unité survit et gagne +2 Résistance, puis Filet de Sauvetage est détruit.",
        effects: [
          { type: "surviveWithHealth", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } },
          { type: "buff", target: { kind: "triggerSource" }, healthAmount: { kind: "flat", value: 2 }, attackAmount: { kind: "flat", value: 0 }, permanent: true },
          { type: "destroy", target: { kind: "self" } },
        ],
      },
    ],
  },
  // --- Anti-swarm / contrôle -------------------------------------------
  // L'audit du 21/09 ne comptait que deux cartes anti-swarm au catalogue,
  // pour un pool qui fabrique des corps bien plus vite qu'il ne sait les
  // punir. Ces six-là rendent au nombre un prix, à des seuils différents.
  {
    id: "le-pont-est-plein",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Le Pont est Plein !",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    maxCopies: 2,
    text: "Infligez 2 dégâts à toutes les unités de Puissance 2 ou moins.",
    // Puissance EFFECTIVE : une unité qu'un buff vient de faire passer à 3
    // y échappe, ce que le texte promet.
    onPlayEffects: [
      {
        type: "damage",
        target: { kind: "allUnits" },
        filter: { cardTypes: ["marin", "creature"], maxPower: 2 },
        amount: { kind: "flat", value: 2 },
      },
    ],
  },
  {
    id: "vague-scelerate",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Vague Scélérate",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 5,
    maxCopies: 2,
    text: "Infligez 2 dégâts à toutes les unités en jeu.",
    onPlayEffects: [
      {
        type: "damage",
        target: { kind: "allUnits" },
        filter: { cardTypes: ["marin", "creature"] },
        amount: { kind: "flat", value: 2 },
      },
    ],
  },
  {
    id: "chacun-sa-place",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Chacun sa Place",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    // 5 → 3 (décision du propriétaire, 01/10/2026) : à 5, elle arrivait trop
    // tard pour un effet souvent partiel. À 3, un outil contre les plateaux
    // qui commencent à déborder, sans remplacer les vrais balais. Effet inchangé.
    cost: 3,
    maxCopies: 1,
    text: "Chaque joueur choisit jusqu'à 3 unités qu'il contrôle. Détruisez toutes les autres.",
    onPlayEffects: [{ type: "keepUnitsDestroyRest", target: { kind: "allPlayers" }, uses: 3 }],
  },
  {
    id: "pas-tous-a-la-fois",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Pas Tous à la Fois !",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    maxCopies: 2,
    text:
      "Jusqu'à votre prochain tour, après la troisième unité jouée par chaque joueur, les unités supplémentaires " +
      "coûtent +2 Raison.",
    // Une taxe SYMÉTRIQUE : elle frappe aussi celui qui la pose. C'est ce
    // qui en fait une carte de tempo et non un simple mur — on la joue
    // quand on a déjà déployé, pas pour se protéger gratuitement.
    onPlayEffects: [
      {
        type: "surchargeCards",
        target: { kind: "allPlayers" },
        amount: { kind: "flat", value: 2 },
        filter: { cardTypes: ["marin", "creature"] },
        afterUnitsPlayedThisTurn: 3,
        persistentTax: true,
        lastsExtraTurns: 1,
      },
    ],
  },
  {
    id: "le-large-se-fache",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Le Large se Fâche",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 6,
    maxCopies: 1,
    text: "Infligez 3 dégâts à toutes les unités en jeu.",
    onPlayEffects: [
      {
        type: "damage",
        target: { kind: "allUnits" },
        filter: { cardTypes: ["marin", "creature"] },
        amount: { kind: "flat", value: 3 },
      },
    ],
  },

  // --- Pioche / filtrage -------------------------------------------------
  // Le catalogue savait piocher, pas CHOISIR. Ces six Objets rendent la
  // pioche lisible sans la rendre plus abondante — regarder, prendre une
  // carte, remettre le reste dessous.
  //
  // Le « Brisez cet Objet : » de chacun n'est pas dans la table du lot, qui
  // ne donne que la colonne « Effet ». C'est l'idiome des Objets du jeu, et
  // celui que le reste du même lot écrit noir sur blanc (Coup de Harpon,
  // Bandages Humides…) : un Objet occupe un Slot et se brise pour agir.
  // Arbitrage reporté sur la page Notion du lot.
  {
    id: "faire-linventaire",
    name: "Faire l'Inventaire",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 2,
    maxCopies: 3,
    text:
      "Brisez cet Objet : regardez les 3 premières cartes de votre pioche. Ajoutez-en une à votre main. Placez " +
      "les autres sous votre pioche.",
    onBreakEffects: [
      { type: "lookAtDeckTop", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 3 }, uses: 1 },
    ],
  },
  {
    id: "mauvaise-main",
    name: "Mauvaise Main",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 2,
    maxCopies: 3,
    text: "Brisez cet Objet : placez jusqu'à 2 cartes de votre main sous votre pioche, puis piochez-en autant.",
    onBreakEffects: [
      { type: "handToDeckBottomThenDraw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
    ],
  },
  {
    id: "un-peu-de-repit",
    name: "Un Peu de Répit",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    maxCopies: 3,
    text: "Brisez cet Objet : si l'adversaire contrôle plus d'unités que vous, piochez 2 cartes.",
    onBreakEffects: [
      {
        type: "draw",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 2 },
        conditionOpponentUnitsMoreThanController: true,
      },
    ],
  },
  {
    id: "dernieres-reserves",
    name: "Dernières Réserves",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    maxCopies: 3,
    text: "Brisez cet Objet : si vous avez 1 carte ou moins en main, piochez 2 cartes.",
    onBreakEffects: [
      {
        type: "draw",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 2 },
        conditionControllerHandAtMost: 1,
      },
    ],
  },
  {
    id: "fouille-de-la-cale",
    name: "Fouille de la Cale",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 2,
    maxCopies: 3,
    text:
      "Brisez cet Objet : regardez les 4 premières cartes de votre pioche. Vous pouvez ajouter un Objet parmi " +
      "elles à votre main. Placez les autres sous votre pioche.",
    onBreakEffects: [
      {
        type: "lookAtDeckTop",
        target: { kind: "controllerPlayer" },
        amount: { kind: "flat", value: 4 },
        uses: 1,
        filter: { cardTypes: ["objet"] },
        refusable: true,
      },
    ],
  },
  // --- Objets réactifs / défense ----------------------------------------
  // Pendant le tour adverse, un Objet ne se Brise PAS librement : seulement
  // quand le déclencheur écrit sur la carte survient. Chacun passe donc par
  // une capacité `optional` accrochée à sa fenêtre, jamais par une
  // ouverture générale.
  //
  // Leur coût imprimé de 4 est calibré sur le Bris DEPUIS LA MAIN, à
  // max(1, ceil(coût / 2)) = 2 Raison (garde-fou de playtest Notion).
  {
    id: "harpon-a-ressort",
    name: "Harpon à Ressort",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text: "Lorsqu'une unité adverse attaque, vous pouvez Briser cet Objet : infligez-lui 2 dégâts.",
    onBreakEffects: [{ type: "damage", target: { kind: "pendingAttacker" }, amount: { kind: "flat", value: 2 } }],
    abilities: [
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        description: "Brisez Harpon à Ressort : 2 dégâts à l'attaquant.",
        effects: [
          { type: "damage", target: { kind: "pendingAttacker" }, amount: { kind: "flat", value: 2 } },
          { type: "saborde", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "bouclier-decume",
    name: "Bouclier d'Écume",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text:
      "Lorsqu'une de vos unités devrait être détruite pendant le tour adverse, vous pouvez Briser cet Objet : " +
      "elle reste en jeu avec 1 Résistance.",
    onBreakEffects: [{ type: "surviveWithHealth", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } }],
    abilities: [
      {
        trigger: "onPermanentWouldBeDestroyed",
        triggeredBy: { cardTypes: ["marin", "creature"] },
        mode: "optional",
        condition: { duringOpponentTurn: true },
        description: "Brisez Bouclier d'Écume : votre unité reste en jeu avec 1 Résistance.",
        effects: [
          { type: "surviveWithHealth", target: { kind: "triggerSource" }, amount: { kind: "flat", value: 1 } },
          { type: "saborde", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "signal-de-detresse",
    name: "Signal de Détresse",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text:
      "Lorsque votre Navire devrait subir des dégâts directs pendant le tour adverse, vous pouvez Briser cet " +
      "Objet : réduisez-les de 3.",
    onBreakEffects: [{ type: "reduceIncomingDamage", target: { kind: "self" }, amount: { kind: "flat", value: 3 } }],
    abilities: [
      {
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        description: "Brisez Signal de Détresse : 3 dégâts directs de moins.",
        effects: [
          { type: "reduceIncomingDamage", target: { kind: "self" }, amount: { kind: "flat", value: 3 } },
          { type: "saborde", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "corde-de-rappel",
    name: "Corde de Rappel",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text:
      "Lorsqu'une de vos unités est ciblée par une attaque, vous pouvez Briser cet Objet : renvoyez cette unité " +
      "dans votre main.",
    onBreakEffects: [{ type: "moveZone", toZone: "hand", target: { kind: "attackTarget" } }],
    abilities: [
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        // « une de vos UNITÉS est ciblée » : ni une attaque directe, ni une Structure attaquée.
        condition: { attackTargetIsOwnUnit: true },
        description: "Brisez Corde de Rappel : l'unité visée rentre dans votre main.",
        effects: [
          { type: "moveZone", toZone: "hand", target: { kind: "attackTarget" } },
          { type: "saborde", target: { kind: "self" } },
        ],
      },
    ],
  },
  {
    id: "contre-harpon",
    name: "Contre-Harpon",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text:
      "Lorsqu'une unité adverse inflige des dégâts directs à votre Navire, vous pouvez Briser cet Objet : " +
      "infligez-lui 2 dégâts.",
    onBreakEffects: [{ type: "damage", target: { kind: "pendingAttacker" }, amount: { kind: "flat", value: 2 } }],
    abilities: [
      {
        // Le moteur n'a qu'une fenêtre pour « dégâts directs au Navire », et
        // elle s'ouvre JUSTE AVANT le coup (`onIncomingDirectAttack`) : la
        // riposte part donc au même moment que celle des autres pièges de
        // coque, sans rien changer à ce qu'elle rend.
        trigger: "onIncomingDirectAttack",
        mode: "optional",
        // « une UNITÉ adverse inflige » : pas un tir de Navire.
        condition: { attackFromUnit: true },
        description: "Brisez Contre-Harpon : 2 dégâts à l'unité qui frappe votre coque.",
        effects: [
          { type: "damage", target: { kind: "pendingAttacker" }, amount: { kind: "flat", value: 2 } },
          { type: "saborde", target: { kind: "self" } },
        ],
      },
    ],
  },

  // --- Removal / utilitaires ---------------------------------------------
  // L'audit du catalogue ne trouvait AUCUNE carte capable de détruire un
  // permanent adverse : la seule destruction visait son propre plateau.
  // Ces six-là ouvrent la réponse — ciblée, payante, et jamais gratuite.
  {
    id: "coup-de-harpon",
    name: "Coup de Harpon",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 3,
    text: "Brisez cet Objet : infligez 2 dégâts à une unité.",
    onBreakEffects: [
      {
        type: "damage",
        target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false } },
        amount: { kind: "flat", value: 2 },
      },
    ],
  },
  {
    id: "par-dessus-bord",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Par-dessus Bord !",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 3,
    maxCopies: 3,
    text: "Renvoyez une unité de coût 3 ou moins dans la main de son propriétaire.",
    onPlayEffects: [
      {
        type: "moveZone",
        toZone: "hand",
        target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false, maxCost: 3 } },
      },
    ],
  },
  {
    id: "quon-en-finisse",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Qu'on en Finisse",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 5,
    maxCopies: 2,
    text: "Détruisez une unité ayant déjà subi des dégâts ce tour.",
    onPlayEffects: [
      {
        type: "destroy",
        target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false, damagedThisTurn: true } },
      },
    ],
  },
  {
    id: "sabotage-discret",
    name: "Sabotage Discret",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text: "Brisez cet Objet : détruisez un Objet adverse.",
    onBreakEffects: [
      { type: "destroy", target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["objet"] } } },
    ],
  },
  {
    id: "charge-de-demolition",
    name: "Charge de Démolition",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 6,
    maxCopies: 2,
    text: "Brisez cet Objet : détruisez une Structure adverse.",
    onBreakEffects: [
      { type: "destroy", target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["structure"] } } },
    ],
  },
  {
    id: "coupez-les-cordages",
    name: "Coupez les Cordages !",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text: "Brisez cet Objet : détruisez un Équipement.",
    onBreakEffects: [
      // Sans restriction de camp : le texte dit « un Équipement », pas « un
      // Équipement adverse ».
      { type: "destroy", target: { kind: "chosenUnit", among: { sameController: false, cardTypes: ["equipement"] } } },
    ],
  },

  // --- Heal / comeback ---------------------------------------------------
  // Une seule carte du catalogue savait réparer une unité blessée. Ces
  // quatre-là rendent l'attrition survivable sans rendre la coque infinie :
  // le soin d'Ancrage est plafonné par le Navire (22/09/2026).
  {
    id: "bandages-humides",
    name: "Bandages Humides",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 2,
    maxCopies: 3,
    text: "Brisez cet Objet : restaurez 2 Résistance à une unité.",
    onBreakEffects: [
      {
        type: "heal",
        target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false, damaged: true } },
        amount: { kind: "flat", value: 2 },
      },
    ],
  },
  {
    id: "trousse-du-bord",
    name: "Trousse du Bord",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text: "Brisez cet Objet : restaurez jusqu'à 4 Résistance répartie entre les unités que vous contrôlez.",
    onBreakEffects: [
      { type: "healDistributed", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 4 } },
    ],
  },
  {
    id: "reparations-durgence",
    name: "Réparations d'Urgence",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 4,
    maxCopies: 2,
    text: "Brisez cet Objet : récupérez 1 Ancrage par emplacement libre sur votre board, maximum 3.",
    // L'exact opposé d'une carte anti-swarm : elle rend d'autant plus que
    // le plateau est vide. C'est ce qui en fait un comeback et non une
    // carte de tempo.
    onBreakEffects: [
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "freeSlots", per: 1, max: 3 } },
    ],
  },
  {
    id: "on-flotte-encore",
    name: "On Flotte Encore",
    type: "objet",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 5,
    maxCopies: 2,
    text:
      "Brisez cet Objet : récupérez 4 Ancrage. Jouable uniquement si vous avez perdu au moins la moitié de votre " +
      "Ancrage initial.",
    // La condition porte sur la POSE comme sur le Bris DEPUIS LA MAIN (autre
    // façon de jouer la carte, `breakObject`) : une carte qu'on ne peut pas
    // jouer reste en main, et rien n'est dépensé. Une fois posée, son Bris
    // depuis le plateau n'est plus conditionné — elle a déjà été jouée.
    playableOnlyIf: { controllerAnchorAtMostRatioOfStart: 0.5 },
    onBreakEffects: [
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 4 } },
    ],
  },
  // --- Marins / Créatures génériques de haut coût ------------------------
  // La mesure du 22/09 est sans appel : 96 % des cartes réellement jouées
  // coûtent 3 ou moins, et le coût 7 n'était JAMAIS joué — non par manque
  // de Raison, mais parce qu'aucune carte ne l'occupait. Ces sept-là
  // existent pour qu'accumuler sa Raison ait enfin un objet.
  {
    id: "vieux-harponneur",
    name: "Vieux Harponneur",
    type: "marin",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 5,
    attack: 4,
    health: 5,
    maxCopies: 2,
    text: "À son arrivée, infligez 2 dégâts à une unité déjà blessée.",
    onPlayEffects: [
      {
        type: "damage",
        target: { kind: "chosenUnit", among: { unitsOnly: true, sameController: false, damaged: true } },
        amount: { kind: "flat", value: 2 },
      },
    ],
  },
  {
    id: "chirurgien-du-bord",
    name: "Chirurgien du Bord",
    type: "marin",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 5,
    attack: 3,
    health: 6,
    maxCopies: 2,
    text: "À son arrivée, restaurez jusqu'à 3 Résistance répartie entre les unités que vous contrôlez.",
    onPlayEffects: [
      { type: "healDistributed", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 3 } },
    ],
  },
  {
    id: "le-brise-ligne",
    name: "Le Brise-Ligne",
    type: "marin",
    // Rattaché à l'Équipage de Verre par le Lot 15 (Notion, 23/09/2026) —
    // sans rien changer à son texte : la famille ne compte pas ses membres.
    archetype: "equipage-de-verre",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 6,
    attack: 5,
    health: 6,
    maxCopies: 2,
    text: "À son arrivée, si l'adversaire contrôle au moins 4 unités, infligez 1 dégât à toutes les unités adverses.",
    onPlayEffects: [
      {
        type: "damage",
        target: { kind: "allEnemyUnits" },
        filter: { cardTypes: ["marin", "creature"] },
        amount: { kind: "flat", value: 1 },
        conditionOpponentUnitsAtLeast: 4,
      },
    ],
  },
  {
    id: "le-dernier-rempart",
    name: "Le Dernier Rempart",
    type: "marin",
    // Première carte de la CAVALERIE (Notion, 22/09/2026). Sous-type ET
    // archétype, comme les Un Dead : le premier sert au ciblage et à
    // l'identité visuelle, le second aux comptages et aux conditions que
    // la famille recevra.
    subtype: CAVALERIE,
    archetype: "cavalerie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 6,
    attack: 4,
    health: 8,
    maxCopies: 2,
    keywords: ["garde"],
    // Standard Verrier (30/09/2026, validé par le propriétaire) : la Forteresse
    // « encaisse, grandit, frappe ». Coût et statistiques inchangés.
    text: "Garde. La première fois à chaque tour qu'il survit à des dégâts, infligez 2 dégâts au Navire adverse.",
    abilities: [
      {
        trigger: "onSurvivedDamage",
        oncePerTurnKey: "survieDernierRempart",
        description: "Il tient : 2 dégâts au Navire adverse.",
        effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 2 } }],
      },
    ],
  },
  {
    id: "lamiral-sans-pavillon",
    name: "L'Amiral sans Pavillon",
    type: "marin",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 7,
    attack: 6,
    health: 7,
    maxCopies: 1,
    text:
      "À son arrivée, si l'adversaire contrôle plus d'unités que vous, détruisez une unité de coût 3 ou moins " +
      "qu'il contrôle.",
    onPlayEffects: [
      {
        type: "destroy",
        target: { kind: "chosenUnit", among: { opponentOnly: true, unitsOnly: true, maxCost: 3 } },
        conditionOpponentUnitsMoreThanController: true,
      },
    ],
  },
  {
    id: "le-naufrage-impossible",
    name: "Le Naufragé Impossible",
    type: "marin",
    // Rejoint les UN DEAD (Notion, 22/09/2026) : un noyé qui refuse de
    // couler a sa place dans la famille du Lot 13. Il compte donc dans
    // leurs seuils et répond à leurs conditions de Cimetière.
    subtype: UN_DEAD,
    archetype: "un-dead",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 7,
    attack: 6,
    health: 8,
    maxCopies: 1,
    text: "La première fois qu'il devrait être détruit, il reste en jeu avec 1 Résistance.",
    // `onceEver` : un seul sauvetage pour toute la partie, jamais réarmé
    // d'un tour à l'autre — c'est ce que dit « la première fois ».
    survivesLethalOncePerTurn: { onceEver: true },
  },
  {
    id: "leviathan-balafre",
    name: "Léviathan Balafré",
    type: "creature",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 8,
    attack: 8,
    health: 9,
    maxCopies: 1,
    text: "À son arrivée, infligez 2 dégâts à toutes les autres unités de coût 2 ou moins.",
    // « toutes les AUTRES » : `excludeSelf` écarte le Léviathan lui-même,
    // qui de toute façon ne passerait pas le plafond de coût — mais le
    // texte le dit, donc la définition le dit.
    onPlayEffects: [
      {
        type: "damage",
        target: { kind: "allUnits" },
        filter: { cardTypes: ["marin", "creature"], maxCost: 2, excludeSelf: true },
        amount: { kind: "flat", value: 2 },
      },
    ],
  },

  // --- Finishers non-unités ----------------------------------------------
  // Trois cartes qui ferment une partie sans passer par un corps : c'est le
  // seul endroit du lot où le coût 6-7 achète un effet, pas une statistique.
  // (Abandonnez le Navire ! en est sorti le 01/10/2026 : coût 2.)
  {
    id: "abandonnez-le-navire",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Abandonnez le Navire !",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    // 6 → 2 (décision du propriétaire, 01/10/2026) : plus un finisher raté,
    // une remise à zéro partielle très agressive. À surveiller dans les decks
    // qui jouent naturellement peu d'unités. Effet inchangé.
    cost: 2,
    maxCopies: 1,
    text: "Chaque joueur choisit jusqu'à 2 unités qu'il contrôle. Détruisez toutes les autres.",
    onPlayEffects: [{ type: "keepUnitsDestroyRest", target: { kind: "allPlayers" }, uses: 2 }],
  },
  {
    id: "la-mer-reprend-tout",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "La Mer Reprend Tout",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 7,
    maxCopies: 1,
    text: "Détruisez toutes les unités en jeu.",
    onPlayEffects: [
      { type: "destroy", target: { kind: "allUnits" }, filter: { cardTypes: ["marin", "creature"] } },
    ],
  },
  {
    id: "dernier-jour-en-mer",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    name: "Dernier Jour en Mer",
    type: "anomalie",
    setCode: NECESSAIRE_DU_MARIN,
    cost: 7,
    maxCopies: 1,
    text: "Détruisez une unité ou une Structure adverse. Puis récupérez 2 Ancrage.",
    onPlayEffects: [
      {
        type: "destroy",
        target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["marin", "creature", "structure"] } },
      },
      { type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
    ],
  },
  // Lot 15 — Éclats en Selle : 59 cartes, dans leur propre module
  // (`game/cards/sets/eclatsEnSelle.ts`).
  ...ECLATS_EN_SELLE_SET,
  // Lot 16 — Les Altérés : leur propre module (`game/cards/sets/alteres.ts`).
  ...ALTERES_SET,
  // Landes (05/10/2026) : leur propre module (`game/cards/sets/landes.ts`).
  ...LANDES_SET,
  ...LOT17_SET,
];

/**
 * Index de résolution : le catalogue collectionnable PLUS les jetons
 * (`TOKEN_SET`). Les jetons ne sont volontairement pas dans `CORE_SET` —
 * collection, deckbuilding, boosters et rareté itèrent `CORE_SET` et ne
 * doivent jamais les voir — mais `getCardDefinition` doit savoir les
 * résoudre : un Péon invoqué est une carte comme une autre sur le plateau.
 */
export const CARD_DATABASE: ReadonlyMap<string, CardDefinition> = new Map(
  [...CORE_SET, ...TOKEN_SET].map((card) => [card.id, card])
);

export function getCardDefinition(cardId: string): CardDefinition {
  // Carte masquée d'une vue projetée (`game/state/playerView.ts`) : jamais
  // dans le catalogue, seulement côté client.
  if (cardId === HIDDEN_CARD_ID) return HIDDEN_CARD_DEFINITION;
  const def = CARD_DATABASE.get(cardId);
  if (!def) {
    throw new Error(`Carte inconnue: ${cardId}`);
  }
  return def;
}

/**
 * Ce permanent est-il un choix légal pour équiper `equipmentDef` — d'un
 * type que CET Équipement accepte (`equipmentDef.equipTargetTypes`, sinon
 * `EQUIPPABLE_CARD_TYPES` par défaut : certains Équipements restreignent
 * davantage, ex: "Treuil Rouillé" → Structure uniquement) ET pas déjà
 * équipé par un autre Équipement du même plateau ?
 */
export function canBeEquipTarget(
  equipmentDef: CardDefinition,
  board: CardInstance[],
  candidate: CardInstance
): boolean {
  const candidateDef = getCardDefinition(candidate.cardId);
  const allowedTypes = equipmentDef.equipTargetTypes ?? EQUIPPABLE_CARD_TYPES;
  if (!allowedTypes.includes(candidateDef.type)) return false;
  // "Équipez un Cra-Poiscail" : la famille restreint la cible en plus du type.
  if (equipmentDef.equipTargetArchetype && candidateDef.archetype !== equipmentDef.equipTargetArchetype) return false;
  // "Équipez une unité Un Dead" : même restriction, exprimée en sous-type.
  if (equipmentDef.equipTargetSubtype && candidateDef.subtype !== equipmentDef.equipTargetSubtype) return false;
  return !board.some(
    (u) => u.instanceId !== candidate.instanceId && u.attachedToInstanceId === candidate.instanceId
  );
}

/** Au moins un permanent du plateau donné peut-il recevoir cet Équipement ? Détermine si sa pose doit exiger une cible ou peut être jouée sans lien ("si possible"). */
export function hasAnyValidEquipTarget(equipmentDef: CardDefinition, board: CardInstance[]): boolean {
  return board.some((u) => canBeEquipTarget(equipmentDef, board, u));
}
