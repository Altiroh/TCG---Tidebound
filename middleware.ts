import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Rafraîchit la session Supabase à chaque requête (pattern `@supabase/ssr`
 * standard) : les Server Components ne peuvent pas écrire de cookies, donc
 * le rafraîchissement du token doit passer par ici.
 *
 * Volontairement défensif : une erreur ici (variables d'environnement
 * absentes/invalides, clé Supabase révoquée, panne réseau vers Supabase)
 * ne doit JAMAIS faire planter le routing de tout le site — elle ne fait
 * que dégrader le rafraîchissement de session pour cette requête. Sans ce
 * garde-fou, une simple mauvaise config d'env var renvoie un 500 sur
 * absolument toutes les routes (vécu : "MIDDLEWARE_INVOCATION_FAILED").
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    // Diagnostic sûr : uniquement des booléens de présence, jamais la valeur des clés.
    console.error("[middleware] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquante(s) — session non rafraîchie.", {
      url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      anonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      publishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    });
    return response;
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    // `getClaims` plutôt que `getUser` : il rafraîchit la session de la même
    // façon, mais vérifie le jeton localement quand le projet signe en
    // asymétrique — un aller-retour Auth de moins sur CHAQUE navigation.
    await supabase.auth.getClaims();
  } catch (error) {
    console.error("[middleware] Échec du rafraîchissement de session Supabase :", error);
  }

  return response;
}

/**
 * Uniquement les pages, routes et Server Actions : jamais les fichiers
 * statiques. Sans ces exclusions, chaque illustration, cadre, icône ou son
 * de `public/` déclenchait `auth.getUser()` — un aller-retour vers Supabase
 * Auth PAR FICHIER pour un joueur connecté (des dizaines par lot de cartes
 * sur la Collection), pour une session qu'aucun de ces fichiers ne lit.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|assets/|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:webp|png|jpg|jpeg|gif|svg|ico|mp3|wav|ogg|woff2?)$).*)",
  ],
};
