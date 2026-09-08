"use server";

import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SendMagicLinkResult {
  ok: boolean;
  error?: string;
}

/** Envoie un lien de connexion par email (pas de mot de passe à gérer côté app). */
export async function sendMagicLink(formData: FormData): Promise<SendMagicLinkResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Adresse email requise." };

  const origin = headers().get("origin") ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabase = createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
}
