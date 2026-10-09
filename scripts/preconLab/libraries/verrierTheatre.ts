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

// Les Coulisses Inondées ont été SUPPRIMÉES du catalogue le 01/10/2026 :
// leurs variantes (`lab-coulisses-verrier`, `lab-coulisses-arrivee`) sont
// retirées, et les listes archivées V1, V3 et V4 ne se rejouent plus.

const theatre = base("le-theatre-englouti");
enregistrer({
  ...theatre,
  id: "lab-theatre-verrier",
  text:
    "Durée : 4 tours de table. La première fois à chaque tour qu'une unité Marionnette que vous contrôlez revient dans " +
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
  ...theatre,
  id: "lab-theatre-arrivee",
  text:
    "Durée : 4 tours de table. Chaque fois qu'une unité Marionnette arrive sous votre contrôle, infligez 1 dégât au " +
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

/*
 * V4 — diagnostic du pilote (01/10/2026) : le bot VOIT le rejeu d'un rappel
 * (`scoreAction`, depuis le 29/09) ; mais en Phase principale 2 il est
 * presque toujours en Déraison (−1 à −4). Rappeler coûte 2 à 3 Raison, puis
 * rejouer coûte encore : le moteur du Théâtre est trop cher pour tourner.
 * Le gage de Verre — un déclencheur GRATUIT — appliqué au rappel : les
 * outils de rappel remboursent le rejeu.
 *   V4 — V1 + Le Masque Fendu : « …renvoyez…, puis récupérez 2 Raison »
 *        (au lieu de piocher/défausser) ; La Clochette du Rappel :
 *        « …renvoyez… Récupérez 2 Raison » (au lieu de la remise).
 */
const masque = base("le-masque-fendu");
enregistrer({
  ...masque,
  id: "lab-masque-verrier",
  text: "Brisez cet Objet : renvoyez une unité Marionnette que vous contrôlez dans votre main, puis récupérez 2 Raison.",
  onBreakEffects: [
    masque.onBreakEffects![0]!,
    { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
  ],
} as CardDefinition);

const clochette = base("la-clochette-du-rappel");
enregistrer({
  ...clochette,
  id: "lab-clochette-verrier",
  text: "Brisez cet Objet : renvoyez une carte Marionnette que vous contrôlez dans votre main. Récupérez 2 Raison.",
  onBreakEffects: [
    clochette.onBreakEffects![0]!,
    { type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } },
  ],
} as CardDefinition);
