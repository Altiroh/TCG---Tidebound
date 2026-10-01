import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";

/**
 * STANDARD VERRIER — À BOUT DE RAISON (01/10/2026).
 *
 * Constat : le deck draine la Raison adverse, mais une Raison perdue pendant
 * VOTRE tour remonte à l'entame du sien : le drain ne frappe presque
 * jamais. Les cartes de drain pur font perdre (Cloche Immergée Δ −10, Le
 * Rôle d'Équipage −8, Ponton aux Cloches −7) ; ce sont les corps qui
 * gagnent.
 *
 * Boucle visée, « la dette frappe » : chaque drain qui pousse l'adversaire
 * à 0 Raison ou moins lui coûte aussitôt de l'Ancrage — le drain devient un
 * coup. Primitive existante (`conditionOpponentReasonAtMost`). Coûts,
 * statistiques et durées inchangés ; cartes propres à ce deck.
 *   V1 — Marin aux Yeux Rouges, Ponton aux Cloches, Le Rôle d'Équipage :
 *        « …Puis, si l'adversaire a 0 Raison ou moins, il perd 1 Ancrage. »
 *   V2 — même chose, 2 Ancrage.
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

const coup = (ancrage: number) =>
  ({ type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: ancrage }, conditionOpponentReasonAtMost: 0 }) as EffectDefinition;
const suffixe = (ancrage: number) => ` Puis, si l'adversaire a 0 Raison ou moins, il perd ${ancrage} Ancrage.`;

for (const ancrage of [1, 2]) {
  const marin = base("marin-aux-yeux-rouges");
  enregistrer({
    ...marin,
    id: `lab-marin-dette-${ancrage}`,
    text: marin.text + suffixe(ancrage),
    onPlayEffects: [...(marin.onPlayEffects ?? []), coup(ancrage)],
  } as CardDefinition);

  for (const id of ["ponton-aux-cloches", "le-role-dequipage"]) {
    const carte = base(id);
    enregistrer({
      ...carte,
      id: `lab-${id}-dette-${ancrage}`,
      text: carte.text + suffixe(ancrage),
      abilities: (carte.abilities ?? []).map((capacite) => ({ ...capacite, effects: [...capacite.effects, coup(ancrage)] })),
    } as CardDefinition);
  }
}
