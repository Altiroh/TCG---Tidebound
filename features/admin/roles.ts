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
