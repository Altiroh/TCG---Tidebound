import { BoostersScreen } from "@/features/boosters/BoostersScreen";
import { fetchBoosterInventory } from "@/features/boosters/actions";

/**
 * Mes boosters — la RÉSERVE du joueur et son plan d'ouverture. L'achat est
 * ailleurs (`/market`).
 *
 * L'inventaire est lu côté serveur ; l'ouverture elle-même passe par une
 * Server Action autoritaire (`features/boosters/actions.ts` →
 * `open_booster`), jamais par le navigateur.
 */
export default async function BoostersPage() {
  const inventory = await fetchBoosterInventory();

  return <BoostersScreen inventory={inventory} />;
}
