import { getCardDefinition, isAbyssalVariant, type GameEvent } from "@/game";

/**
 * ARRIVÉE D'UNE ABYSSALE (demande du 13/10/2026) : « à l'invocation d'une
 * Abyssale, une petite animation spécifique — tremblement, et léger effet
 * sur l'écran des deux joueurs ».
 *
 * La partie pure : quelles cartes Abyssales viennent d'arriver en jeu dans
 * un lot d'événements — posées depuis la main ou invoquées par un effet.
 * Chaque écran la lit sur SON propre état (hot-seat, bot, chacun des deux
 * joueurs en ligne) : les deux joueurs la voient.
 */
export function abyssalArrivals(events: readonly GameEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    if (event.type !== "SUMMON") continue;
    if (isAbyssalVariant(getCardDefinition(event.cardId))) ids.push(event.instanceId);
  }
  return ids;
}
