"use server";

import { revalidatePath } from "next/cache";
import { collectablesForSecret, COLLECTABLE_FAMILIES, isCosmeticSecret, isFree } from "@/game";
import { purchaseCollectableFor, type PurchaseCollectableResult } from "@/features/cosmetics/collectablesService";
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

export type { PurchaseCollectableResult };

/**
 * Achète un Collectable — en Tides, ou en Jetons de Préconstruit si c'est
 * la monnaie que le catalogue lui donne. Le prix et la monnaie sont relus
 * au catalogue côté serveur (`purchaseCollectableFor`), jamais reçus du
 * client.
 */
export async function purchaseCollectable(kind: string, id: string): Promise<PurchaseCollectableResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour acheter un cosmétique." };

  const { spentTides: _tides, spentTokens, ...result } = await purchaseCollectableFor(user.id, kind, id);
  if (result.ok) {
    revalidatePath("/collectables");
    revalidatePath("/market");
    // Les Jetons s'affichent aussi à l'écran Decks.
    if (spentTokens > 0) revalidatePath("/decks");
  }
  return result;
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

/**
 * Dos de carte et cadre de Navire ÉQUIPÉS par le joueur connecté — lus en
 * BASE (13/10/2026 : « d'un ordinateur à un autre, je n'ai pas les mêmes
 * cosmétiques »). Les fournisseurs (`CardBackProvider`, `ShipFrameProvider`)
 * l'appellent au démarrage : la copie locale n'est plus qu'un affichage
 * immédiat, la base fait foi sur tous les appareils. `null` hors session.
 */
export async function fetchMyEquippedCosmetics(): Promise<{ cardBackId: string; shipFrameId: string } | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { loadEquippedCosmetics } = await import("@/features/cosmetics/equippedCosmeticsService");
  const mine = (await loadEquippedCosmetics([user.id]))[user.id];
  return mine ? { cardBackId: mine.cardBackId, shipFrameId: mine.shipFrameId } : null;
}
