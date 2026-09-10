import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("[middleware] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquante(s) — session non rafraîchie.");
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

    await supabase.auth.getUser();
  } catch (error) {
    console.error("[middleware] Échec du rafraîchissement de session Supabase :", error);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
