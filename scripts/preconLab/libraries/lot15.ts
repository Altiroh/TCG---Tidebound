import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import { repeat, type DeckList } from "@/game/cards/decks/types";

/**
 * Passe des trois decks du Lot 15 — candidats, pas préconstruits : le rayon
 * actuel sert de champ, et `--only` les fait jouer contre tout le monde.
 */

export const EQUIPAGE_DE_VERRE: DeckList = {
  id: "equipage-de-verre",
  name: "Équipage de Verre",
  shipId: "le-brise-lames",
  description: "Se fêler sans casser : chaque dégât survécu fait grandir l'équipage.",
  cardIds: [
    ...repeat("eclaireur-ebreche", 3),
    ...repeat("matelot-fele", 3),
    ...repeat("eclat-de-bouteille", 2),
    ...repeat("duelliste-de-verre", 2),
    ...repeat("vigie-aux-fissures", 2),
    ...repeat("verrier-de-pont", 2),
    ...repeat("trinquer-trop-fort", 1),
    ...repeat("encore-debout", 1),
    ...repeat("bouclier-fendu", 1),
    ...repeat("bandages-humides", 1),
    ...repeat("canonnier-fele", 2),
    ...repeat("porte-eclats", 2),
    ...repeat("polisseuse-des-felures", 2),
    ...repeat("pont-de-verre", 1),
    ...repeat("bretteuse-au-bord", 3),
    ...repeat("maitre-verrier", 2),
    ...repeat("coup-de-harpon", 2),
    ...repeat("la-grande-fissure", 2),
    ...repeat("chirurgien-du-bord", 2),
    ...repeat("jusqua-ce-que-ca-casse", 1),
    ...repeat("le-brise-ligne", 2),
    ...repeat("lamiral-sans-pavillon", 1),
  ],
};

export const CAVALERIE: DeckList = {
  id: "cavalerie",
  name: "Cavalerie",
  shipId: "le-goliath",
  description: "Peu de bêtes, mais lourdes : elles tiennent la ligne et percent la Garde.",
  cardIds: [
    ...repeat("monture-de-breche", 3),
    ...repeat("bete-de-halage", 3),
    ...repeat("selle-de-guerre", 3),
    ...repeat("harnais-de-retenue", 1),
    ...repeat("debusquer", 2),
    ...repeat("faire-linventaire", 1),
    ...repeat("eclaireur-a-cornes", 3),
    ...repeat("destrier-du-ressac", 2),
    ...repeat("mufle-au-fanion", 3),
    ...repeat("chargeur-des-ecueils", 2),
    ...repeat("bete-de-percee", 2),
    ...repeat("ouvrez-la-ligne", 1),
    ...repeat("pas-un-pas-de-plus", 2),
    ...repeat("coup-de-harpon", 2),
    ...repeat("mange-fer", 2),
    ...repeat("vieille-selle", 2),
    ...repeat("le-deserteur-gris", 3),
    ...repeat("la-bete-quon-nattend-plus", 2),
    ...repeat("vieux-harponneur", 1),
  ],
};

export const SENTINELLES: DeckList = {
  id: "sentinelles-chromatiques",
  name: "Sentinelles Chromatiques",
  shipId: "le-brise-lames",
  description: "Des pierres qui se répondent : chaque Sentinelle renforce les autres, jusqu'au Géant.",
  cardIds: [
    ...repeat("heros-de-la-flamme", 3),
    ...repeat("gardienne-de-leclat", 3),
    ...repeat("tacticien-de-lecume", 3),
    ...repeat("porteur-de-jade", 2),
    ...repeat("bracelet-chromatique", 2),
    ...repeat("appel-des-sentinelles", 3),
    ...repeat("poste-chromatique", 1),
    ...repeat("pierre-retrouvee", 1),
    ...repeat("veilleuse-de-lombre", 2),
    ...repeat("survivant-de-la-mousse", 2),
    ...repeat("emissaire-de-quartz", 2),
    ...repeat("la-premiere-pierre", 1),
    ...repeat("coffret-aux-cinq-pierres", 1),
    ...repeat("briseur-du-brasier", 2),
    ...repeat("rempart-du-soleil", 2),
    ...repeat("stratege-de-lazur", 2),
    ...repeat("oracle-damethyste", 1),
    ...repeat("les-couleurs-repondent", 2),
    ...repeat("synchronisation", 1),
    ...repeat("coup-de-harpon", 1),
    ...repeat("heraut-de-nacre", 1),
    ...repeat("formation-prismatique", 1),
    ...repeat("le-geant-chromatique", 1),
  ],
};

export const LOT15: DeckList[] = [EQUIPAGE_DE_VERRE, CAVALERIE, SENTINELLES];

export const LIBRARY: DeckList[] = [...PRECON_DECK_LISTS, ...LOT15];
