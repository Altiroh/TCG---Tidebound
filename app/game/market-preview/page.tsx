import type { Metadata } from "next";
import { MarketScreen } from "@/features/market/MarketScreen";
import { previewBoosterInventory } from "@/features/boosters/previewInventory";
import { readDeckCatalog } from "@/features/decks/catalogService";
import { loadCollectables } from "@/features/cosmetics/collectablesService";

export const metadata: Metadata = {
  title: "Market Preview · Tidebound",
  description: "Écran temporaire de réglage de la boutique (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/market-preview`.
 *
 * Le vrai `/market` renvoie à la connexion : sans cette page, régler la
 * boutique demandait un compte. Tout y est FABRIQUÉ sans base :
 *   - la réserve de boosters est celle du laboratoire des boosters
 *     (`previewBoosterInventory`) ;
 *   - le rayon des decks et celui des cosmétiques sortent des lecteurs
 *     réels appelés SANS joueur (`readDeckCatalog(null)`,
 *     `loadCollectables(null)`), qui ne touchent pas la base dans ce cas —
 *     on y ajoute deux Jetons et un deck déjà débloqué, pour voir les deux
 *     états du rayon.
 *
 * `sandbox` : le bouton Acheter ne doit JAMAIS appeler les vraies Server
 * Actions depuis une page publique — un visiteur connecté y dépenserait
 * ses propres Tides sur un écran dont tous les chiffres sont inventés.
 * `?rayon=decks|cosmetics` ouvre directement un autre rayon ;
 * `?panier=1` remplit le panier.
 */
export default async function MarketPreviewRoute({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const [catalog, collectables] = await Promise.all([readDeckCatalog(null), loadCollectables(null)]);
  const rayon = searchParams.rayon === "decks" || searchParams.rayon === "cosmetics" ? searchParams.rayon : "boosters";

  return (
    <MarketScreen
      inventory={previewBoosterInventory()}
      catalog={{
        ...catalog,
        isSignedIn: true,
        preconTokens: 2,
        decks: catalog.decks.map((entry, index) => ({ ...entry, unlocked: index === 1 })),
      }}
      collectables={{ ...collectables, isSignedIn: true, balance: 74266 }}
      sandbox
      initialSection={rayon}
      initialCartFilled={Boolean(searchParams.panier)}
    />
  );
}
