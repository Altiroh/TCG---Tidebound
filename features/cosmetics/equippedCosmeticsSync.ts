"use client";

import { fetchMyEquippedCosmetics } from "@/features/cosmetics/collectablesActions";

type Equipped = Awaited<ReturnType<typeof fetchMyEquippedCosmetics>>;

let inFlight: Promise<Equipped> | null = null;

/**
 * Cosmétiques équipés, UNE lecture pour les deux fournisseurs (dos de
 * carte, cadre de Navire) : ils relisaient chacun la même chose au même
 * moment — deux server actions en file au démarrage, et deux encore à
 * chaque retour sur l'onglet (audit de fluidité du 14/10/2026).
 */
export function readMyEquippedCosmetics(): Promise<Equipped> {
  if (!inFlight) {
    inFlight = fetchMyEquippedCosmetics().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
