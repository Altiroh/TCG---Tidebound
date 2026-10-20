import { CARD_DATABASE } from "@/game";
import { isCardArtwork } from "@/game/cosmetics/artworks";
import { isCardFinish } from "@/game/cosmetics/finishes";
import { editionKey, isClassicEdition, type CardEdition, type OwnedEdition } from "@/game/cosmetics/editions";

/**
 * VITRINE — règles PURES (forme, possession), partagées par le serveur et
 * l'éditeur. Six emplacements où le joueur met en avant des cartes qu'il
 * possède, dans l'édition de son choix : c'est fait pour frimer.
 */

export const SHOWCASE_SIZE = 6;

/** Une carte exposée : la carte et l'édition montrée. */
export type ShowcaseCard = { cardId: string } & CardEdition;
/** Les six emplacements, `null` quand l'emplacement est vide. */
export type Showcase = (ShowcaseCard | null)[];

export function emptyShowcase(): Showcase {
  return Array.from({ length: SHOWCASE_SIZE }, () => null);
}

/**
 * Vitrine reçue du navigateur, nettoyée : six emplacements, cartes du
 * catalogue, éditions connues, une même édition d'une carte exposée une
 * seule fois. `null` si la forme est illisible.
 */
export function parseShowcase(raw: unknown): Showcase | null {
  if (!Array.isArray(raw) || raw.length > SHOWCASE_SIZE) return null;
  const result = emptyShowcase();
  const seen = new Set<string>();
  for (let slot = 0; slot < raw.length; slot += 1) {
    const entry = raw[slot];
    if (entry === null || entry === undefined) continue;
    if (typeof entry !== "object") return null;
    const { cardId, artwork, finish } = entry as Record<string, unknown>;
    if (typeof cardId !== "string" || !CARD_DATABASE.has(cardId)) return null;
    if (!isCardArtwork(artwork) || !isCardFinish(finish)) return null;
    const key = `${cardId}|${editionKey({ artwork, finish })}`;
    if (seen.has(key)) return null;
    seen.add(key);
    result[slot] = { cardId, artwork, finish };
  }
  return result;
}

/**
 * La carte exposée est-elle possédée dans cette édition ? La Classique se
 * contente d'un exemplaire quelconque de la carte ; une édition rare doit
 * figurer parmi les éditions du joueur.
 */
export function ownsShowcaseCard(card: ShowcaseCard, ownedCounts: Readonly<Record<string, number>>, editions: Readonly<Record<string, readonly OwnedEdition[]>>): boolean {
  if ((ownedCounts[card.cardId] ?? 0) < 1) return false;
  if (isClassicEdition(card)) return true;
  return (editions[card.cardId] ?? []).some((owned) => owned.artwork === card.artwork && owned.finish === card.finish && owned.quantity > 0);
}

/*
 * Gestes sur la vitrine — purs, appliqués tout de suite à l'écran
 * (`useShowcaseEditing`) avant que le serveur ne confirme.
 */

const sameShowcaseCard = (a: ShowcaseCard | null, b: ShowcaseCard) =>
  a !== null && a.cardId === b.cardId && editionKey(a) === editionKey(b);

/** Déplace la carte de `from` vers `to` ; celle qui s'y trouvait prend sa place (échange). */
export function moveShowcaseCard(showcase: Showcase, from: number, to: number): Showcase {
  if (from === to || from < 0 || to < 0 || from >= showcase.length || to >= showcase.length) return showcase;
  const next = [...showcase];
  [next[from], next[to]] = [next[to] ?? null, next[from] ?? null];
  return next;
}

/** Expose `card` à l'emplacement `slot` ; déjà exposée ailleurs, elle en part (une édition ne s'expose qu'une fois). */
export function placeShowcaseCard(showcase: Showcase, card: ShowcaseCard, slot: number): Showcase {
  const next = showcase.map((entry) => (sameShowcaseCard(entry, card) ? null : entry));
  next[slot] = card;
  return next;
}

/** Vide l'emplacement `slot`. */
export function clearShowcaseSlot(showcase: Showcase, slot: number): Showcase {
  return showcase.map((entry, index) => (index === slot ? null : entry));
}
