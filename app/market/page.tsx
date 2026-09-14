import { MarketScreen } from "@/features/market/MarketScreen";
import { fetchBoosterInventory } from "@/features/boosters/actions";

/**
 * Market — la BOUTIQUE : acheter des boosters contre des Tides. Les ouvrir
 * se fait dans « Mes boosters » (`/boosters`).
 *
 * Même lecture serveur que l'écran de réserve (`fetchBoosterInventory` :
 * catalogue, prix, solde, exemplaires possédés) — la boutique a besoin du
 * solde et de ce qu'on possède déjà, pas d'une seconde requête. L'achat
 * lui-même passe par une Server Action autoritaire
 * (`features/boosters/actions.ts` → `purchase_booster`).
 */
export default async function MarketPage() {
  const inventory = await fetchBoosterInventory();

  return <MarketScreen inventory={inventory} />;
}
