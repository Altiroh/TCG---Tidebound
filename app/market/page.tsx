import { MarketScreen } from "@/features/market/MarketScreen";
import { fetchBoosterInventory } from "@/features/boosters/actions";
import { loadCollectables } from "@/features/cosmetics/collectablesService";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Market — la BOUTIQUE, trois rayons : boosters (Tides, au panier), decks
 * préconstruits (un Jeton) et cosmétiques (Tides). Ouvrir les boosters se
 * fait dans « Mes boosters » (`/boosters`) ; équiper un cosmétique dans
 * Collectables ; consulter la fiche d'un deck dans Decks.
 *
 * Même lecture serveur que l'écran de réserve (`fetchBoosterInventory` :
 * catalogue, prix, solde, exemplaires possédés), plus le rayon des decks et
 * celui des Collectables — les trois en parallèle. Chaque achat passe par
 * une Server Action autoritaire.
 */
export default async function MarketPage() {
  const user = await getSessionUser().catch(() => null);
  const [inventory, catalog, collectables] = await Promise.all([
    fetchBoosterInventory(),
    fetchDeckCatalog(),
    loadCollectables(user?.id ?? null).catch((error) => {
      console.error("[MarketPage] Collectables illisibles :", error);
      return loadCollectables(null);
    }),
  ]);

  return <MarketScreen inventory={inventory} catalog={catalog} collectables={collectables} />;
}
