import { purchaseBoosterFor } from "@/features/boosters/purchaseService";
import { purchaseCollectableFor } from "@/features/cosmetics/collectablesService";
import { unlockPreconDeck } from "@/features/decks/catalogService";

/**
 * Le PANIER du Market, réglé côté serveur — opération SERVEUR (pas de
 * `"use server"`) : elle prend le joueur en paramètre. Le point d'entrée
 * exposé (`checkoutCart`, `features/market/actions.ts`) le déduit de sa
 * session.
 *
 * Avant (audit de fluidité du 14/10/2026), le navigateur appelait une
 * Server Action PAR LIGNE : autant d'allers-retours, et autant de rendus
 * complets de /market renvoyés, que d'articles. Ici, un seul appel, et
 * EXACTEMENT les mêmes opérations que les actions unitaires, dans le même
 * ordre — boosters, puis decks, puis cosmétiques —, chacune sa propre
 * transaction atomique en base. On s'arrête au premier refus : ce qui
 * suit n'est pas tenté, rien n'est débité pour lui.
 */

export interface CheckoutCart {
  /** Boosters, par quantité (1 à `MAX_PURCHASE_QUANTITY`, bornée par `purchaseBoosterFor`). */
  boosters: Array<{ boosterId: string; quantity: number }>;
  /** Préconstruits, un Jeton chacun. */
  decks: string[];
  /** Cosmétiques, prix et monnaie relus au catalogue. */
  cosmetics: Array<{ kind: string; id: string }>;
}

export interface CheckoutSummary {
  boosters: number;
  decks: number;
  cosmetics: number;
  /** Tides débitées, telles que la base / le catalogue les comptent. */
  tides: number;
  /** Jetons de Préconstruit débités. */
  tokens: number;
}

export interface CheckoutCartResult {
  /** `true` si TOUT le panier est passé. */
  ok: boolean;
  /** Le refus qui a arrêté le panier. */
  error?: string;
  bought: CheckoutSummary;
  /** Les lignes réellement achetées. */
  purchased: CheckoutCart;
  /** Les lignes NON achetées : celle qui a échoué, et toutes les suivantes. */
  remaining: CheckoutCart;
}

/** Au-delà, le panier n'a pas été composé par l'écran du Market. */
const MAX_CART_LINES = 200;

const EMPTY_SUMMARY: CheckoutSummary = { boosters: 0, decks: 0, cosmetics: 0, tides: 0, tokens: 0 };

function emptyCart(): CheckoutCart {
  return { boosters: [], decks: [], cosmetics: [] };
}

/**
 * Le panier tel que le navigateur l'envoie est une donnée NON fiable : on
 * n'en garde la forme que si elle est exactement celle attendue. Les
 * valeurs (quantité, identifiants) sont validées plus loin, par les mêmes
 * fonctions que les achats unitaires.
 */
export function parseCheckoutCart(input: unknown): CheckoutCart | null {
  if (!input || typeof input !== "object") return null;
  const { boosters, decks, cosmetics } = input as Record<string, unknown>;
  if (!Array.isArray(boosters) || !Array.isArray(decks) || !Array.isArray(cosmetics)) return null;
  if (boosters.length + decks.length + cosmetics.length > MAX_CART_LINES) return null;

  const cart = emptyCart();
  for (const line of boosters) {
    if (!line || typeof line !== "object") return null;
    const { boosterId, quantity } = line as Record<string, unknown>;
    if (typeof boosterId !== "string" || typeof quantity !== "number") return null;
    cart.boosters.push({ boosterId, quantity });
  }
  for (const deckId of decks) {
    if (typeof deckId !== "string") return null;
    cart.decks.push(deckId);
  }
  for (const line of cosmetics) {
    if (!line || typeof line !== "object") return null;
    const { kind, id } = line as Record<string, unknown>;
    if (typeof kind !== "string" || typeof id !== "string") return null;
    cart.cosmetics.push({ kind, id });
  }
  return cart;
}

/** Règle le panier de `userId`, ligne après ligne, jusqu'au premier refus. */
export async function checkoutCartFor(userId: string, cart: CheckoutCart): Promise<CheckoutCartResult> {
  const bought: CheckoutSummary = { ...EMPTY_SUMMARY };
  const purchased = emptyCart();
  const stop = (error: string, remaining: CheckoutCart): CheckoutCartResult => ({ ok: false, error, bought, purchased, remaining });

  for (const [index, line] of cart.boosters.entries()) {
    const result = await purchaseBoosterFor(userId, line.boosterId, line.quantity);
    if (!result.ok) {
      return stop(result.error ?? "Achat impossible.", { boosters: cart.boosters.slice(index), decks: [...cart.decks], cosmetics: [...cart.cosmetics] });
    }
    bought.boosters += line.quantity;
    bought.tides += result.spent ?? 0;
    purchased.boosters.push(line);
  }

  for (const [index, deckId] of cart.decks.entries()) {
    const result = await unlockPreconDeck(userId, deckId);
    if (!result.ok) {
      return stop(result.error ?? "Déblocage impossible.", { boosters: [], decks: cart.decks.slice(index), cosmetics: [...cart.cosmetics] });
    }
    bought.decks += 1;
    bought.tokens += 1;
    purchased.decks.push(deckId);
  }

  for (const [index, line] of cart.cosmetics.entries()) {
    const result = await purchaseCollectableFor(userId, line.kind, line.id);
    if (!result.ok) {
      return stop(result.error ?? "Achat impossible.", { boosters: [], decks: [], cosmetics: cart.cosmetics.slice(index) });
    }
    bought.cosmetics += 1;
    bought.tides += result.spentTides;
    bought.tokens += result.spentTokens;
    purchased.cosmetics.push(line);
  }

  return { ok: true, bought, purchased, remaining: emptyCart() };
}

/** Écrans à relire après un panier : ceux que chaque achat unitaire aurait revalidés. */
export function pathsToRevalidate(result: CheckoutCartResult): string[] {
  const paths = new Set<string>();
  const { bought } = result;
  // Le Market lui-même dès qu'un article est parti : c'est la page qui l'affiche.
  if (bought.boosters + bought.decks + bought.cosmetics > 0) paths.add("/market");
  if (bought.boosters > 0) paths.add("/boosters");
  if (bought.decks > 0) {
    paths.add("/decks");
    paths.add("/partie");
  }
  if (bought.cosmetics > 0) paths.add("/collectables");
  // Un cosmétique payé en Jetons touche aussi l'écran Decks (il affiche les Jetons).
  if (bought.tokens > bought.decks) paths.add("/decks");
  return [...paths];
}
