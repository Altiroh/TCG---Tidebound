"use server";

import { revalidatePath } from "next/cache";
import { collectablePrice, COLLECTABLE_FAMILIES, isFree } from "@/game";
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
}

/**
 * Achète un Collectable contre des Tides.
 *
 * Le prix n'est JAMAIS reçu du client : il est relu au catalogue à partir
 * de l'identifiant. C'est le seul endroit où il se décide, et ça rend
 * impossible l'achat à un prix choisi par l'appelant.
 */
export async function purchaseCollectable(kind: string, id: string): Promise<PurchaseCollectableResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour acheter un cosmétique." };

  const price = collectablePrice(kind, id);
  if (price === null) return { ok: false, error: "Ce cosmétique n'est pas en vente." };

  const item = COLLECTABLE_FAMILIES.find((family) => family.kind === kind)?.items.find((entry) => entry.id === id);
  if (!item) return { ok: false, error: "Ce cosmétique n'existe pas." };

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
