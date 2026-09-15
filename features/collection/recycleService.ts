import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { keptCopiesOf, recycleValueOf } from "@/features/collection/recycleValue";

/**
 * Revente de cartes — module SERVEUR, volontairement sans `"use server"` :
 * il prend le joueur en PARAMÈTRE. L'action exposée au navigateur vit dans
 * `features/collection/recycleActions.ts` et déduit le joueur de sa session.
 *
 * Le barème vit dans `recycleValue.ts` (`RECYCLE_VALUE`, dérivé du prix du
 * booster) : une carte se revend d'autant plus cher qu'elle est rare, et la
 * valeur suit automatiquement le prix du booster si celui-ci change. C'est
 * la seule source — la fonction SQL reçoit le montant plutôt que de tenir
 * un second barème qui finirait par diverger (c'est exactement ce qui était
 * arrivé : l'ancienne `recycle_card` en avait un, périmé et sans les
 * raretés Épique et Légendaire).
 */

export interface RecycleResult {
  ok: boolean;
  error?: string;
  /** Tides gagnés par cette revente. */
  tidesGained?: number;
  /** Solde après revente — l'écran n'a pas à le relire. */
  balance?: number;
  /** Exemplaires restants de cette carte. */
  remaining?: number;
}

/**
 * Revend `quantity` exemplaires de `cardId`.
 *
 * Ne vérifie NI la possession NI le dernier exemplaire : c'est la base qui
 * tranche, sous verrou (`for update`), pour que deux reventes simultanées ne
 * puissent pas vendre le même exemplaire deux fois. Ici on ne fait que
 * refuser ce qui n'a pas de sens avant même d'atteindre la base.
 */
export async function recycleCardFor(userId: string, cardId: string, quantity: number): Promise<RecycleResult> {
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, error: "Quantité invalide." };

  const unitValue = recycleValueOf(cardId);
  const keep = keptCopiesOf(cardId);
  if (unitValue === null || keep === null) return { ok: false, error: "Carte inconnue." };

  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("recycle_card", {
      p_user_id: userId,
      p_card_id: cardId,
      p_quantity: quantity,
      p_unit_value: unitValue,
      p_keep: keep,
    });
    if (error) {
      console.error("[recycleCardFor] Revente refusée :", error.message);
      return { ok: false, error: "La revente n'a pas pu aboutir — réessaie dans un instant." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "La revente n'a pas pu aboutir." };

    return { ok: true, tidesGained: data.tides_gained, balance: data.balance, remaining: data.remaining };
  } catch (cause) {
    console.error("[recycleCardFor] Échec inattendu :", cause);
    return { ok: false, error: "La revente n'a pas pu aboutir — réessaie dans un instant." };
  }
}

export interface RecycleSurplusResult {
  ok: boolean;
  error?: string;
  tidesGained?: number;
  /** Exemplaires vendus, toutes cartes confondues. */
  cardsSold?: number;
  balance?: number;
}

/**
 * Revend le SURPLUS de plusieurs cartes, en une transaction.
 *
 * `expected` est ce que le joueur a vu et confirmé : un PLAFOND par carte.
 * La valeur et le nombre d'exemplaires gardés viennent du catalogue, la
 * possession est relue en base sous verrou (`recycle_surplus`) — si la
 * collection a bougé entre-temps, on vend moins, jamais plus.
 */
export async function recycleSurplusFor(userId: string, expected: ReadonlyArray<{ cardId: string; quantity: number }>): Promise<RecycleSurplusResult> {
  const items: Array<{ card_id: string; quantity: number; unit_value: number; keep: number }> = [];
  const seen = new Set<string>();
  for (const entry of expected) {
    if (typeof entry?.cardId !== "string" || seen.has(entry.cardId)) continue;
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1) continue;
    const unitValue = recycleValueOf(entry.cardId);
    const keep = keptCopiesOf(entry.cardId);
    if (unitValue === null || keep === null) continue;
    seen.add(entry.cardId);
    items.push({ card_id: entry.cardId, quantity: entry.quantity, unit_value: unitValue, keep });
  }
  if (items.length === 0) return { ok: false, error: "Aucun surplus à revendre." };

  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("recycle_surplus", { p_user_id: userId, p_items: items });
    if (error) {
      console.error("[recycleSurplusFor] Revente refusée :", error.message);
      return { ok: false, error: "La revente n'a pas pu aboutir — réessaie dans un instant." };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "La revente n'a pas pu aboutir." };
    return { ok: true, tidesGained: data.tides_gained, cardsSold: data.cards_sold, balance: data.balance };
  } catch (cause) {
    console.error("[recycleSurplusFor] Échec inattendu :", cause);
    return { ok: false, error: "La revente n'a pas pu aboutir — réessaie dans un instant." };
  }
}
