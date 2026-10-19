import type { CardDefinition, TriggeredAbility } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import { chaineLibre } from "@/game/cards/chaineLibre";

/**
 * LOT 19 — Les Chairs Dévoyées (Notion « Lot 19 — Les Chairs Dévoyées »,
 * 27 cartes validées le 15/10/2026, plus Zone infecté et Stop le
 * 16/10/2026, plus la variante ABYSSALE d'Échec Numéro Treize).
 *
 * Insectes, Mutants et Homoncules : un pool qui se nourrit de ses propres
 * pertes. Trois moteurs, tous génériques :
 *
 *  - LA COQUE SE RECOUD : morts, Sangsue et Sabordages rendent de l'Ancrage
 *    au Navire — et Marin infecté grandit à chaque fois
 *    (`onShipHealed`, fait de joueur) ;
 *  - LA CHAIR SE SACRIFIE : Sabordez une Créature alliée pour un gain
 *    (Aberration Vorace, Petit Chirurgien) ;
 *  - LA COUVÉE : des Larves 1/1 (jeton `larve`) qui nourrissent les deux
 *    premiers.
 *
 * VOCABULAIRE : le Notion écrit « PV » pour la coque ; le jeu l'appelle
 * Ancrage. Les textes ci-dessous disent donc « Ancrage » là où Notion dit
 * « PV » (mêmes nombres, même sens) — reporté dans Notion le 16/10/2026.
 * « Chaine » est corrigé en « Chaîne », et une durée s'écrit en tours de
 * table (Zone infecté).
 *
 * Les cartes sont réparties dans les boosters EXISTANTS (B1 Défaut, B2
 * Poissons pas frais, B3 Étrangeté sous-marine, B4 La mutation mondiale —
 * `game/boosters/pools.ts`) : le lot n'a pas de sachet à lui.
 */
export const LOT19_CHAIRS_DEVOYEES = "lot-19-chairs-devoyees";

const UNITES = ["marin", "creature"] as const;
const flat = (value: number) => ({ kind: "flat" as const, value });
const soinNavire = (value: number): EffectDefinition => ({ type: "heal", target: { kind: "controllerPlayer" }, amount: flat(value) });

function chair(def: Omit<CardDefinition, "setCode">): CardDefinition {
  return { ...def, setCode: LOT19_CHAIRS_DEVOYEES };
}

/** « À sa mort — … » : la carte elle-même meurt (détruite OU Sabordée : le texte ne distingue pas). */
function aSaMort(description: string, effects: EffectDefinition[], extra: Partial<TriggeredAbility> = {}): TriggeredAbility {
  return { trigger: "onDeath", description, effects, ...extra };
}

/** « Une Créature alliée » : une Créature de votre plateau. */
const CREATURE_ALLIEE = { kind: "chosenUnit" as const, among: { cardTypes: ["creature" as const] } };
/** « Une Créature alliée » qu'on Sabordera : jamais la carte qui arrive elle-même. */
const AUTRE_CREATURE_ALLIEE = { kind: "chosenUnit" as const, among: { cardTypes: ["creature" as const], excludeSource: true } };

export const LOT19_SET: CardDefinition[] = [
  // --- Insectes ------------------------------------------------------------
  chair({
    id: "larve-de-cale",
    name: "Larve de Cale",
    type: "creature",
    subtypes: ["insecte"],
    cost: 1,
    attack: 1,
    health: 1,
    maxCopies: 3,
    text: "À sa mort — Votre Navire récupère 1 Ancrage.",
    abilities: [aSaMort("À sa mort : votre Navire récupère 1 Ancrage.", [soinNavire(1)])],
  }),
  chair({
    id: "moucheron-sanguin",
    name: "Moucheron Sanguin",
    type: "creature",
    subtypes: ["insecte"],
    cost: 1,
    attack: 2,
    health: 1,
    maxCopies: 3,
    qualifications: [{ id: "sangsue" }],
    text: "Sangsue.",
  }),
  chair({
    id: "mante-devoreuse",
    name: "Mante Dévoreuse",
    type: "creature",
    subtypes: ["insecte"],
    cost: 3,
    attack: 3,
    health: 2,
    maxCopies: 3,
    qualifications: [{ id: "coup-de-grace" }],
    text: "Coup de grâce.",
  }),
  chair({
    id: "couveuse-difforme",
    name: "Couveuse Difforme",
    type: "creature",
    subtypes: ["insecte"],
    cost: 3,
    attack: 1,
    health: 4,
    maxCopies: 2,
    text: "À la fin de votre tour — Invoquez une Larve 1/1.",
    abilities: [
      {
        trigger: "endOfTurn",
        description: "Fin de votre tour : invoquez une Larve 1/1.",
        effects: [{ type: "summon", target: { kind: "controllerPlayer" }, cardId: "larve" }],
      },
    ],
  }),
  chair({
    id: "necrophage-des-fonds",
    name: "Nécrophage des Fonds",
    type: "creature",
    subtypes: ["insecte", "mutant"],
    cost: 2,
    attack: 2,
    health: 2,
    maxCopies: 3,
    text: "Quand une autre Créature alliée meurt, votre Navire récupère 1 Ancrage.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["creature"] },
        description: "Une autre Créature alliée meurt : votre Navire récupère 1 Ancrage.",
        effects: [soinNavire(1)],
      },
    ],
  }),
  chair({
    id: "essaim-vorace",
    name: "Essaim Vorace",
    type: "creature",
    subtypes: ["insecte"],
    cost: 3,
    attack: 1,
    health: 1,
    maxCopies: 3,
    text: "Quand il arrive — Invoquez deux Larves 1/1.",
    // Aucune décision : l'invocation se fait à la pose, dans la limite des emplacements libres.
    onPlayEffects: [{ type: "summon", target: { kind: "controllerPlayer" }, cardId: "larve", count: 2 }],
  }),
  chair({
    id: "parasite-ecarlate",
    name: "Parasite Écarlate",
    type: "creature",
    subtypes: ["insecte"],
    cost: 2,
    attack: 2,
    health: 1,
    maxCopies: 3,
    qualifications: [{ id: "sangsue" }],
    text: "Sangsue. À sa mort — Votre Navire récupère 1 Ancrage.",
    abilities: [aSaMort("À sa mort : votre Navire récupère 1 Ancrage.", [soinNavire(1)])],
  }),
  chair({
    id: "reine-des-charognes",
    name: "Reine des Charognes",
    type: "creature",
    subtypes: ["insecte", "volatile"],
    cost: 6,
    attack: 4,
    health: 5,
    maxCopies: 2,
    text: "Quand une autre unité alliée meurt, mettez +1 / +1 sur une autre unité.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: [...UNITES] },
        // Le joueur désigne l'unité qui reçoit le +1 / +1 (ou passe) ; « une
        // autre unité » : n'importe laquelle sauf la Reine, des deux côtés —
        // le texte ne la restreint pas à votre plateau.
        mode: "optional",
        description: "Une autre unité alliée meurt : mettez +1 / +1 sur une autre unité.",
        effects: [
          {
            type: "buff",
            target: { kind: "chosenUnit", among: { unitsOnly: true, excludeSource: true, sameController: false } },
            amount: flat(1),
            permanent: true,
          },
        ],
      },
    ],
  }),
  chair({
    id: "marin-infecte",
    name: "Marin infecté",
    type: "creature",
    subtypes: ["insecte", "mutant"],
    cost: 3,
    attack: 2,
    health: 2,
    maxCopies: 3,
    text: "Quand votre Navire récupère de l'Ancrage, gagne +1/+1 permanent.",
    abilities: [
      {
        // Fait de joueur (`onShipHealed`) : un effet de soin comme la Sangsue.
        trigger: "onShipHealed",
        description: "Votre Navire récupère de l'Ancrage : +1 / +1, conservé.",
        effects: [{ type: "buff", target: { kind: "self" }, amount: flat(1), permanent: true }],
      },
    ],
  }),

  // --- Mutants -------------------------------------------------------------
  chair({
    id: "aberration-vorace",
    name: "Aberration Vorace",
    type: "creature",
    subtypes: ["mutant", "homoncule"],
    cost: 4,
    attack: 4,
    health: 3,
    maxCopies: 3,
    text: "À son arrivée — Sabordez une Créature alliée : gagne +2/+2 permanent.",
    // Le Sabordage est le COÛT du bonus : sans Créature à Saborder, rien ; le
    // joueur désigne laquelle, ou passe (règle des effets d'arrivée).
    onPlayEffects: [
      { type: "saborde", target: AUTRE_CREATURE_ALLIEE },
      { type: "buff", target: { kind: "self" }, amount: flat(2), permanent: true },
    ],
  }),
  chair({
    id: "devoreur-de-moelle",
    name: "Dévoreur de Moelle",
    type: "creature",
    subtypes: ["mutant", "insecte"],
    cost: 5,
    attack: 4,
    health: 4,
    maxCopies: 2,
    qualifications: [{ id: "sangsue" }, { id: "carnage" }],
    text: "Sangsue. Carnage.",
  }),
  chair({
    id: "echec-numero-treize",
    name: "Échec Numéro Treize",
    type: "creature",
    subtypes: ["mutant"],
    cost: 3,
    attack: 3,
    health: 3,
    maxCopies: 3,
    text: "À la fin de votre tour — Infligez-lui 1 dégât et récupérez 1 Ancrage.",
    abilities: [
      {
        trigger: "endOfTurn",
        description: "Fin de votre tour : il subit 1 dégât, vous récupérez 1 Ancrage.",
        effects: [{ type: "damage", target: { kind: "self" }, amount: flat(1) }, soinNavire(1)],
      },
    ],
  }),
  chair({
    // Variante ABYSSALE (15/10/2026) : prototype qui se consume pour réparer
    // le Navire. Pool Abyssal du slot Profondeur de La mutation mondiale.
    id: "echec-numero-treize-abyssal",
    name: "Échec Numéro Treize",
    type: "creature",
    subtypes: ["mutant"],
    variant: "abyssale",
    cost: 3,
    attack: 3,
    health: 3,
    maxCopies: 1,
    text: "À la fin de votre tour — Infligez-lui 1 dégât. Votre Navire récupère 2 Ancrage.",
    abilities: [
      {
        trigger: "endOfTurn",
        description: "Fin de votre tour : il subit 1 dégât, votre Navire récupère 2 Ancrage.",
        effects: [{ type: "damage", target: { kind: "self" }, amount: flat(1) }, soinNavire(2)],
      },
    ],
  }),
  chair({
    id: "masse-tumorale",
    name: "Masse Tumorale",
    type: "creature",
    subtypes: ["mutant", "homoncule"],
    cost: 5,
    attack: 2,
    health: 6,
    maxCopies: 2,
    text: "Quand une Créature alliée meurt, gagne +1 Puissance permanent.",
    abilities: [
      {
        trigger: "onDeath",
        triggeredBy: { cardTypes: ["creature"] },
        description: "Une Créature alliée meurt : +1 Puissance, conservé.",
        effects: [{ type: "buff", target: { kind: "self" }, attackAmount: flat(1), healthAmount: flat(0), permanent: true }],
      },
    ],
  }),
  chair({
    id: "le-parfait-rate",
    name: "Le Parfait Raté",
    type: "creature",
    subtypes: ["mutant", "homoncule"],
    cost: 7,
    attack: 6,
    health: 6,
    maxCopies: 1,
    qualifications: [{ id: "sangsue" }],
    text: "Sangsue. À son arrivée — Votre Navire perd 3 Ancrage.",
    // Une contrepartie : imposée à la pose (`arrivalRule.ts`).
    onPlayEffects: [{ type: "damage", target: { kind: "controllerPlayer" }, amount: flat(3) }],
  }),

  // --- Homoncules ----------------------------------------------------------
  chair({
    id: "homoncule-recousu",
    name: "Homoncule Recousu",
    type: "creature",
    subtypes: ["homoncule"],
    cost: 2,
    attack: 1,
    health: 3,
    maxCopies: 3,
    text: "À son arrivée — Récupérez une Créature de coût 1 du Cimetière.",
    // « du Cimetière » : le vôtre ; la carte revient en main.
    onPlayEffects: [
      { type: "moveGraveyardCardToHand", target: { kind: "controllerPlayer" }, filter: { cardTypes: ["creature"], maxCost: 1 } },
    ],
  }),
  chair({
    id: "petit-chirurgien",
    name: "Petit Chirurgien",
    type: "creature",
    subtypes: ["homoncule"],
    cost: 3,
    attack: 2,
    health: 3,
    maxCopies: 3,
    text: "À son arrivée — Sabordez une Créature alliée : piochez 2.",
    onPlayEffects: [
      { type: "saborde", target: AUTRE_CREATURE_ALLIEE },
      { type: "draw", target: { kind: "controllerPlayer" }, amount: flat(2) },
    ],
  }),
  chair({
    id: "experience-sans-yeux",
    name: "Expérience Sans Yeux",
    type: "creature",
    subtypes: ["homoncule"],
    cost: 2,
    attack: 2,
    health: 1,
    maxCopies: 3,
    text: "À sa mort — Piochez 1.",
    abilities: [aSaMort("À sa mort : piochez 1 carte.", [{ type: "draw", target: { kind: "controllerPlayer" }, amount: flat(1) }])],
  }),

  // --- Autres créatures ----------------------------------------------------
  chair({
    id: "pigeon-delirant",
    name: "Pigeon Délirant",
    type: "creature",
    subtypes: ["volatile"],
    cost: 1,
    attack: 1,
    health: 1,
    maxCopies: 3,
    text: "Sabordez cette Créature et récupérez 3 Ancrage.",
    // Le Sabordage est l'action de jeu (`saborder`) : il réveille `onSaborde`.
    abilities: [{ trigger: "onSaborde", description: "Sabordage : récupérez 3 Ancrage.", effects: [soinNavire(3)] }],
  }),
  chair({
    id: "crabe-transfuseur",
    name: "Crabe Transfuseur",
    type: "creature",
    subtypes: ["crustace"],
    cost: 2,
    attack: 1,
    health: 3,
    maxCopies: 3,
    text: "Une fois par tour — Infligez 1 dégât à une Créature alliée. Votre Navire récupère 2 Ancrage.",
    // Capacité ACTIVÉE (bouton « Activer »), sans coût en Raison : la Créature blessée est le prix.
    activatableOncePerTurn: {
      cost: {},
      effects: [{ type: "damage", target: CREATURE_ALLIEE, amount: flat(1) }, soinNavire(2)],
    },
  }),
  chair({
    id: "poisson-bombe",
    name: "Poisson-Bombe",
    type: "creature",
    subtypes: ["poisson"],
    cost: 2,
    attack: 1,
    health: 1,
    maxCopies: 3,
    text: "À sa mort — Infligez 2 dégâts à une Créature adverse.",
    abilities: [
      aSaMort(
        "À sa mort : 2 dégâts à une Créature adverse.",
        [{ type: "damage", target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["creature"] } }, amount: flat(2) }],
        { mode: "optional" }
      ),
    ],
  }),
  chair({
    id: "mouette-gangrenee",
    name: "Mouette Gangrenée",
    type: "creature",
    subtypes: ["volatile"],
    cost: 3,
    attack: 2,
    health: 2,
    maxCopies: 2,
    qualifications: [{ id: "sangsue" }, { id: "rafale" }],
    text: "Sangsue. Rafale.",
  }),

  // --- Équipement, Structure, Objets, Anomalie -----------------------------
  chair({
    id: "scie-de-dissection",
    name: "Scie de Dissection",
    type: "equipement",
    cost: 2,
    // Notion ne donne pas de Résistance (« — ») : la Scie n'en apporte pas au porteur.
    health: 0,
    maxCopies: 3,
    // Un Équipement ne porte pas de qualification : il la CONFÈRE.
    equipGrantsBuff: { attackAmount: 1 },
    equipGrantsQualifications: [{ id: "sangsue" }],
    text: "Le porteur gagne +1 Puissance et Sangsue.",
    onPlayEffects: [{ type: "attachEquipment", target: { kind: "chosenUnit" } }],
  }),
  chair({
    id: "cuve-de-regeneration",
    name: "Cuve de Régénération",
    type: "structure",
    cost: 3,
    // Notion ne donne ni Résistance ni durée (« — ») : une Structure en a
    // toujours une. 3 est PROVISOIRE (signalé dans Notion, à trancher) ; sans
    // durée annoncée, la Cuve reste en jeu tant qu'on ne la détruit pas.
    health: 3,
    maxCopies: 2,
    text: "À votre début de tour — Votre Navire récupère 1 Ancrage.",
    abilities: [{ trigger: "startOfTurn", description: "Début de votre tour : votre Navire récupère 1 Ancrage.", effects: [soinNavire(1)] }],
  }),
  chair({
    id: "gateau-garnis",
    name: "Gâteau garnis",
    type: "objet",
    cost: 3,
    maxCopies: 3,
    chaine: true,
    text: "Chaîne — Bloquez l'attaque adverse avec une unité, elle gagne +1/+1.",
    abilities: [
      {
        // L'unité désignée (une des vôtres) prend le coup à la place de la
        // cible déclarée — Navire compris. Le +1 / +1 reste : le texte ne
        // donne pas de durée (même lecture que On joue aux morts, Lot 18).
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        description: "Gâteau garnis : une de vos unités bloque l'attaque et gagne +1 / +1.",
        effects: [
          { type: "blockIncomingAttack", target: { kind: "chosenUnit", among: { unitsOnly: true } } },
          { type: "buff", target: { kind: "chosenUnit", among: { unitsOnly: true } }, amount: flat(1), permanent: true },
        ],
      },
    ],
  }),
  chair({
    id: "greffe-instable",
    name: "Greffe Instable",
    type: "objet",
    cost: 2,
    maxCopies: 3,
    text: "Chaîne — Une Créature alliée gagne +3 Puissance ce tour et subit 1 dégât.",
    ...chaineLibre("Greffe Instable : une Créature alliée gagne +3 Puissance ce tour et subit 1 dégât.", [
      { type: "buff", target: CREATURE_ALLIEE, attackAmount: flat(3), healthAmount: flat(0), duration: "endOfTurn" },
      { type: "damage", target: CREATURE_ALLIEE, amount: flat(1) },
    ]),
  }),
  chair({
    id: "pluie-de-chair",
    name: "Pluie de Chair",
    type: "anomalie",
    // Résolution immédiate : part au Cimetière, n'occupe pas de Slot.
    permanent: false,
    cost: 5,
    maxCopies: 2,
    text: "Infligez 2 dégâts à toutes les Créatures. Votre Navire récupère 2 Ancrage.",
    onPlayEffects: [
      { type: "damage", target: { kind: "allUnits" }, filter: { cardTypes: ["creature"] }, amount: flat(2) },
      soinNavire(2),
    ],
  }),
  chair({
    id: "serum-de-mauvaise-vie",
    name: "Sérum de Mauvaise Vie",
    type: "objet",
    cost: 0,
    maxCopies: 3,
    text: "Chaîne — Votre Navire récupère 3 Ancrage.",
    ...chaineLibre("Sérum de Mauvaise Vie : votre Navire récupère 3 Ancrage.", [soinNavire(3)]),
  }),
  chair({
    id: "zone-infecte",
    name: "Zone infecté",
    type: "objet",
    cost: 2,
    maxCopies: 2,
    // « case » = emplacement : la même condamnation que les cartes de plateau du Lot 18.
    text: "Chaîne — Bloquez une case adverse pendant 2 tours de table.",
    ...chaineLibre("Zone infecté : un emplacement adverse est bloqué pendant 2 tours de table.", [
      { type: "condemnSlot", target: { kind: "opponentPlayer" }, tableTurns: 2, cardId: "zone-infecte" },
    ]),
  }),
  chair({
    id: "stop",
    name: "Stop",
    type: "objet",
    cost: 2,
    maxCopies: 2,
    chaine: true,
    text: "Chaîne — Lorsqu'un adversaire attaque, annulez sa phase de combat.",
    abilities: [
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        description: "Stop : l'attaque n'a pas lieu, et la Phase de combat adverse s'arrête.",
        effects: [{ type: "cancelCombatPhase", target: { kind: "opponentPlayer" } }],
      },
    ],
  }),
];
