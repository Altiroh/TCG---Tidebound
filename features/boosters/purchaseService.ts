import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { MAX_PURCHASE_QUANTITY } from "@/features/boosters/constants";

/**
 * Achat de boosters — opération SERVEUR (pas de `"use server"`) : elle
 * prend le joueur en paramètre et ne doit jamais devenir un point d'entrée
 * HTTP. Deux appelants, qui déduisent tous deux le joueur de sa session :
 * l'action unitaire `purchaseBooster` et le panier du Market
 * (`checkoutCart`). Aucune revalidation ici : c'est à l'action de la faire,
 * une fois pour tout ce qu'elle a acheté.
 */

export interface BoosterPurchaseResult {
  ok: boolean;
  error?: string;
  /** Solde après achat. */
  balance?: number;
  /** Tides débitées, telles que la base les a calculées (prix × quantité). */
  spent?: number;
}

/** Message d'échec lisible — la clé de service manquante se dit en toutes lettres. */
export function describeFailure(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    return "Configuration serveur incomplète : SUPABASE_SERVICE_ROLE_KEY est absente. Achat et ouverture de boosters passent par elle (`.env.local` en local, variables d'environnement Vercel en prod).";
  }
  return `${fallback} (${message})`;
}

/**
 * Le prix, le solde et le débit sont entièrement décidés en base
 * (`purchase_booster`, atomique et `security definer`) : la quantité est
 * la SEULE chose que le client envoie, et elle est bornée ici avant même
 * d'atteindre la fonction. Aucun prix ne transite par le navigateur.
 */
export async function purchaseBoosterFor(userId: string, boosterId: string, quantity = 1): Promise<BoosterPurchaseResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
    return { ok: false, error: `Quantité invalide (1 à ${MAX_PURCHASE_QUANTITY}).` };
  }

  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("purchase_booster", {
      p_user_id: userId,
      p_booster_id: boosterId,
      p_quantity: quantity,
    });

    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? "Achat refusé." };
    return { ok: true, balance: data.balance ?? 0, spent: data.spent ?? 0 };
  } catch (error) {
    console.error("[purchaseBooster] Échec :", error);
    return { ok: false, error: describeFailure(error, "Achat impossible pour le moment.") };
  }
}
