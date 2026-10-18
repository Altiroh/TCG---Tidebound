"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { readDisplayedEditions } from "@/lib/supabase/cardEditions";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import { hasArtwork, isCardArtwork } from "@/game/cosmetics/artworks";
import { isCardFinish } from "@/game/cosmetics/finishes";
import type { CardEdition } from "@/game/cosmetics/editions";

/**
 * Édition MONTRÉE EN PARTIE pour une carte (Collection visuelle V2,
 * 18/10/2026) : le joueur la choisit dans la fiche de collection, ses deux
 * camps la voient sur la table. Purement visuelle — le moteur l'ignore.
 *
 * Le serveur vérifie la carte et l'édition ; la base (`set_card_display`)
 * vérifie la possession. La Classique efface le choix.
 */
export async function setCardDisplayedEdition(cardId: string, edition: CardEdition): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour choisir une édition." };
  if (!CARD_DATABASE.has(cardId)) return { ok: false, error: "Carte inconnue." };
  if (!isCardArtwork(edition?.artwork) || !isCardFinish(edition?.finish) || !hasArtwork(cardId, edition.artwork)) {
    return { ok: false, error: "Édition inconnue pour cette carte." };
  }
  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("set_card_display", {
      p_user_id: user.id,
      p_card_id: cardId,
      p_artwork: edition.artwork,
      p_finish: edition.finish,
    });
    if (error || !data?.ok) {
      console.warn("[setCardDisplayedEdition] Refusé :", error?.message ?? data?.error);
      return { ok: false, error: data?.error ?? "Choix impossible pour le moment (migration des éditions appliquée ?)." };
    }
    revalidatePath("/collection");
    return { ok: true };
  } catch (error) {
    console.error("[setCardDisplayedEdition] Échec :", error);
    return { ok: false, error: "Choix impossible pour le moment." };
  }
}

/** Éditions choisies par le joueur connecté, par carte — pour ses parties contre le bot. Vide hors session. */
export async function fetchMyDisplayedEditions(): Promise<Record<string, CardEdition>> {
  const user = await getSessionUser();
  if (!user) return {};
  return (await readDisplayedEditions([user.id]))[user.id] ?? {};
}
