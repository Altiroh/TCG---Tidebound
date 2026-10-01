import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";

/**
 * STANDARD VERRIER — LE GRAND BANC (01/10/2026).
 *
 * Constat : un essaim dont rien ne reste. Tous les déclencheurs du banc
 * paient « jusqu'à la fin du tour » (Chef de Banc, Ramasseur, Grand Rêve) ;
 * le reste est statique (seigneurs) ou sans texte (Têtard-Fesse Δ −12).
 * Le banc s'aligne, se fait bloquer par des murs (Forteresse : 20 %) et ne
 * grandit jamais.
 *
 * Boucle visée, « le banc grossit » : chaque arrivée nourrit un
 * Cra-Poiscail qui garde ce qu'il gagne, et chaque perte refait une
 * arrivée. Coûts et statistiques de base inchangés.
 *   V1 — les trois déclencheurs gardent leur gain (`permanent: true`) ;
 *   V2 — V1 + Têtard-Fesse : « Quand il est détruit, invoquez 1 Péon
 *        Cra-Poiscail 1 / 1. » (la perte relance l'arrivée).
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

/** Même carte, mais chaque gain de ses capacités est conservé. */
function gainsConserves(id: string, labId: string, text: string): void {
  const carte = base(id);
  enregistrer({
    ...carte,
    id: labId,
    text,
    abilities: (carte.abilities ?? []).map((capacite) => ({
      ...capacite,
      effects: capacite.effects.map((effet) => (effet.type === "buff" ? ({ ...effet, permanent: true } as EffectDefinition) : effet)),
    })),
  } as CardDefinition);
}

gainsConserves(
  "cra-poiscail-chef-de-banc",
  "lab-chef-de-banc-verrier",
  "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez arrive en jeu, elle gagne +1 / +1.",
);
gainsConserves(
  "cra-poiscail-ramasseur",
  "lab-ramasseur-verrier",
  "La première fois à chaque tour que vous Brisez un Objet, il gagne +1 / +1.",
);
gainsConserves(
  "ptite-fesse-grand-reve",
  "lab-grand-reve-verrier",
  "La première fois à chaque tour qu'une autre unité Cra-Poiscail que vous contrôlez gagne de la Puissance, " +
    "P'tite Fesse, Grand Rêve gagne +1 Puissance.",
);

enregistrer({
  ...base("tetard-fesse"),
  id: "lab-tetard-verrier",
  text: "Quand il est détruit, invoquez 1 Péon Cra-Poiscail 1 / 1.",
  abilities: [
    {
      trigger: "onDeath",
      description: "Détruit : invoquez 1 Péon Cra-Poiscail.",
      effects: [{ type: "summon", target: { kind: "controllerPlayer" }, cardId: "peon-cra-poiscail" }],
    },
  ],
} as CardDefinition);
