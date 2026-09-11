import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Client Supabase pour le code serveur (Server Components, Route Handlers,
 * Server Actions). Lit/écrit les cookies de session via l'API Next.js.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    getSupabaseUrl()!,
    getSupabaseAnonKey()!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Appelé depuis un Server Component : ignoré, le middleware
            // se charge du rafraîchissement de session.
          }
        },
      },
    }
  );
}

/**
 * Client "service role" à réserver aux opérations serveur de confiance
 * (jobs, scripts d'admin). Ne jamais exposer ce client au navigateur :
 * il ignore les policies RLS.
 */
export function createSupabaseServiceRoleClient() {
  return createClient<Database>(
    getSupabaseUrl()!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
