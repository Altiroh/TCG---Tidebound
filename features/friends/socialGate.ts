import { devModeActive } from "@/features/admin/roles";
import { socialLocked } from "@/features/friends/socialLock";

/**
 * Le volet social est-il fermé pour ce joueur ? — module SERVEUR, sans
 * directive `"use server"` : l'identifiant vient de la session de l'appelant.
 */
export async function socialClosedFor(userId: string): Promise<boolean> {
  return socialLocked(await devModeActive(userId));
}

