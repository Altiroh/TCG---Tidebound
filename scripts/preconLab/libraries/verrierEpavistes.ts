import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

/**
 * STANDARD VERRIER — ÉPAVISTES (30/09/2026).
 *
 * Constat : les Épavistes Sabordent pour de la valeur (Ancrage, pioche,
 * récupération) mais ne frappent qu'avec des corps neutres (Crabe de Fer
 * Δ +38, Chose des Hauts-Fonds Δ +35). Bernard-l'Ermite d'Acier et le
 * Charpentier des Épaves, validés pour les Mineurs, grandissent déjà quand
 * une Structure part : la boucle existe, il lui manque la CONVERSION.
 *
 * Variantes (coûts et statistiques inchangés) :
 *   - Charpentière de Veille : une Structure part → 1 dégât au Navire adverse
 *     (au lieu de 1 Ancrage) — `lab-charpentiere-offensive`, déjà définie
 *     dans `testVerrierCartes.ts` ;
 *   - Plongeur des Épaves : il grandit aussi, et ne regarde plus que VOS
 *     Structures, comme son texte le dit (la donnée actuelle réagit aussi
 *     aux Structures adverses — divergence relevée par l'audit).
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

enregistrer({
  ...base("plongeur-des-epaves"),
  id: "lab-plongeur-verrier",
  text:
    "La première fois à chaque tour qu'une Structure que vous contrôlez est détruite ou Sabordée, il gagne " +
    "+1 Puissance et vous pouvez récupérer 1 Raison.",
  abilities: [
    {
      trigger: "onDeath",
      triggeredBy: { cardTypes: ["structure"] },
      oncePerTurnKey: "plongeurGrandit",
      description: "Une de vos Structures part : +1 Puissance, conservée.",
      effects: [
        { type: "buff", target: { kind: "self" }, attackAmount: { kind: "flat", value: 1 }, healthAmount: { kind: "flat", value: 0 }, permanent: true },
      ],
    },
    {
      trigger: "onDeath",
      mode: "optional",
      triggeredBy: { cardTypes: ["structure"] },
      oncePerTurnKey: "plongeurRecupere",
      description: "Une de vos Structures part : vous pouvez récupérer 1 Raison.",
      effects: [{ type: "reasonGain", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
    },
  ],
});

// CARBURANT — les Épavistes ne Sabordent qu'1,5 fois par partie : le moteur
// validé (Bernard, Charpentier) a de quoi payer, pas de quoi tourner.

// Levier de Lest — saborder fait tourner la main au lieu de rendre de l'Ancrage.
const levier = base("levier-de-lest");
enregistrer({
  ...levier,
  id: "lab-levier-verrier",
  text: "Brisez cet Objet et Sabordez une Structure que vous contrôlez : récupérez 1 Raison et piochez 1 carte.",
  onBreakEffects: [
    levier.onBreakEffects![0]!,
    levier.onBreakEffects![1]!,
    { type: "draw", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } },
  ],
});

// Caisses Arrimées — la Structure à 1 Raison devient une munition.
const caisses = base("caisses-arrimees");
enregistrer({
  ...caisses,
  id: "lab-caisses-verrier",
  text: (caisses.text ?? "").replace("Sabordage : récupérez 2 Ancrage.", "Sabordage : infligez 1 dégât au Navire adverse."),
  abilities: (caisses.abilities ?? []).map((ability) =>
    ability.trigger === "onSaborde"
      ? {
          ...ability,
          description: "Sabordage : 1 dégât au Navire adverse.",
          effects: [{ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }],
        }
      : ability
  ),
});

// FINISHER — chaque Structure partie devient une menace qui s'accumule.
// Carte NOUVELLE (aucune unité n'appartient en propre aux Épavistes).
const finisher = (id: string, cost: number, attack: number, health: number, perCards: number, max: number): CardDefinition => ({
  ...base("matelot-du-sans-nom"),
  id,
  name: "Le Ferrailleur des Épaves",
  cost,
  attack,
  health,
  maxCopies: 2,
  text:
    `À son arrivée, infligez au Navire adverse 1 dégât ${perCards === 1 ? "par Structure" : `par tranche de ${perCards} Structures`} ` +
    `dans votre Cimetière (maximum ${max}).`,
  abilities: [],
  onPlayEffects: [
    {
      type: "damage",
      target: { kind: "opponentPlayer" },
      amount: { kind: "graveyardCount", cardTypes: ["structure"], perCards, max },
    },
  ],
});
enregistrer(finisher("lab-ferrailleur-lent", 5, 4, 5, 2, 4));
enregistrer(finisher("lab-ferrailleur-vif", 4, 3, 4, 1, 3));
