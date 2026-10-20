"use server";

import { revalidatePath } from "next/cache";
import { readShowcase, saveShowcase } from "@/features/friends/showcaseService";
import { parseShowcase, type Showcase } from "@/features/friends/showcaseRules";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";
import type { OwnedEdition } from "@/game/cosmetics/editions";
import { socialClosedFor } from "@/features/friends/socialGate";
import { SOCIAL_INDISPONIBLE } from "@/features/friends/socialLock";

/** Vitrine — Server Actions. Le joueur est tiré de la session : on ne compose que la sienne. */

export async function fetchMyShowcase(): Promise<Showcase | null> {
  try {
    const user = await getSessionUser();
    if (!user || (await socialClosedFor(user.id))) return null;
    return await readShowcase(user.id);
  } catch (error) {
    console.error("[fetchMyShowcase] Lecture impossible :", error);
    return null;
  }
}

/** De quoi composer sa vitrine au profil : la vitrine, et la collection (éditions comprises). */
export async function fetchShowcaseEditor(): Promise<{
  showcase: Showcase;
  ownedCounts: Record<string, number>;
  ownedEditions: Record<string, OwnedEdition[]>;
} | null> {
  try {
    const user = await getSessionUser();
    if (!user || (await socialClosedFor(user.id))) return null;
    const [showcase, collection] = await Promise.all([readShowcase(user.id), getOwnedCardIds({ withEditions: true })]);
    return { showcase, ownedCounts: collection.ownedCounts, ownedEditions: collection.ownedEditions };
  } catch (error) {
    console.error("[fetchShowcaseEditor] Lecture impossible :", error);
    return null;
  }
}

export async function updateShowcase(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour composer ta vitrine." };
  // Volet social réservé au mode Dev (`socialLock.ts`).
  if (await socialClosedFor(user.id)) return { ok: false, error: SOCIAL_INDISPONIBLE };
  const showcase = parseShowcase(raw);
  if (!showcase) return { ok: false, error: "Vitrine illisible : une même carte, dans la même édition, ne s'expose qu'une fois." };
  const result = await saveShowcase(user.id, showcase).catch(() => ({ ok: false as const, error: "Enregistrement impossible pour l'instant." }));
  if (result.ok) {
    revalidatePath("/profil");
  }
  return result;
}
