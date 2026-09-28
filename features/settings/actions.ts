"use server";

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * Vérifie que la personne devant l'écran connaît bien le mot de passe du
 * compte connecté, avant toute opération sensible (changement de mot de
 * passe, suppression). Sans ça, un poste resté déverrouillé suffirait à
 * s'emparer du compte ou à l'effacer.
 *
 * Effet de bord assumé : `signInWithPassword` réécrit les cookies de
 * session — même utilisateur, session simplement rafraîchie.
 */
async function verifyCurrentPassword(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  email: string,
  password: string
): Promise<boolean> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

export async function changePassword(formData: FormData): Promise<SettingsActionResult> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword) return { ok: false, error: "Mot de passe actuel et nouveau mot de passe requis." };
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  if (newPassword !== confirmPassword) return { ok: false, error: "Les deux nouveaux mots de passe ne correspondent pas." };
  if (newPassword === currentPassword) return { ok: false, error: "Le nouveau mot de passe doit être différent de l'actuel." };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Tu dois être connecté pour changer ton mot de passe." };

  if (!(await verifyCurrentPassword(supabase, user.email, currentPassword))) {
    return { ok: false, error: "Mot de passe actuel incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Supprime définitivement le compte connecté.
 *
 * Les parties PARTAGÉES ne sont plus supprimées : elles appartiennent aussi
 * à l'adversaire, dont elles portent l'historique, les récompenses et la
 * progression de quêtes (qui cascadent depuis `matches`). Depuis
 * `20261016120000_audit_securite.sql`, les références de `matches` vers
 * `profiles` passent à `null` à la suppression du profil : la partie reste,
 * anonymisée. Seules les parties en cours ou en attente du compte sont
 * fermées d'abord, pour que l'adversaire ne reste pas assis face au vide.
 * Tout le reste (decks, collection, monnaie, quêtes, progression…) cascade
 * depuis `profiles`, lui-même supprimé en cascade avec la ligne `auth.users`.
 */
export async function deleteAccount(formData: FormData): Promise<SettingsActionResult> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { ok: false, error: "Mot de passe requis pour confirmer la suppression." };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Tu dois être connecté pour supprimer ton compte." };

  if (!(await verifyCurrentPassword(supabase, user.email, password))) {
    return { ok: false, error: "Mot de passe incorrect." };
  }

  let admin: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    admin = createSupabaseServiceRoleClient();
  } catch (error) {
    console.error("[settings] Suppression de compte impossible (service role manquante) :", error);
    return { ok: false, error: "La suppression de compte est indisponible pour le moment." };
  }

  const { error: matchesError } = await admin
    .from("matches")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .in("status", ["waiting", "active"])
    .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`);
  if (matchesError) {
    console.error("[settings] Échec de la fermeture des parties du compte :", matchesError);
    return { ok: false, error: "Impossible de supprimer le compte pour le moment. Réessaie plus tard." };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("[settings] Échec de la suppression du compte :", deleteError);
    return { ok: false, error: "Impossible de supprimer le compte pour le moment. Réessaie plus tard." };
  }

  // Le compte n'existe plus : la session locale doit partir avec lui,
  // sinon le navigateur garde des cookies pointant vers un utilisateur
  // fantôme jusqu'à leur expiration.
  await supabase.auth.signOut();
  return { ok: true };
}
