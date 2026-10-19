import { cookies } from "next/headers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Rôle Admin — module SERVEUR (pas de `"use server"` : il prend un
 * identifiant de joueur, il ne doit pas devenir un point d'entrée HTTP).
 *
 * Le rôle vit en base (`player_roles`, accordé à la main) : c'est le seul
 * endroit qu'un navigateur ne peut pas réécrire. Table absente (migration
 * pas encore passée) ou lecture en échec : personne n'est Admin.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.from("player_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    return !error && data !== null;
  } catch {
    return false;
  }
}

/**
 * VUE JOUEUR : un Admin coupe le mode Dev (Options) pour voir l'application
 * comme un joueur — labos, outils d'édition et écriture du courrier
 * disparaissent. Un cookie, lu côté serveur, pour que les pages rendues par
 * le serveur (Collection) le respectent aussi.
 *
 * Il ne fait que RETIRER de l'affichage : il ne donne aucun droit, et les
 * contrôles d'autorisation restent sur le rôle réel (`isAdmin`).
 */
export const VUE_JOUEUR_COOKIE = "tb-vue-joueur";

export function vueJoueurActive(): boolean {
  return cookies().get(VUE_JOUEUR_COOKIE)?.value === "1";
}

/** Les outils Admin s'affichent-ils ? Rôle Admin ET mode Dev allumé. */
export async function adminToolsVisible(userId: string): Promise<boolean> {
  return !vueJoueurActive() && (await isAdmin(userId));
}
