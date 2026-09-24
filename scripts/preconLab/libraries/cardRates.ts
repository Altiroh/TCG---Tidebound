/**
 * TAUX PROPRE DES CARTES — chaque carte non tribale glissée dans un deck
 * NEUTRE, à la place des Charpentiers de Bord (2/3 pour 2, sans texte).
 *
 * Le deck neutre est une courbe honnête de corps sans synergie. L'écart de
 * taux de victoire entre une variante et le deck neutre dit ce que la
 * carte apporte d'elle-même, HORS de toute synergie — de quoi choisir les
 * cartes génériques d'un préconstruit sur une mesure, pas sur une intuition.
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/cardRates.ts --field <rayon> --games 20 --brief
 */
import { CORE_SET } from "@/game/cards/sets/core";
import { getMaxCopies } from "@/game/cards/types";
import { repeat, type DeckList } from "@/game/cards/decks/types";

const FILLER = "charpentier-de-bord";

export const NEUTRE: DeckList = {
  id: "neutre",
  name: "NEUTRE",
  shipId: "lerrant",
  description: "Deck témoin.",
  cardIds: [
    ...repeat("marin-des-jetees", 3),
    ...repeat("mousse-du-premier-quart", 3),
    ...repeat("poisson-aux-dents-de-verre", 3),
    ...repeat(FILLER, 3),
    ...repeat("matelot-insomniaque", 3),
    ...repeat("murene-aveugle", 3),
    ...repeat("matelot-du-sans-nom", 3),
    ...repeat("masse-sombre", 3),
    ...repeat("requin-balafre", 3),
    ...repeat("harponneur-du-dernier-quai", 3),
    ...repeat("chose-des-hauts-fonds", 3),
    ...repeat("si-raie-ponce", 3),
    ...repeat("baleine-aux-cicatrices-blanches", 2),
    ...repeat("journal-de-bord-detrempe", 2),
  ],
};

/** Cartes qui ne valent rien hors de leur famille : mesurées dans leur deck, pas ici. */
function tribal(def: (typeof CORE_SET)[number]): boolean {
  if (def.archetype) return true;
  if (def.subtype === "marionnette" || def.subtype === "un-dead") return true;
  return false;
}

const variants: DeckList[] = CORE_SET.filter((def) => !tribal(def) && def.id !== FILLER).map((def) => {
  const copies = Math.min(3, getMaxCopies(def));
  let replaced = 0;
  const cardIds = NEUTRE.cardIds.map((id) => {
    if (id === FILLER && replaced < copies) {
      replaced += 1;
      return def.id;
    }
    return id;
  });
  return { ...NEUTRE, id: `v-${def.id}`, name: `+${def.id}`, cardIds };
});

export const LIBRARY: DeckList[] = [NEUTRE, ...variants];
