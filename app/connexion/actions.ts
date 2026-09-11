"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  /** signUpWithPassword uniquement : true si un email de confirmation doit être validé avant de pouvoir se connecter (dépend de la config Supabase Auth du projet). */
  needsEmailConfirmation?: boolean;
}

function siteOrigin(): string {
  return headers().get("origin") ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

export async function signInWithPassword(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Email et mot de passe requis." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Message générique : ne jamais révéler si c'est l'email ou le mot de passe qui est incorrect.
  if (error) return { ok: false, error: "Email ou mot de passe incorrect." };
  return { ok: true };
}

export async function signUpWithPassword(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) return { ok: false, error: "Email et mot de passe requis." };
  if (password.length < 8) return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteOrigin()}/auth/callback`,
      data: displayName ? { display_name: displayName } : undefined,
    },
  });

  if (error) return { ok: false, error: error.message };

  // Avec la protection anti-énumération d'emails activée, Supabase renvoie un
  // succès "creux" (utilisateur sans identités) pour un email déjà inscrit et
  // confirmé, plutôt qu'une erreur explicite — sans ce garde-fou l'appelant
  // croirait avoir créé un second compte alors que rien n'a changé.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { ok: false, error: "Un compte existe déjà avec cet email. Connecte-toi plutôt." };
  }

  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function requestPasswordReset(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Adresse email requise." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteOrigin()}/auth/callback?next=${encodeURIComponent("/reinitialiser-mot-de-passe")}`,
  });
  // Là encore, ne pas révéler si l'email correspond à un compte existant.
  if (error) return { ok: false, error: "Impossible d'envoyer l'email pour le moment. Réessaie plus tard." };
  return { ok: true };
}

export async function updatePassword(formData: FormData): Promise<AuthActionResult> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
}
