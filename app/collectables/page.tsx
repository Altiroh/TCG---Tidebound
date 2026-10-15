import { CollectablesScreen } from "@/features/cosmetics/CollectablesScreen";
import { loadCollectables, syncCollectables } from "@/features/cosmetics/collectablesService";
import { readAchievementStats } from "@/features/achievements/achievementService";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Collectables — ce que la collection compte d'autre que des cartes : dos de
 * carte, cadres de navire. Rendu à chaque visite : un palier franchi en
 * partie débloque un objet, qui doit apparaître au retour ici.
 */
export default async function CollectablesPage() {
  let userId: string | null = null;
  try {
    userId = (await getSessionUser())?.id ?? null;
  } catch (error) {
    console.error("[CollectablesPage] Impossible de résoudre l'utilisateur connecté :", error);
  }
  // Rattrape ce qui est dû mais pas encore crédité : la visite de cet
  // écran est l'endroit naturel pour ça, et l'opération est idempotente.
  // Les compteurs sont lus UNE fois : ils servent à l'octroi ET aux jauges
  // (ils ne dépendent pas des cosmétiques, que l'octroi seul modifie).
  const stats = userId ? await readAchievementStats(userId) : null;
  if (userId) await syncCollectables(userId, stats);
  const view = await loadCollectables(userId, stats).catch((error) => {
    console.error("[CollectablesPage] Lecture impossible :", error);
    return loadCollectables(null);
  });
  return <CollectablesScreen view={view} />;
}
