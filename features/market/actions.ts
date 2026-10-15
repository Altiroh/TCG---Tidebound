"use server";

import { revalidatePath } from "next/cache";
import {
  checkoutCartFor,
  parseCheckoutCart,
  pathsToRevalidate,
  type CheckoutCart,
  type CheckoutCartResult,
} from "@/features/market/checkoutService";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Market — Server Actions exposées au navigateur.
 *
 * Le joueur vient TOUJOURS de la session ; le panier, lui, n'est qu'une
 * liste d'identifiants et de quantités : les prix et les monnaies sont
 * relus côté serveur, exactement comme pour les achats unitaires.
 */

export type { CheckoutCart, CheckoutCartResult };

/** Le message hors connexion de l'achat unitaire qu'aurait tenté la première ligne. */
function signedOutError(cart: CheckoutCart): string {
  if (cart.boosters.length > 0) return "Connecte-toi pour acheter un booster.";
  if (cart.decks.length > 0) return "Connecte-toi pour débloquer un préconstruit.";
  return "Connecte-toi pour acheter un cosmétique.";
}

/**
 * Tout le panier en UN appel : boosters, puis decks, puis cosmétiques,
 * arrêt au premier refus (`checkoutCartFor`). Une seule revalidation, à la
 * fin, pour tout ce qui est parti — la réponse porte donc une seule relecture
 * de la page au lieu d'une par article.
 */
export async function checkoutCart(input: CheckoutCart): Promise<CheckoutCartResult> {
  const empty = { boosters: 0, decks: 0, cosmetics: 0, tides: 0, tokens: 0 };
  const nothing: CheckoutCart = { boosters: [], decks: [], cosmetics: [] };
  const cart = parseCheckoutCart(input);
  if (!cart) return { ok: false, error: "Panier invalide.", bought: empty, purchased: nothing, remaining: nothing };

  const user = await getSessionUser();
  if (!user) return { ok: false, error: signedOutError(cart), bought: empty, purchased: nothing, remaining: cart };

  const result = await checkoutCartFor(user.id, cart);
  for (const path of pathsToRevalidate(result)) revalidatePath(path);
  return result;
}
