import type { BoosterOpeningCard } from "@/features/boosters/opening/types";

/**
 * Contenu FACTICE du prototype d'ouverture. Aucune vraie carte, aucun lien
 * avec Supabase : la scène peut être rejouée indéfiniment sans effet.
 *
 * TODO(booster-serveur) : remplacer par le résultat de `openBooster()`
 * (`features/boosters/actions.ts`) converti via `toOpeningRarity`.
 */
export const MOCK_BOOSTER_CARDS: readonly BoosterOpeningCard[] = [
  { id: "mock-1", rarity: "standard" },
  { id: "mock-2", rarity: "standard" },
  { id: "mock-3", rarity: "rare" },
  { id: "mock-4", rarity: "standard" },
  { id: "mock-5", rarity: "abyssal" },
];
