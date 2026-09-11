"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Client Supabase utilisable côté navigateur (composants "use client").
 * Ne jamais importer ce fichier depuis du code serveur sensible : la clé
 * anonyme est publique par construction, la sécurité réelle est assurée
 * par les policies RLS côté base de données.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(getSupabaseUrl()!, getSupabaseAnonKey()!);
}
