import { CLASSIC_EDITION, editionKey, editionRank, isClassicEdition, type CardEdition } from "@/game/cosmetics/editions";

/**
 * ÉDITIONS PAR EXEMPLAIRE d'un deck (décision du 19/10/2026) : chaque copie
 * d'une carte peut se montrer dans sa variante — une Classique et une Star
 * Foil du même Gardien dans le même deck.
 *
 * Un deck garde sa liste d'exemplaires (`cardIds`, la source de vérité des
 * règles) ; les éditions RARES s'y ajoutent à part, carte par carte. Les
 * copies qu'aucune édition rare ne désigne sont Classiques.
 *
 * Règles (toutes vérifiées ici, à la sauvegarde ET à l'entrée en partie) :
 *  - la limite de la carte (`getMaxCopies`) porte sur TOUTES ses éditions ;
 *  - une édition rare n'entre pas plus de fois qu'on n'en possède ;
 *  - un exemplaire rare peut toujours se montrer en Classique : la Classique
 *    n'est bornée que par le total possédé (`ownedPartOf`).
 *
 * Fonctions PURES, partagées par l'éditeur et le serveur.
 */

/** Une édition rare d'une carte, et combien d'exemplaires du deck la portent. */
export interface DeckEditionCount {
  cardId: string;
  artwork: CardEdition["artwork"];
  finish: CardEdition["finish"];
  quantity: number;
}

/** Éditions RARES des exemplaires du deck, par carte : une entrée par copie. */
export type DeckRareCopies = Readonly<Record<string, readonly CardEdition[]>>;

/** Exemplaires possédés de chaque édition rare, par carte (`player_card_editions`). */
export type OwnedEditionQuantities = Readonly<Record<string, ReadonlyArray<CardEdition & { quantity: number }>>>;

/** Comptes par (carte, édition) → une entrée par copie, de la plus rare à la moins rare. */
export function rareCopiesFrom(counts: readonly DeckEditionCount[]): Record<string, CardEdition[]> {
  const result: Record<string, CardEdition[]> = {};
  for (const count of counts) {
    const edition = { artwork: count.artwork, finish: count.finish };
    if (isClassicEdition(edition) || count.quantity <= 0) continue;
    const list = (result[count.cardId] ??= []);
    for (let i = 0; i < count.quantity; i += 1) list.push(edition);
  }
  for (const list of Object.values(result)) list.sort((a, b) => editionRank(b) - editionRank(a));
  return result;
}

/** L'inverse : une entrée par (carte, édition rare), avec sa quantité. */
export function countsFromRareCopies(copies: DeckRareCopies): DeckEditionCount[] {
  const counts = new Map<string, DeckEditionCount>();
  for (const [cardId, list] of Object.entries(copies)) {
    for (const edition of list) {
      if (isClassicEdition(edition)) continue;
      const key = `${cardId}|${editionKey(edition)}`;
      const current = counts.get(key);
      if (current) current.quantity += 1;
      else counts.set(key, { cardId, artwork: edition.artwork, finish: edition.finish, quantity: 1 });
    }
  }
  return [...counts.values()];
}

/** Copies de cette édition (Classique comprise) dans le deck. */
export function copiesOfEdition(cardIds: readonly string[], copies: DeckRareCopies, cardId: string, edition: CardEdition): number {
  const rares = copies[cardId] ?? [];
  if (isClassicEdition(edition)) return Math.max(0, cardIds.filter((id) => id === cardId).length - rares.length);
  const key = editionKey(edition);
  return rares.filter((rare) => editionKey(rare) === key).length;
}

/** Exemplaires possédés d'une édition RARE ; `Infinity` pour la Classique (bornée par le total seulement). */
export function ownedOfEdition(owned: OwnedEditionQuantities, cardId: string, edition: CardEdition): number {
  if (isClassicEdition(edition)) return Number.POSITIVE_INFINITY;
  const key = editionKey(edition);
  return (owned[cardId] ?? []).filter((entry) => editionKey(entry) === key).reduce((sum, entry) => sum + entry.quantity, 0);
}

/**
 * Bride les éditions rares d'un deck à ce que les règles permettent : jamais
 * plus de copies rares d'une carte qu'elle n'a d'exemplaires dans le deck,
 * jamais plus d'une édition qu'on n'en possède. Les plus rares sont gardées
 * d'abord ; le surplus redevient Classique.
 */
export function clampRareCopies(cardIds: readonly string[], copies: DeckRareCopies, owned: OwnedEditionQuantities | null): Record<string, CardEdition[]> {
  const result: Record<string, CardEdition[]> = {};
  for (const [cardId, list] of Object.entries(copies)) {
    const inDeck = cardIds.filter((id) => id === cardId).length;
    const kept: CardEdition[] = [];
    const used = new Map<string, number>();
    for (const edition of [...list].sort((a, b) => editionRank(b) - editionRank(a))) {
      if (isClassicEdition(edition) || kept.length >= inDeck) continue;
      const key = editionKey(edition);
      const already = used.get(key) ?? 0;
      if (owned && already >= ownedOfEdition(owned, cardId, edition)) continue;
      used.set(key, already + 1);
      kept.push(edition);
    }
    if (kept.length > 0) result[cardId] = kept;
  }
  return result;
}

/**
 * L'édition de chaque exemplaire, ALIGNÉE sur `cardIds` (`DeckList.cardEditions`) :
 * les premières copies d'une carte reçoivent ses éditions rares, les autres
 * la Classique.
 */
export function alignCardEditions(cardIds: readonly string[], copies: DeckRareCopies): CardEdition[] {
  const used = new Map<string, number>();
  return cardIds.map((cardId) => {
    const index = used.get(cardId) ?? 0;
    used.set(cardId, index + 1);
    return copies[cardId]?.[index] ?? CLASSIC_EDITION;
  });
}
