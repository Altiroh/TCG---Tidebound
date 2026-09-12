import { BoostersScreen } from "@/features/boosters/BoostersScreen";
import { fetchBoosterInventory } from "@/features/boosters/actions";

/**
 * Boosters du joueur — inventaire, achat, ouverture. L'inventaire est lu
 * côté serveur ; l'ouverture elle-même passe par une Server Action
 * autoritaire (`features/boosters/actions.ts`), jamais par le navigateur.
 */
export default async function BoostersPage() {
  const inventory = await fetchBoosterInventory();

  return <BoostersScreen inventory={inventory} />;
}
