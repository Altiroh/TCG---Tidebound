import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

/**
 * TEST VERRIER — retouches de cartes proposées par l'audit (29/09/2026),
 * enregistrées comme cartes `lab-…` le temps de la mesure : elles
 * n'existent ni dans le jeu ni en base. À charger en `--setup`.
 *
 * Chacune remplace une récompense qui ne rapporte rien par une récompense
 * qui fait tourner le moteur de son archétype, avec les primitives
 * existantes (plus `mill` et `graveyardCount`, ajoutées le même jour).
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

// ÉPAVISTES / MINEURS — le départ d'une Structure devient une menace.
enregistrer({
  ...base("charpentiere-de-veille"),
  id: "lab-charpentiere-offensive",
  text: "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite ou Sabordée, infligez 1 dégât au Navire adverse.",
  abilities: [
    {
      trigger: "onDeath",
      triggeredBy: { cardTypes: ["structure"] },
      oncePerTurnKey: "charpentiereOffensive",
      description: "Une de vos Structures part : 1 dégât au Navire adverse.",
      effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
    },
  ],
});

// À BOUT DE RAISON — la dette adverse coûte de l'Ancrage.
const marin = base("marin-aux-yeux-rouges");
enregistrer({
  ...marin,
  id: "lab-marin-dette",
  text: "À son arrivée, l'adversaire perd 1 Raison. S'il a alors 0 Raison ou moins, il perd aussi 1 Ancrage.",
  onPlayEffects: [
    ...(marin.onPlayEffects ?? []),
    { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 }, conditionOpponentReasonAtMost: 0 },
  ],
});

// THÉÂTRE — la troupe a quelque chose à rejouer.
function double(id: string, labId: string, text: string): CardDefinition {
  const carte = base(id);
  const mort = (carte.abilities ?? []).find((a) => a.trigger === "onDeath")!;
  return { ...carte, id: labId, text, abilities: [{ ...mort, trigger: "onEnterPlay" }, mort] };
}
enregistrer(double("pulcinella-gonfle", "lab-pulcinella-double", "À son arrivée et quand il est détruit, vous pouvez choisir une Créature adverse : infligez-lui 1 dégât."));
enregistrer(double("arlequin-raccommodeur", "lab-arlequin-double", "À son arrivée et quand il est détruit, récupérez 1 Ancrage."));

// DESCENTE AUX ABYSSES — la Veilleuse retient la mer au fond.
const veilleur = base("veilleur-des-profondeurs");
enregistrer({
  ...veilleur,
  id: "lab-veilleur-retient",
  text:
    "À son arrivée, si la Marée est en Tempête ou en Abysses, vous pouvez inverser son orientation. Sinon, vous " +
    "pouvez réduire de 1 tour la durée de la Marée actuelle.",
  abilities: [
    {
      trigger: "onEnterPlay",
      mode: "optional",
      condition: { tideStateIn: ["tempete", "abysses"] },
      description: "À son arrivée, en Tempête ou Abysses : vous pouvez inverser l'orientation de la Marée.",
      effects: [{ type: "tideInvertOrientation", target: { kind: "allPlayers" } }],
    },
    {
      trigger: "onEnterPlay",
      mode: "optional",
      condition: { tideStateIn: ["calme", "houle"] },
      description: "À son arrivée, en Calme ou Houle : vous pouvez réduire de 1 tour la durée de la Marée actuelle.",
      effects: [{ type: "tideReduceDuration", target: { kind: "allPlayers" }, amount: { kind: "flat", value: 1 } }],
    },
  ],
});

// CHASSE AU GROS — achever rapporte de quoi recommencer.
enregistrer({
  ...base("matelot-du-sans-nom"),
  id: "lab-depeceur-des-quais",
  name: "Dépeceur des Quais",
  attack: 2,
  health: 4,
  text: "La première fois à chaque tour qu'une unité adverse est détruite, récupérez 1 Raison.",
  abilities: [
    {
      trigger: "onDeath",
      triggeredBy: { opponentOnly: true, cardTypes: ["marin", "creature"] },
      oncePerTurnKey: "depeceurKill",
      description: "Une unité adverse est détruite : récupérez 1 Raison.",
      effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
    },
  ],
});

// LA VEILLÉE — le Cimetière qui se remplit devient dangereux.
enregistrer({
  ...base("la-marelle"),
  id: "lab-puits-aux-souvenirs",
  name: "Le Puits aux Souvenirs",
  cost: 3,
  health: 4,
  durationTurns: 4,
  visibleDuringTide: undefined,
  text: "Durée : 4 tours. Au début de votre tour, placez les 2 premières cartes de votre pioche dans votre Cimetière.",
  abilities: [
    {
      trigger: "startOfTurn",
      description: "Début de votre tour : les 2 premières cartes de votre pioche vont au Cimetière.",
      effects: [{ type: "mill", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }],
    },
  ],
});
enregistrer({
  ...base("papa-est-en-mer"),
  id: "lab-ils-sont-tous-la",
  name: "Ils sont tous là",
  cost: 5,
  attack: 4,
  health: 4,
  text: "À son arrivée, infligez au Navire adverse 1 dégât par tranche de 3 cartes Un Dead dans votre Cimetière (maximum 4).",
  abilities: [],
  onPlayEffects: [
    { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "graveyardCount", subtype: "un-dead", perCards: 3, max: 4 } },
  ],
});
