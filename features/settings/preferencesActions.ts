"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * PRÉFÉRENCES DU JOUEUR, SUR LE COMPTE (10/10/2026) — lecture et écriture.
 *
 * Le joueur vient TOUJOURS de sa session : un identifiant en paramètre
 * permettrait de lire ou d'écrire les réglages de quelqu'un d'autre. Le sens
 * des valeurs n'est pas validé ici — chaque écran relit la sienne et écarte
 * ce qu'il ne comprend pas (`lib/preferences.ts`) ; la base borne la forme
 * (`set_player_preferences`, migration 20261101120000).
 */

const KEY_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,79}$/;

/** Préférences du compte connecté ; `null` sans session (pages publiques) ou si la base ne répond pas. */
export async function fetchPreferences(): Promise<Record<string, unknown> | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from("player_preferences").select("preferences").eq("user_id", user.id).maybeSingle();
  if (error) {
    console.error("[preferences] Lecture impossible :", error.message);
    return null;
  }
  const stored = data?.preferences;
  return stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
}

/** Fusionne `values` dans les préférences du compte ; une valeur `null` retire la clé. */
export async function savePreferences(values: Record<string, unknown>): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const entries = Object.entries(values ?? {});
  if (entries.length === 0 || entries.length > 50 || entries.some(([key]) => !KEY_PATTERN.test(key))) return { ok: false };
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("set_player_preferences", { p_user_id: user.id, p_values: Object.fromEntries(entries) });
  if (error || !data?.ok) {
    console.error("[preferences] Écriture refusée :", error?.message ?? data?.error);
    return { ok: false };
  }
  return { ok: true };
}
