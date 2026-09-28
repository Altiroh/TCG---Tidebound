"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  /** signUpWithPassword uniquement : true si un email de confirmation doit être validé avant de pouvoir se connecter (dépend de la config Supabase Auth du projet). */
  needsEmailConfirmation?: boolean;
}

/**
 * Origine du site, pour les liens envoyés par e-mail.
 *
 * FIXÉE par la configuration (`NEXT_PUBLIC_SITE_URL`) : l'en-tête `Origin`
 * d'une requête se forge hors navigateur, et un lien de réinitialisation
 * qui pointerait chez un tiers lui livrerait le code de récupération du
 * compte. L'en-tête ne sert plus qu'en développement, où la variable
 * manque souvent ; en production, son absence est une erreur de
 * configuration signalée dans les logs.
 */
function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    console.error("[auth] NEXT_PUBLIC_SITE_URL manquante : l'origine des liens d'e-mail retombe sur l'hôte de la requête.");
  }
  const host = headers().get("host");
  const proto = headers().get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

/**
 * Session ouverte par un lien reçu PAR E-MAIL, et récemment : c'est la seule
 * qui autorise un nouveau mot de passe sans l'actuel. Une session ordinaire
 * (poste resté ouvert, cookie volé), ouverte par mot de passe, passe par
 * `changePassword`, qui exige le mot de passe actuel.
 *
 * Méthodes retenues dans la revendication `amr` du jeton : `recovery` (lien
 * de réinitialisation), et par prudence `otp` / `magiclink`, qu'un projet
 * Supabase peut inscrire pour le même lien selon sa configuration. Toutes
 * prouvent l'accès à la boîte mail du compte ; aucune n'est un mot de passe.
 */
const RECOVERY_WINDOW_SECONDS = 60 * 60;
const EMAIL_PROOF_METHODS = new Set(["recovery", "otp", "magiclink"]);

function isRecentRecovery(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  const now = Math.floor(Date.now() / 1000);
  return amr.some(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      EMAIL_PROOF_METHODS.has(String((entry as { method?: unknown }).method)) &&
      typeof (entry as { timestamp?: unknown }).timestamp === "number" &&
      now - (entry as { timestamp: number }).timestamp <= RECOVERY_WINDOW_SECONDS
  );
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

  if (error) {
    // Seule la politique de mot de passe mérite d'être relayée ; tout le
    // reste (« compte existant » compris) reçoit la même réponse neutre.
    if (error.code === "weak_password") return { ok: false, error: "Ce mot de passe est trop faible, choisis-en un autre." };
    if (error.code === "user_already_exists" || error.code === "email_exists") return { ok: true, needsEmailConfirmation: true };
    console.error("[signUpWithPassword] Inscription refusée :", error.code, error.message);
    return { ok: false, error: "Inscription impossible pour le moment. Réessaie plus tard." };
  }

  // Email déjà inscrit : Supabase renvoie un succès « creux » (utilisateur
  // sans identités). La réponse reste la même que pour un nouveau compte —
  // « vérifie ta boîte mail » — pour ne pas révéler quels e-mails sont
  // inscrits. Le titulaire de l'adresse, lui, sait déjà qu'il a un compte.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { ok: true, needsEmailConfirmation: true };
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
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return { ok: false, error: "Ce lien a expiré. Redemande un e-mail de réinitialisation." };
  if (!isRecentRecovery(claimsData.claims.amr)) {
    return {
      ok: false,
      error: "Ce formulaire ne s'ouvre que depuis le lien de réinitialisation reçu par e-mail. Pour changer ton mot de passe en étant connecté, passe par les réglages.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") return { ok: false, error: "Ce mot de passe est trop faible, choisis-en un autre." };
    if (error.code === "same_password") return { ok: false, error: "Choisis un mot de passe différent de l'ancien." };
    console.error("[updatePassword] Refusé :", error.code, error.message);
    return { ok: false, error: "Impossible de changer le mot de passe pour le moment." };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
}
