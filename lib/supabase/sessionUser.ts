import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Ce que le code serveur lit de l'identité du joueur : son uuid, et son e-mail pour les replis d'affichage. */
export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Joueur connecté, vu depuis le serveur — UNE vérification par requête.
 *
 * Chaque lecture serveur appelait `auth.getUser()` pour son compte : un
 * aller-retour réseau vers Supabase Auth par appel, et une page comme la
 * Collection en enchaînait trois (collection, catalogue, onboarding) avant
 * de rendre quoi que ce soit. D'où la lenteur ressentie à chaque changement
 * d'écran.
 *
 * Deux gains, sans rien céder sur la sécurité :
 *   - `cache` (React) : dans un même rendu serveur, tous les appelants
 *     partagent la même vérification ;
 *   - `getClaims()` : avec des clés de signature asymétriques, le jeton est
 *     vérifié LOCALEMENT (signature + expiration, clés publiques mises en
 *     cache) ; avec une clé symétrique, la bibliothèque retombe d'elle-même
 *     sur `getUser()`. Dans les deux cas l'identité rendue est vérifiée,
 *     jamais lue telle quelle dans le cookie.
 *
 * Les opérations sensibles du compte (mot de passe, suppression) gardent
 * leur propre `getUser()` : elles valent un aller-retour de plus.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email = data.claims.email;
  return { id: data.claims.sub, email: typeof email === "string" && email ? email : null };
});
