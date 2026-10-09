import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { DECK_EPAVISTES } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";

/**
 * ÉPAVISTES — un moteur qui tourne, et qui ne gagne rien (29/09/2026).
 *
 * Audit : le deck saborde (2,9 Sabordages par partie, le plus haut du
 * rayon), mais presque tout ce qu'il en tire est de l'Ancrage ou du
 * filtrage — 5,6 dégâts par partie, 3,9 unités posées. Aucune carte du
 * catalogue ne transforme un Sabordage en dégâts. Variantes de LISTE,
 * plus une variante de TEXTE mesurée pour information seulement.
 * « lourds, +Cage/Étau » (49 %, 2,1 Sabordages par partie) est devenue la
 * liste du préconstruit le 29/09/2026 ; « corps lourds » (57 %) sabordait
 * deux fois moins. La variante de texte n'apportait qu'un point :
 *
 *   npx tsx scripts/preconLab/lab.ts --setup scripts/preconLab/libraries/epavistes.ts \
 *     --lib scripts/preconLab/libraries/epavistes.ts --field scripts/preconLab/libraries/lot15.ts --games 60
 *
 * Importé comme `--setup`, ce module enregistre des cartes `lab-…` qui
 * n'existent que le temps de la mesure.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const atelier = getCardDefinition("atelier-de-calfatage");
db.set("lab-atelier-offensif", {
  ...atelier,
  id: "lab-atelier-offensif",
  text: "Durée : 4 tours de table. La première fois à chaque tour qu'une autre Structure que vous contrôlez est Sabordée, infligez 1 dégât au Navire adverse.",
  abilities: (atelier.abilities ?? []).map((ability) =>
    ability.trigger === "onSaborde"
      ? { ...ability, effects: [{ type: "damage" as const, target: { kind: "opponentPlayer" as const }, amount: { kind: "flat" as const, value: 1 } }] }
      : ability
  ),
});

/** La liste d'AVANT la révision, figée ici pour que la mesure se rejoue. */
const E: DeckList = {
  ...DECK_EPAVISTES,
  cardIds: Object.entries({
    "charpentier-des-epaves": 3,
    "mecanicien-aux-mains-noires": 2,
    "charpentiere-de-veille": 2,
    "wood-vy": 2,
    "matelot-du-sans-nom": 2,
    "caisses-arrimees": 3,
    "tas-de-bouts-de-bois": 3,
    "caisse-des-dernieres-planches": 3,
    "atelier-de-calfatage": 2,
    "levier-de-lest": 2,
    "grappin-de-recuperation": 3,
    "cloison-etanche": 2,
    "planche-de-fortune": 2,
    "journal-de-bord": 1,
  }).flatMap(([id, n]) => Array<string>(n).fill(id)),
};

function variante(nom: string, retirer: Record<string, number>, ajouter: Record<string, number>, base: DeckList = E): DeckList {
  const reste = { ...retirer };
  const ids = base.cardIds.filter((id) => ((reste[id] ?? 0) > 0 ? ((reste[id]! -= 1), false) : true));
  for (const [id, n] of Object.entries(reste)) if (n > 0) throw new Error(`${nom} : ${id} manque (${n})`);
  for (const [id, n] of Object.entries(ajouter)) for (let i = 0; i < n; i += 1) ids.push(id);
  if (ids.length !== base.cardIds.length) throw new Error(`${nom} : ${ids.length} cartes`);
  return { ...base, id: `lab-epavistes-${nom}`, name: `Épavistes [${nom}]`, cardIds: ids };
}

/** Contre le thème (Planche, Radeau « sans avoir été détruit »), hors thème (Tas : Cra-Poiscail), peu joué (Journal). */
const HORS_SUJET = { "planche-de-fortune": 2, "journal-de-bord": 1, "tas-de-bouts-de-bois": 3 };
const CORPS = { "matelot-du-sans-nom": 1, "chose-des-hauts-fonds": 3, "crabe-de-fer": 3, "treuil-rouille": 2 };

const corps = variante("corps", HORS_SUJET, CORPS);

export const LIBRARY: DeckList[] = [
  { ...E, id: "lab-epavistes-avant", name: "Épavistes [avant le 29/09]" },
  corps,
  variante("corps+ermites", HORS_SUJET, { ...CORPS, "crabe-de-fer": 0, "bernard-lermite-dacier": 3 }),
  variante("corps lourds", { "grappin-de-recuperation": 2 }, {
    "caisse-des-dernieres-planches-abyssal": 1,
  }, corps),
  variante("corps+atelier offensif (texte)", { "atelier-de-calfatage": 2 }, { "lab-atelier-offensif": 2 }, corps),
];

const lourds = LIBRARY.find((d) => d.name === "Épavistes [corps lourds]")!;
/** Deux compromis qui rendent des Structures au deck, pour garder le Sabordage au centre. */
LIBRARY.push(
  variante("lourds, +Tas", { "crabe-de-fer": 3 }, { "tas-de-bouts-de-bois": 3 }, lourds),
  variante("lourds, +Cage/Étau", { "crabe-de-fer": 3, "treuil-rouille": 2 }, {
    "cage-de-flottaison": 2,
    "etau-du-calfat": 2,
  }, lourds),
);
