import type { ShipDefinition } from "@/game/environment/types";

/**
 * Navires principaux — le trio verrouillé dans le cadrage Notion
 * ("Collection des Navires" + fiches dédiées) plus La Religieuse, ajoutée
 * à la demande explicite de l'utilisateur alors que sa fiche Notion
 * ("Gameplay — Raison, Déraison, healing & passifs de Navires") la
 * décrit encore comme une piste non verrouillée : stats et passif sont
 * donc les valeurs "moyennes" proposées par cette note, à ajuster au
 * premier vrai playtest plutôt que gravées dans le marbre.
 *
 * NOTE — toutes les capacités activables sont désormais CÂBLÉES. La
 * fréquence "une fois par PARTIE" a sa primitive générique
 * (`activationsPerGame`, `game/state/oncePerGame.ts`), et la fenêtre
 * "après l'annonce d'une Marée" réutilise celle que le moteur ouvrait déjà
 * pour l'Ancre de Dérive (`activationWindow`). `capacityText` — le champ
 * "texte seul, rien n'est appliqué" — n'a plus d'occupant.
 *
 * Restent en texte seul certains PASSIFS qui demanderaient de distinguer
 * "gain de Raison venant d'une carte" (Cap sûr, cadrage section 16,
 * volontairement complexe) ; seuls les effets exprimables avec les champs
 * numériques ci-dessous sont réellement appliqués.
 *
 * ANCRAGE DE DÉPART, +50 % LE 21/09/2026 (17/20/24 → 26/30/36).
 *
 * Décision de RYTHME, prise sur mesure et non sur intuition. Une partie
 * durait 5,8 tours par joueur — trop peu pour voir l'effet de ses cartes.
 * Le banc d'essai dit où part l'Ancrage : 53 % en attaques, 28 % en Marée,
 * 18 % en Déraison. Les attaques dominant, seule une réserve plus grande
 * les ralentit — six leviers mesurés sur un tournoi complet, et celui-ci
 * écrase les autres (+2,2 tours par joueur, contre +0,9 pour supprimer
 * TOUS les dégâts de Marée et +0,2 pour adoucir l'entrée en Abysses).
 *
 * Les écarts entre Navires sont conservés au plus près : le Courlis reste
 * le plus fragile, le Brise-Lames le plus dur. 17 × 1,5 = 25,5, arrondi à
 * 26.
 *
 * VALEUR NON VERROUILLÉE, et DIVERGENTE de Notion, qui porte encore
 * 17/20/24 : à confirmer au playtest réel avant d'y toucher là-bas.
 * Allonger la partie ne rééquilibre rien tout seul — l'écart entre les dix
 * listes reste le même dans les six configurations mesurées ; cela rend
 * seulement leurs tours aux decks qui en ont besoin.
 */
export const SHIP_SET: ShipDefinition[] = [
  {
    id: "le-courlis",
    name: "Le Courlis",
    startingAnchor: 26,
    reasonMax: 12,
    slotCount: 4,
    illustration: "le-courlis.webp",
    text: "Profil : léger / maniable / contrôle environnemental.",
    // TIRANT LÉGER — texte remis à jour le 22/09/2026. Il nommait « un
    // effet d'Eau ou de Marée » ; les Eaux n'existent plus depuis le
    // cadrage du 2026-09-10, et le mot ne désignait donc plus rien.
    // AUCUN changement d'effet : la résistance appliquée est la même.
    passiveText:
      "Tirant léger — la première fois par tour qu'un effet de Marée devrait vous infliger des dégâts " +
      "d'Ancrage, réduisez-les de 1.",
    weaknessText: "Coque légère — les attaques directes contre votre Navire lui infligent +1 dégât.",
    // VIRAGE COURT — texte repris de la fiche Notion (22/09/2026).
    //
    // Le code portait encore l'ancien texte, celui des Eaux (« lorsqu'une
    // nouvelle Eau est révélée, vous pouvez la refuser ») : un
    // sous-système supprimé du design, donc une capacité sans déclencheur
    // ni objet. La fiche Notion, elle, avait déjà été réécrite autour de
    // l'ORIENTATION — la mécanique qui a précisément absorbé les fonctions
    // des Eaux. C'est elle qui fait foi, et c'est elle qui est appliquée
    // ici : « refuser ce que la mer apporte » y est devenu « lui faire
    // faire demi-tour ».
    //
    // « Juste avant une transition » = la fenêtre d'annonce : l'état est
    // committé, ses effets ne sont pas encore appliqués, et l'orientation
    // décide de la transition SUIVANTE.
    activatableAbility: {
      name: "Virage court",
      illustration: "courlis.webp",
      activationSound: "tide",
      text:
        "Une fois par partie, juste avant une transition de Marée, vous pouvez inverser son orientation pour " +
        "cette transition.",
      cost: {},
      activationPhases: [],
      activationWindow: "tideAnnounced",
      activationsPerGame: 1,
      onActivateEffects: [{ type: "tideInvertOrientation", target: { kind: "controllerPlayer" } }],
    },
    // Le moteur ne calcule les dégâts de Marée qu'une seule fois par tour
    // (`resolveTideTurnStep`), donc cette résistance forfaitaire équivaut
    // fidèlement à "la première fois par tour" de Tirant léger.
    resistanceByState: { tempete: 1, abysses: 1 },
    directAttackWeakness: 1,
  },
  {
    id: "lerrant",
    name: "L'Errant",
    startingAnchor: 30,
    reasonMax: 10,
    slotCount: 5,
    illustration: "errant.webp",
    text: "Profil standard : polyvalent, équilibré, sans faiblesse critique.",
    passiveText:
      "Cap sûr — la première fois par tour que vous récupérez de la Raison grâce à une carte, récupérez 1 " +
      "Raison supplémentaire (non appliqué : nécessite de distinguer les gains de Raison venant des cartes, " +
      "pas encore modélisé).",
    // Première capacité « une fois par partie » réellement câblée
    // (`activationsPerGame`), et première à s'activer DANS une fenêtre :
    // celle que le moteur ouvre déjà entre l'annonce d'une Marée et
    // l'application de ses effets. Aucun système de réaction dupliqué —
    // le Navire rejoint la file de priorité de cette fenêtre.
    activatableAbility: {
      name: "Changer de cap",
      illustration: "errant.webp",
      activationSound: "tide",
      text:
        "Une fois par partie, après qu'une Marée a été annoncée mais avant l'application de ses effets, " +
        "réduisez sa durée de 1 tour.",
      cost: {},
      // Jamais utilisées : la fenêtre remplace la phase.
      activationPhases: [],
      activationWindow: "tideAnnounced",
      activationsPerGame: 1,
      onActivateEffects: [
        { type: "tideReduceDuration", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
      ],
    },
    // Aucune faiblesse explicite.
  },
  {
    id: "le-brise-lames",
    name: "Le Brise-Lames",
    startingAnchor: 36,
    reasonMax: 8,
    slotCount: 6,
    illustration: "brise-lames.webp",
    text: "Profil : lourd / Structures / endurance.",
    passiveText:
      "Coque renforcée — la première fois à chaque tour que votre Navire devrait subir des dégâts de " +
      "Tempête, réduisez ces dégâts de 2.",
    // « Au début de votre tour » se lit ici « pendant votre PREMIÈRE Phase
    // principale » : le moteur n'a pas de fenêtre d'action à l'entame — la
    // Marée y frappe avant que le joueur ne reprenne la main. La Phase
    // principale est le premier moment où il peut agir, et la protection
    // vaut alors pour tout le reste de son tour, y compris la Marée du
    // tour suivant si elle est reportée.
    activatableAbility: {
      name: "Tenir la ligne",
      illustration: "brise-lames.webp",
      activationSound: "protect",
      text:
        "Une fois par partie, au début de votre tour, jusqu'à la fin de ce tour, vos Structures ne peuvent " +
        "pas être détruites par des effets environnementaux.",
      cost: {},
      activationPhases: ["mainPhase"],
      activationsPerGame: 1,
      onActivateEffects: [
        {
          type: "protectFromDestruction",
          target: { kind: "controllerPlayer" },
          filter: { cardTypes: ["structure"] },
          // « Effet environnemental » = ce que le moteur impute à la Marée
          // (`DestructionCause.tide`) : destruction directe par l'état
          // courant (`tideAffinity.destroyed`) comme dégâts de Marée
          // devenus mortels.
          protectedFrom: ["tide"],
        },
      ],
    },
    weaknessText: "Équipage à bout — chaque fois que vous entrez dans les Abysses, perdez 1 Raison supplémentaire.",
    resistanceByState: { tempete: 2 },
    reasonWeaknessByState: { abysses: 1 },
  },
  {
    id: "la-religieuse",
    name: "La Religieuse",
    startingAnchor: 30,
    reasonMax: 10,
    slotCount: 5,
    illustration: "la-religieuse.webp",
    text: "Profil : healing / contrôle — survivre devient un moteur de jeu plutôt qu'une simple défense.",
    // Piste Notion "Gameplay — Raison, Déraison, healing & passifs de Navires" (2026-09-12), pas verrouillée :
    // ni les stats ni ce passif ne sont figés tant qu'un playtest n'a pas validé le rythme de la Déraison.
    // Pénitence retenue plutôt qu'Absolution (l'autre piste de passif de la note).
    passiveText:
      "Pénitence — la première fois par tour que vous devriez subir des dégâts d'Ancrage à cause de votre " +
      "Déraison, réduisez ces dégâts de 1.",
    // RÉPARATION D'URGENCE (décision du 22/09/2026). La Religieuse était le
    // seul Navire sans capacité activable ; celle-ci sert son profil —
    // survivre devient un moteur de jeu — sans rien inventer au moteur :
    // un coût en Raison, un gain d'Ancrage, une fois par tour.
    //
    // Échange VOLONTAIREMENT neutre (2 contre 2) : c'est la seule
    // conversion Raison → Ancrage du jeu, et ce qu'elle apporte n'est pas
    // un gain sec mais un CHOIX — payer sa coque avec le tour qu'on
    // n'aura pas joué. Sans limite de partie : c'est un robinet, pas un
    // coup d'éclat.
    activatableAbility: {
      name: "Réparation d'urgence",
      illustration: "religieuse.webp",
      activationSound: "heal",
      text: "Une fois par tour, pendant une Phase principale, dépensez 2 Raison pour récupérer 2 Ancrage.",
      cost: { reason: 2 },
      activationPhases: ["mainPhase", "mainPhase2"],
      onActivateEffects: [{ type: "heal", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
    },
    deraisonDamageReduction: 1,
  },
  {
    // Cinquième Navire du roster de prototype (Notion "Collection des
    // Navires" + fiche "💥 Le Goliath", 2026-09-18). Ni passif ni faiblesse
    // au prototype : toute son identité tient dans son Canon.
    id: "le-goliath",
    name: "Le Goliath",
    startingAnchor: 30,
    reasonMax: 10,
    slotCount: 5,
    illustration: "goliath.webp",
    text: "Profil : moyen / artillerie / pression de board.",
    // Premier Navire dont la capacité est réellement CÂBLÉE (les quatre
    // autres sont "une fois par partie", fréquence encore non modélisée).
    // Geste en deux temps décidé le 18/09/2026 : la Raison se paie pour
    // DÉCOUVRIR le canon, pas pour tirer — un canon armé et non tiré a
    // coûté sa Raison pour rien.
    activatableAbility: {
      name: "Canon de proue",
      illustration: "goliath.webp",
      text:
        "Une fois par tour, pendant une Phase principale, dépensez 2 Raison pour armer le Canon de proue. " +
        "Pendant votre Phase de combat, vous pouvez alors tirer : infligez 2 dégâts à un permanent adverse " +
        "ou au Navire adverse, selon les mêmes règles de ciblage qu'une attaque. Le tir ne provoque aucune " +
        "riposte et referme le canon ; il ne consomme l'attaque d'aucune unité.",
      cost: { reason: 2 },
      activationPhases: ["mainPhase", "mainPhase2"],
      armedShot: {
        phases: ["combatPhase"],
        targeting: "attackRules",
        // Valeur de prototype (fiche Notion : « 2 dégâts ; à confirmer par playtest »).
        effects: [{ type: "damage", target: { kind: "shotTarget" }, amount: { kind: "flat", value: 2 } }],
      },
    },
  },
  {
    // Sixième Navire (demande du 24/09/2026). Une coque de verre : aucune
    // armure, mais une pointe qui touche PARTOUT. Stats de prototype —
    // celles de la coque moyenne (L'Errant, Le Goliath) — et ni passif ni
    // faiblesse, comme Le Goliath à son entrée : toute son identité tient
    // dans sa capacité, et c'est elle que le labo a mesurée.
    id: "la-verriere",
    name: "La Verrière",
    startingAnchor: 30,
    reasonMax: 10,
    slotCount: 5,
    text: "Profil : précision / contrôle fin — une pointe qui touche partout, y compris chez soi.",
    // PIQUE À GLACE — la seule capacité qui vise N'IMPORTE QUOI, son propre
    // camp compris : achever une unité blessée, briser une Structure,
    // gratter la coque adverse, ou s'infliger 1 dégât pour déclencher une
    // carte qui aime être blessée (un Un Dead qui doit mourir, une
    // Structure qu'on veut voir Sabordée). C'est un EFFET, pas une attaque :
    // Garde ne la détourne pas, et rien ne riposte.
    activatableAbility: {
      name: "Pique à Glace",
      // Ni son d'activation ni illustration de hublot : c'est l'impact qu'on
      // entend (celui de tout dégât d'effet), et l'illustration est en
      // production.
      text:
        "Une fois par tour, pendant une Phase principale, dépensez 1 Raison : infligez 1 dégât à n'importe " +
        "quelle cible — une unité ou une Structure, alliée ou adverse, ou un Navire, le vôtre compris.",
      cost: { reason: 1 },
      activationPhases: ["mainPhase", "mainPhase2"],
      targeting: "anyTarget",
      onActivateEffects: [{ type: "damage", target: { kind: "shotTarget" }, amount: { kind: "flat", value: 1 } }],
    },
  },
];

export const SHIP_DATABASE: ReadonlyMap<string, ShipDefinition> = new Map(
  SHIP_SET.map((ship) => [ship.id, ship])
);

export function getShipDefinition(shipId: string): ShipDefinition {
  const ship = SHIP_DATABASE.get(shipId);
  if (!ship) throw new Error(`Navire inconnu: ${shipId}`);
  return ship;
}
