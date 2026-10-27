import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { MAX_PRECON_TOKENS_PER_PURCHASE, PRECON_TOKEN_PRICE_TIDES } from "@/game/economy/constants";
import { describeFailure } from "@/features/boosters/purchaseService";

/**
 * Rayon Monnaie du Market : des Tides contre des Jetons de Préconstruit —
 * opération SERVEUR (pas de `"use server"`), appelée par le panier
 * (`checkoutCartFor`) avec le joueur de la session. Le prix est celui du
 * serveur (`PRECON_TOKEN_PRICE_TIDES`) ; le navigateur n'envoie que la
 * quantité. Solde, débit et crédit sont décidés en base, ensemble
 * (`purchase_precon_tokens`, migration `20261114120000`).
 */

export interface TokenPurchaseResult {
  ok: boolean;
  error?: string;
  /** Tides débitées. */
  spent?: number;
  /** Jetons détenus après l'achat. */
  tokens?: number;
}

export async function purchasePreconTokensFor(userId: string, quantity: number): Promise<TokenPurchaseResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PRECON_TOKENS_PER_PURCHASE) {
    return { ok: false, error: `Quantité invalide (1 à ${MAX_PRECON_TOKENS_PER_PURCHASE}).` };
  }
  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("purchase_precon_tokens", {
      p_user_id: userId,
      p_quantity: quantity,
      p_unit_price: PRECON_TOKEN_PRICE_TIDES,
    });
    if (error) {
      console.error("[purchasePreconTokensFor] Refusé :", error.message);
      return { ok: false, error: "Échange impossible pour le moment." };
    }
    if (!data?.ok) {
      return { ok: false, error: data?.error === "insufficient_funds" ? "Pas assez de Tides pour ce Jeton." : (data?.error ?? "Échange impossible.") };
    }
    return { ok: true, spent: data.spent ?? quantity * PRECON_TOKEN_PRICE_TIDES, tokens: data.tokens };
  } catch (failure) {
    return { ok: false, error: describeFailure(failure, "Échange impossible pour le moment") };
  }
}
