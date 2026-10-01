import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";

/**
 * STANDARD VERRIER — LE THÉÂTRE ENGLOUTI (01/10/2026).
 *
 * Constat : le rappel (renvoyer une Marionnette en main pour la rejouer)
 * ne rapporte que des remises de coût et du filtrage — de la monnaie, pas
 * de coups. La seule boucle qui frappe est Pulcinella Gonflé (1 dégât à
 * l'arrivée, Δ +14). Pires cartes : Arlecchino des Profondeurs (Δ −12, un
 * gain jusqu'à la fin du tour), Les Coulisses Inondées (−6) et Le Théâtre
 * Englouti (−6), deux Structures qui ne paient qu'en remise ou en Raison.
 *
 * Boucle visée, « le rappel frappe » : chaque retour en coulisses porte un
 * coup, chaque retour sur scène laisse une trace. Coûts, statistiques et
 * durées inchangés.
 *   V1 — Arlecchino des Profondeurs garde son +2 Puissance ; Les Coulisses
 *        Inondées : un retour en main → 1 dégât à une Créature adverse
 *        (au lieu de la remise) ;
 *   V2 — V1 + Le Théâtre Englouti : un retour en main → 1 Raison ET 2 dégâts
 *        au Navire adverse.
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

const arlecchino = base("arlecchino-des-profondeurs");
enregistrer({
  ...arlecchino,
  id: "lab-arlecchino-verrier",
  text:
    "À son arrivée, vous pouvez renvoyer une autre unité Marionnette que vous contrôlez dans votre main. " +
    "Si vous le faites, il gagne +2 Puissance.",
  abilities: (arlecchino.abilities ?? []).map((capacite) => ({
    ...capacite,
    effects: capacite.effects.map((effet) => (effet.type === "buff" ? ({ ...effet, permanent: true } as EffectDefinition) : effet)),
  })),
} as CardDefinition);

const coulisses = base("les-coulisses-inondees");
enregistrer({
  ...coulisses,
  id: "lab-coulisses-verrier",
  text:
    "Durée : 3 tours. La première fois à chaque tour qu'une carte Marionnette que vous contrôlez revient dans " +
    "votre main, vous pouvez choisir une Créature adverse : infligez-lui 1 dégât.",
  abilities: [
    {
      ...coulisses.abilities![0]!,
      mode: "optional",
      description: "Première Marionnette revenue en main du tour : 1 dégât à une Créature adverse.",
      effects: [
        {
          type: "damage",
          target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["creature"] } },
          amount: { kind: "flat", value: 1 },
        },
      ],
    },
  ],
} as CardDefinition);

const theatre = base("le-theatre-englouti");
enregistrer({
  ...theatre,
  id: "lab-theatre-verrier",
  text:
    "Durée : 4 tours. La première fois à chaque tour qu'une unité Marionnette que vous contrôlez revient dans " +
    "votre main, récupérez 1 Raison et infligez 2 dégâts au Navire adverse.",
  abilities: [
    {
      ...theatre.abilities![0]!,
      description: "Première Marionnette revenue en main du tour : 1 Raison et 2 dégâts au Navire adverse.",
      effects: [
        ...theatre.abilities![0]!.effects,
        { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 2 } },
      ],
    },
  ],
} as CardDefinition);

/*
 * V3 — le relevé des moteurs (`engines.ts`, 12 parties) l'explique : le
 * Théâtre ne rappelle qu'UNE fois par partie. Un gain accroché au RETOUR
 * en main ne se déclenche donc presque jamais. Le gage de Verre est un
 * déclencheur que le deck tire de toute façon : ici, l'ARRIVÉE d'une
 * Marionnette — que le rappel multiplie, sans en être la condition.
 *   V3 — Arlecchino de V1 ; Les Coulisses Inondées : une Marionnette arrive
 *        → 1 dégât à une Créature adverse (une fois par tour) ; Le Théâtre
 *        Englouti : chaque Marionnette qui arrive → 1 dégât au Navire adverse.
 */
enregistrer({
  ...coulisses,
  id: "lab-coulisses-arrivee",
  text:
    "Durée : 3 tours. La première fois à chaque tour qu'une unité Marionnette arrive sous votre contrôle, " +
    "vous pouvez choisir une Créature adverse : infligez-lui 1 dégât.",
  abilities: [
    {
      trigger: "onEnterPlay",
      triggeredBy: { subtype: "marionnette" },
      oncePerTurnKey: "coulissesArrivee",
      mode: "optional",
      description: "Première Marionnette arrivée du tour : 1 dégât à une Créature adverse.",
      effects: [
        {
          type: "damage",
          target: { kind: "chosenUnit", among: { opponentOnly: true, cardTypes: ["creature"] } },
          amount: { kind: "flat", value: 1 },
        },
      ],
    },
  ],
} as CardDefinition);

enregistrer({
  ...theatre,
  id: "lab-theatre-arrivee",
  text:
    "Durée : 4 tours. Chaque fois qu'une unité Marionnette arrive sous votre contrôle, infligez 1 dégât au " +
    "Navire adverse.",
  abilities: [
    {
      trigger: "onEnterPlay",
      triggeredBy: { subtype: "marionnette" },
      description: "Une Marionnette arrive : 1 dégât au Navire adverse.",
      effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
    },
  ],
} as CardDefinition);
