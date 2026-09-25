"use client";

import { useEffect } from "react";
import { silenceMenuAmbiance, startMenuAmbiance, stopMenuAmbiance } from "@/lib/sound";

/**
 * L'ambiance sonore du menu — montée UNE fois dans la mise en page : elle
 * suit le joueur sur tous les écrans du menu (Decks, Collection, Market,
 * Profil…). Seule une partie la fait taire (`useNoMenuAmbiance`).
 */
export function MenuAmbiance() {
  useEffect(() => {
    startMenuAmbiance();
    return () => stopMenuAmbiance();
  }, []);

  return null;
}

/** À appeler par une table de partie : pas de musique du menu tant qu'elle est à l'écran. */
export function useNoMenuAmbiance(): void {
  useEffect(() => silenceMenuAmbiance(), []);
}
