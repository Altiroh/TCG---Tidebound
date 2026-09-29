"use server";

import { revalidatePath } from "next/cache";
import { collectablePrice, collectablesForSecret, collectableTokenPrice, COLLECTABLE_FAMILIES, isCosmeticSecret, isFree } from "@/game";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Collectables — les points d'entrée exposés au navigateur.
 *
 * Le joueur vient TOUJOURS de la session : un identifiant en paramètre
 * ferait de ces actions un moyen d'acheter avec les Tides de quelqu'un
 * d'autre. Le service (`collectablesService.ts`), lui, prend le joueur en
 * paramètre et reste hors de portée du réseau.
 */

export interface PurchaseCollectableResult {
  ok: boolean;
  error?: string;
  /** Solde après achat — le bandeau n'a pas à le relire. */
  balance?: number;
  /** Jetons de Préconstruit restants, après un achat en Jetons. */
  tokens?: number;
}

/**
 * Achète un Collectable — en Tides, ou en Jetons de Préconstruit si c'est
 * la monnaie que le catalogue lui donne.
 *
 * Le prix n'est JAMAIS reçu du client : il est relu au catalogue à partir
 * de l'identifiant, et la MONNAIE avec lui. C'est le seul endroit où ils se
 * décident, et ça rend impossible l'achat à un prix choisi par l'appelant.
 */
export async function purchaseCollectable(kind: string, id: string): Promise<PurchaseCollectableResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour acheter un cosmétique." };

  const item = COLLECTABLE_FAMILIES.find((family) => family.kind === kind)?.items.find((entry) => entry.id === id);
  if (!item) return { ok: false, error: "Ce cosmétique n'existe pas." };

  const tokenPrice = collectableTokenPrice(kind, id);
  if (tokenPrice !== null) return purchaseWithTokens(user.id, kind, id, item.label, tokenPrice);

  const price = collectablePrice(kind, id);
  if (price === null) return { ok: false, error: "Ce cosmétique n'est pas en vente." };

  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("purchase_cosmetic", {
      p_user_id: user.id,
      p_cosmetic_kind: kind,
      p_cosmetic_id: id,
      p_label: item.label,
      p_price: price,
    });

    if (error) {
      console.error("[purchaseCollectable] Achat refusé :", error.message);
      return { ok: false, error: "L'achat n'a pas pu aboutir — réessaie dans un instant." };
    }
    if (!data?.ok) {
      // Les deux refus que le joueur doit comprendre ; le reste reste générique.
      if (data?.error === "insufficient_funds") return { ok: false, error: "Tides insuffisants." };
      if (data?.error === "already_owned") return { ok: false, error: "Tu le possèdes déjà." };
      return { ok: false, error: "L'achat n'a pas pu aboutir." };
    }

    revalidatePath("/collectables");
    revalidatePath("/market");
    return { ok: true, balance: data.balance };
  } catch (cause) {
    console.error("[purchaseCollectable] Échec inattendu :", cause);
    return { ok: false, error: "L'achat n'a pas pu aboutir — réessaie dans un instant." };
  }
}

/**
 * L'achat en Jetons (`purchase_cosmetic_tokens`) : même garanties que
 * l'achat en Tides, dans l'autre monnaie du Market. Tant que la migration
 * `20261020120000_statistiques_a_vie` n'est pas appliquée, la fonction
 * n'existe pas : l'achat échoue proprement, sans rien débiter.
 */
async function purchaseWithTokens(userId: string, kind: string, id: string, label: string, priceTokens: number): Promise<PurchaseCollectableResult> {
  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("purchase_cosmetic_tokens", {
      p_user_id: userId,
      p_cosmetic_kind: kind,
      p_cosmetic_id: id,
      p_label: label,
      p_price_tokens: priceTokens,
    });

    if (error) {
      console.error("[purchaseCollectable] Achat en Jetons refusé :", error.message);
      return { ok: false, error: "L'achat n'a pas pu aboutir — réessaie dans un instant." };
    }
    if (!data?.ok) {
      if (data?.error === "insufficient_tokens") return { ok: false, error: "Jetons de Préconstruit insuffisants." };
      if (data?.error === "already_owned") return { ok: false, error: "Tu le possèdes déjà." };
      return { ok: false, error: "L'achat n'a pas pu aboutir." };
    }

    revalidatePath("/collectables");
    revalidatePath("/market");
    revalidatePath("/decks");
    return { ok: true, tokens: data.tokens };
  } catch (cause) {
    console.error("[purchaseCollectable] Échec inattendu :", cause);
    return { ok: false, error: "L'achat n'a pas pu aboutir — réessaie dans un instant." };
  }
}

export interface EquipCollectableResult {
  ok: boolean;
  error?: string;
  /** Identifiant réellement équipé — le client aligne son miroir dessus. */
  equipped?: string;
}

/**
 * Équipe un Collectable, toutes familles confondues.
 *
 * La POSSESSION est vérifiée en base (`equip_cosmetic`), pas ici : le
 * navigateur peut demander n'importe quel identifiant, le serveur refuse ce
 * qui n'est pas débloqué. Un cosmétique gratuit s'équipe en n'ayant AUCUNE
 * ligne équipée — c'est le repli, il ne s'écrit jamais.
 */
export async function equipCollectable(kind: string, id: string): Promise<EquipCollectableResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour équiper un collectable." };

  const family = COLLECTABLE_FAMILIES.find((entry) => entry.kind === kind);
  const item = family?.items.find((entry) => entry.id === id);
  if (!item) return { ok: false, error: "Ce collectable n'existe pas." };
  if (item.artPending) return { ok: false, error: "Son visuel n'est pas encore produit." };

  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("equip_cosmetic", {
      p_user_id: user.id,
      p_cosmetic_kind: kind,
      p_cosmetic_id: isFree(item) ? null : item.id,
    });

    if (error) {
      console.error("[equipCollectable] Équipement refusé :", error.message);
      return { ok: false, error: "Équipement impossible pour le moment." };
    }
    if (!data?.ok) {
      return { ok: false, error: data?.error === "not_owned" ? "Ce collectable n'est pas encore débloqué." : "Équipement refusé." };
    }

    revalidatePath("/collectables");
    revalidatePath("/profil");
    return { ok: true, equipped: item.id };
  } catch (cause) {
    console.error("[equipCollectable] Échec inattendu :", cause);
    return { ok: false, error: "Équipement impossible pour le moment." };
  }
}

export interface DiscoverSecretResult {
  ok: boolean;
  /** `true` : pas de session — rien n'est retenu, le geste pourra resservir une fois connecté. */
  signedOut?: boolean;
  /** Libellés des Collectables accordés À L'INSTANT (vide s'ils l'étaient déjà). */
  granted: string[];
}

/**
 * Un SECRET de l'interface vient d'être trouvé (souffler la bougie…) :
 * crédite les Collectables qu'il débloque.
 *
 * Le client ne nomme qu'un secret, jamais un Collectable : le nom est
 * vérifié contre le catalogue FERMÉ `COSMETIC_SECRETS`, et c'est le
 * catalogue qui dit ce qu'il rapporte. Un appelant ne peut donc rien
 * s'accorder d'autre que ce qu'un geste ouvert à tous accorde déjà.
 *
 * Idempotent (`grant_cosmetics` ignore ce qui est déjà là, et ne rend que
 * ce qu'il vient d'ajouter) : rappelé, il répond `granted: []` sans rien
 * écrire deux fois.
 */
export async function discoverSecret(secret: string): Promise<DiscoverSecretResult> {
  if (!isCosmeticSecret(secret)) return { ok: false, granted: [] };

  const user = await getSessionUser();
  if (!user) return { ok: false, signedOut: true, granted: [] };

  const grants = collectablesForSecret(secret);
  if (grants.length === 0) return { ok: true, granted: [] };

  try {
    // Même fonction d'écriture que la synchronisation par compteurs :
    // `player_cosmetics` reste en lecture seule pour l'application.
    const { data, error } = await createSupabaseServiceRoleClient().rpc("grant_cosmetics", {
      p_user_id: user.id,
      p_cosmetics: grants.map((grant) => ({ kind: grant.kind, id: grant.id, label: grant.label })),
    });
    if (error) {
      console.error("[discoverSecret] Octroi refusé :", error.message);
      return { ok: false, granted: [] };
    }

    const grantedIds = new Set((data?.granted as string[] | undefined) ?? []);
    const granted = grants.filter((grant) => grantedIds.has(grant.id)).map((grant) => grant.label);
    if (granted.length > 0) revalidatePath("/collectables");
    return { ok: true, granted };
  } catch (cause) {
    console.error("[discoverSecret] Échec inattendu :", cause);
    return { ok: false, granted: [] };
  }
}
