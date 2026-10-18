import { nextFloat, type RngState } from "@/game/rng";
import { CARD_ARTWORK_LABELS, RARE_CARD_ARTWORKS, isCardArtwork, type CardArtwork, type RareCardArtwork } from "@/game/cosmetics/artworks";
import { CARD_FINISH_LABELS, finishRank, isCardFinish, type CardFinish } from "@/game/cosmetics/finishes";

/**
 * ÉDITION d'une carte (Collection visuelle V2, 18/10/2026) : une
 * illustration ET une finition. C'est ce que le joueur possède, collectionne,
 * revend et choisit d'afficher en partie — la carte, elle, ne change pas.
 *
 * Les deux raretés se CUMULENT : l'illustration et la finition sont tirées
 * indépendamment, une Styled Full-Art Star Foil est donc ultra ultra rare.
 * La Classique en Standard (« classique » / « classique ») est l'édition de
 * base de toute carte : elle n'est jamais stockée comme édition.
 */
export interface CardEdition {
  artwork: CardArtwork;
  finish: CardFinish;
}

export const CLASSIC_EDITION: CardEdition = { artwork: "classique", finish: "classique" };

export function isClassicEdition(edition: CardEdition): boolean {
  return edition.artwork === "classique" && edition.finish === "classique";
}

/** Clé stable d'une édition (« styled-fa/star-foil ») : index de collection, clé React. */
export function editionKey(edition: CardEdition): string {
  return `${edition.artwork}/${edition.finish}`;
}

export function parseEditionKey(key: string): CardEdition | null {
  const [artwork, finish] = key.split("/");
  return isCardArtwork(artwork) && isCardFinish(finish) ? { artwork, finish } : null;
}

/** « Styled Full-Art · Star Foil », « Foil », « Classique ». */
export function editionLabel(edition: CardEdition): string {
  if (isClassicEdition(edition)) return CARD_ARTWORK_LABELS.classique;
  if (edition.finish === "classique") return CARD_ARTWORK_LABELS[edition.artwork];
  if (edition.artwork === "classique") return CARD_FINISH_LABELS[edition.finish];
  return `${CARD_ARTWORK_LABELS[edition.artwork]} · ${CARD_FINISH_LABELS[edition.finish]}`;
}

/** Rang de l'illustration : Classique 0, Styled 1, Styled Full-Art 2. */
function artworkRank(artwork: CardArtwork): number {
  return artwork === "classique" ? 0 : RARE_CARD_ARTWORKS.indexOf(artwork) + 1;
}

/**
 * Ordre de rareté d'une édition : l'illustration d'abord, la finition
 * ensuite — une Styled Standard passe devant une Classique Star Foil,
 * comme dans la collection où chaque illustration regroupe ses finitions.
 */
export function editionRank(edition: CardEdition): number {
  return artworkRank(edition.artwork) * 10 + finishRank(edition.finish);
}

/**
 * Chance qu'une carte tirée sorte dans chaque illustration ALTERNATIVE,
 * quand le booster la propose pour cette carte (barème du 18/10/2026,
 * provisoire jusqu'à la simulation économique). Tirée APRÈS la carte et sa
 * finition, sur un nombre à part : la composition du booster, la garantie
 * de carte nouvelle et la protection Abyssale n'en dépendent jamais.
 */
export const CARD_ARTWORK_ODDS: Record<RareCardArtwork, number> = {
  styled: 0.04,
  "styled-fa": 0.008,
};

/**
 * Tire l'illustration d'une carte parmi celles que le booster propose pour
 * elle. Un seul nombre, la plus rare en tête du segment : jamais deux à la
 * fois. Une illustration absente n'est PAS reportée sur les autres — elle
 * ne rend pas les éditions restantes plus fréquentes.
 */
export function rollCardArtwork(
  state: RngState,
  available: readonly RareCardArtwork[]
): { artwork: RareCardArtwork | undefined; nextState: RngState } {
  if (available.length === 0) return { artwork: undefined, nextState: state };
  const draw = nextFloat(state);
  let seuil = 0;
  for (const artwork of [...RARE_CARD_ARTWORKS].reverse()) {
    if (!available.includes(artwork)) continue;
    seuil += CARD_ARTWORK_ODDS[artwork];
    if (draw.value < seuil) return { artwork, nextState: draw.nextState };
  }
  return { artwork: undefined, nextState: draw.nextState };
}

/** Une édition possédée et son nombre d'exemplaires. */
export interface OwnedEdition extends CardEdition {
  quantity: number;
}
