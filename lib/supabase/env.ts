/**
 * Lecture centralisée de l'URL et de la clé publique Supabase, avec repli
 * sur les deux noms de variable possibles pour la clé : Supabase a
 * renommé la clé "anon" en "publishable" sur les projets récents, et
 * l'écran d'intégration Vercel⇄Supabase peut donc pousser une variable
 * nommée `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` plutôt que le
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` historiquement utilisé dans ce projet.
 * Sans ce repli, une clé bien configurée sous l'autre nom est vue comme
 * absente ("Your project's URL and Key are required...") alors qu'elle
 * existe réellement dans les settings Vercel.
 */
export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}
