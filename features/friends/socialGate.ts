import { redirect } from "next/navigation";
import { devModeActive } from "@/features/admin/roles";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { socialLocked } from "@/features/friends/socialLock";

/**
 * Le volet social est-il fermé pour ce joueur ? — module SERVEUR, sans
 * directive `"use server"` : l'identifiant vient de la session de l'appelant.
 */
export async function socialClosedFor(userId: string): Promise<boolean> {
  return socialLocked(await devModeActive(userId));
}

/** Garde des pages du volet social : connexion obligatoire, puis retour au menu si le volet est fermé. */
export async function guardSocialPage(): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  if (await socialClosedFor(user.id)) redirect("/");
}
