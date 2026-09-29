"use client";

import { PRECON_DECKS } from "@/game";
import { NewMatchScreen } from "@/features/match/NewMatchScreen";

/**
 * Bac à sable de l'écran JOUER (`/game/jouer-preview`) : le vrai
 * `NewMatchScreen`, tous les préconstruits ouverts, et un lancement qui ne
 * lance rien — on règle l'écran sans créer de partie.
 */
export function JouerPreview() {
  return (
    <NewMatchScreen
      onStart={() => undefined}
      unlockedDeckIds={PRECON_DECKS.map((deck) => deck.id)}
      botNote="Labo : le lancement ne fait rien."
    />
  );
}
