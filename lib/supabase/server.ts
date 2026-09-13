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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    // Message explicite plutôt que le "supabaseKey is required." du SDK : quêtes, parties arbitrées et
    // récompenses en dépendent, et une variable vide dans `.env.local`/Vercel passait inaperçue.
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante ou vide (.env.local en local, variables d'environnement Vercel en prod).");
  }
  return createClient<Database>(getSupabaseUrl()!, serviceRoleKey, { auth: { persistSession: false } });
}
