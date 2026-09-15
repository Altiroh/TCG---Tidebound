import { getCardDefinition } from "@/game/cards/sets/core";

/**
 * Possession réelle d'un deck fourni par le jeu — cartes POSSÉDÉES contre
 * cartes PRÊTÉES.
 *
 * Source de vérité design : Notion « Progression joueur », section 3. Le
 * modèle est explicite :
 *
 *   > Les cartes non possédées restent identifiées comme **prêtées**.
 *   > Les cartes possédées réellement par le joueur sont identifiées comme
 *   > telles. Les boosters et récompenses permettent progressivement au
 *   > joueur de posséder réellement les cartes de ce deck.
 *
 * Le comptage se fait À L'EXEMPLAIRE, pas à la carte distincte : un deck qui
 * demande 3 Murènes alors que le joueur en possède 1 compte 1 possédée et
 * 2 prêtées. C'est ce qui donne un « 19/30 » qui bouge vraiment à chaque
 * booster, plutôt qu'un compteur qui saute de 3 en 3.
 *
 * Fonctions PURES : la possession réelle (`player_cards`) est fournie par
 * l'appelant, ce module ne lit jamais la base.
 */

/** Détail d'une carte du deck, du point de vue de la possession. */
export interface DeckCardOwnership {
  cardId: string;
  name: string;
  cost: number;
  /** Exemplaires demandés par la liste. */
  required: number;
  /** Exemplaires réellement possédés ET utilisés par ce deck (plafonné à `required`). */
  owned: number;
  /** Exemplaires manquants, donc prêtés. */
  borrowed: number;
}

export interface DeckOwnership {
  /** Exemplaires au total dans la liste. */
  total: number;
  /** Exemplaires réellement possédés. */
  owned: number;
  /** Exemplaires prêtés (`total - owned`). */
  borrowed: number;
  /** `true` quand le joueur possède réellement l'intégralité du deck (« Équipage complété »). */
  complete: boolean;
  /** Une ligne par carte distincte, triée comme la liste de deck (Raison puis nom). */
  cards: DeckCardOwnership[];
}

/**
 * Répartit les exemplaires d'un deck entre possédés et prêtés.
 *
 * `ownedCounts` : exemplaires possédés par `cardId` (`player_cards.quantity`).
 * Une carte absente de la collection vaut 0 — et une carte retirée du
 * catalogue est comptée comme prêtée plutôt que d'interrompre le calcul :
 * une fiche de deck ne doit jamais devenir illisible parce qu'une carte a
 * bougé.
 */
export function deckOwnership(cardIds: readonly string[], ownedCounts: Readonly<Record<string, number>>): DeckOwnership {
  const required = new Map<string, number>();
  for (const cardId of cardIds) required.set(cardId, (required.get(cardId) ?? 0) + 1);

  const cards: DeckCardOwnership[] = [];
  let total = 0;
  let owned = 0;

  for (const [cardId, count] of required) {
    const ownedCopies = Math.max(0, Math.min(count, Math.floor(ownedCounts[cardId] ?? 0)));
    let name = cardId;
    let cost = 0;
    try {
      const def = getCardDefinition(cardId);
      name = def.name;
      cost = def.cost;
    } catch {
      // Carte inconnue du catalogue : elle reste listée, comptée prêtée.
    }
    cards.push({ cardId, name, cost, required: count, owned: ownedCopies, borrowed: count - ownedCopies });
    total += count;
    owned += ownedCopies;
  }

  cards.sort((a, b) => (a.cost !== b.cost ? a.cost - b.cost : a.name.localeCompare(b.name, "fr")));

  return { total, owned, borrowed: total - owned, complete: total > 0 && owned === total, cards };
}

/**
 * Libellé de possession affiché sur la fiche de deck (§3). Reprend
 * littéralement les trois formulations de la page : « 18 possédées ·
 * 12 prêtées », « 19/30 cartes réellement possédées » une fois le deck
 * entamé, et « Équipage complété — 30/30 » à la fin.
 */
export function ownershipLabel(ownership: DeckOwnership): string {
  if (ownership.complete) return `Équipage complété — ${ownership.owned}/${ownership.total}`;
  if (ownership.owned === 0) return `${ownership.total} prêtées`;
  return `${ownership.owned} possédées · ${ownership.borrowed} prêtées`;
}
