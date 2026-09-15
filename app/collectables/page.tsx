import { CollectablesScreen } from "@/features/cosmetics/CollectablesScreen";
import { loadCollectables } from "@/features/cosmetics/collectablesService";
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
  const view = await loadCollectables(userId).catch((error) => {
    console.error("[CollectablesPage] Lecture impossible :", error);
    return loadCollectables(null);
  });
  return <CollectablesScreen view={view} />;
}
