"use server";

import { getSessionUser } from "@/lib/supabase/sessionUser";
import { isAdmin, VUE_JOUEUR_COOKIE } from "@/features/admin/roles";
import { cookies } from "next/headers";

/**
 * Mode Dev des Options (Admins seulement) : `false` passe en vue joueur,
 * `true` rend les outils Admin. Un non-Admin n'a rien à basculer — refusé.
 */
export async function setDevMode(enabled: boolean): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || !(await isAdmin(user.id))) return { ok: false };
  if (enabled) cookies().delete(VUE_JOUEUR_COOKIE);
  else cookies().set(VUE_JOUEUR_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}
