"use server";

import { revalidatePath } from "next/cache";
import { readShowcase, saveShowcase } from "@/features/friends/showcaseService";
import { parseShowcase, type Showcase } from "@/features/friends/showcaseRules";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/** Vitrine — Server Actions. Le joueur est tiré de la session : on ne compose que la sienne. */

export async function fetchMyShowcase(): Promise<Showcase | null> {
  try {
    const user = await getSessionUser();
    if (!user) return null;
    return await readShowcase(user.id);
  } catch (error) {
    console.error("[fetchMyShowcase] Lecture impossible :", error);
    return null;
  }
}

export async function updateShowcase(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Connecte-toi pour composer ta vitrine." };
  const showcase = parseShowcase(raw);
  if (!showcase) return { ok: false, error: "Vitrine illisible : une même carte, dans la même édition, ne s'expose qu'une fois." };
  const result = await saveShowcase(user.id, showcase).catch(() => ({ ok: false as const, error: "Enregistrement impossible pour l'instant." }));
  if (result.ok) {
    revalidatePath("/vitrine");
    revalidatePath("/amis");
  }
  return result;
}
