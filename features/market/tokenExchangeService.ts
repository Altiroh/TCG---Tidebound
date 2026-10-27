import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { MAX_PRECON_TOKENS_PER_PURCHASE, PRECON_TOKEN_PRICE_TIDES, PRECON_TOKENS_WEEKLY_LIMIT } from "@/game/economy/constants";
import { describeFailure } from "@/features/boosters/purchaseService";

/**
 * Rayon Monnaie du Market : des Tides contre des Jetons de Préconstruit —
 * opération SERVEUR (pas de `"use server"`), appelée par le panier
 * (`checkoutCartFor`) avec le joueur de la session. Le prix est celui du
 * serveur (`PRECON_TOKEN_PRICE_TIDES`) ; le navigateur n'envoie que la
 * quantité. Solde, limite de la semaine, débit et crédit sont décidés en
 * base, ensemble (`purchase_precon_tokens`, migration `20261116120000`).
 */

export interface TokenPurchaseResult {
  ok: boolean;
  error?: string;
  /** Tides débitées. */
  spent?: number;
  /** Jetons détenus après l'achat. */
  tokens?: number;
}

function describeRefusal(code: string | undefined, remaining: number | undefined): string {
  if (code === "insufficient_funds") return "Pas assez de Tides pour ce Jeton.";
  if (code === "weekly_limit") {
    return remaining
      ? `Limite de la semaine : encore ${remaining} Jeton${remaining > 1 ? "s" : ""} au plus.`
      : `Limite atteinte : ${PRECON_TOKENS_WEEKLY_LIMIT} Jetons par semaine. Retour lundi.`;
  }
  return code ?? "Échange impossible.";
}

/**
 * Jetons encore achetables cette semaine (lundi 00:00 UTC). Lecture seule,
 * pour l'affichage : c'est `purchase_precon_tokens` qui tranche. Table
 * absente (migration pas encore appliquée) : la limite entière.
 */
export async function readPreconTokenAllowance(userId: string | null): Promise<number> {
  if (!userId) return PRECON_TOKENS_WEEKLY_LIMIT;
  try {
    const { data, error } = await createSupabaseServiceRoleClient()
      .from("precon_token_purchases")
      .select("quantity")
      .eq("user_id", userId)
      .gte("created_at", startOfUtcWeek(new Date()).toISOString());
    if (error) return PRECON_TOKENS_WEEKLY_LIMIT;
    const bought = (data ?? []).reduce((sum, row) => sum + row.quantity, 0);
    return Math.max(0, PRECON_TOKENS_WEEKLY_LIMIT - bought);
  } catch {
    return PRECON_TOKENS_WEEKLY_LIMIT;
  }
}

/** Lundi 00:00 UTC de la semaine de `date` — la même borne que les quêtes hebdomadaires et que la base. */
function startOfUtcWeek(date: Date): Date {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000);
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
      p_weekly_limit: PRECON_TOKENS_WEEKLY_LIMIT,
    });
    if (error) {
      console.error("[purchasePreconTokensFor] Refusé :", error.message);
      return { ok: false, error: "Échange impossible pour le moment." };
    }
    if (!data?.ok) {
      return { ok: false, error: describeRefusal(data?.error, data?.remaining) };
    }
    return { ok: true, spent: data.spent ?? quantity * PRECON_TOKEN_PRICE_TIDES, tokens: data.tokens };
  } catch (failure) {
    return { ok: false, error: describeFailure(failure, "Échange impossible pour le moment") };
  }
}
