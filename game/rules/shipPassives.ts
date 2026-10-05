import { getCardDefinition } from "@/game/cards/sets/core";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameEvent } from "@/game/events/types";
import { armorEvents, armorOf } from "@/game/state/armor";
import type { GameState } from "@/game/state/types";

/** Clé « déjà pris ce tour » de l'Armure d'arrivée du Navire (`turnDiscountsUsed`, partagé avec les réductions du tour). */
const CLE = "shipArrivalArmor";

/**
 * Passifs de Navire liés aux ARRIVÉES (Lot 17 — Île-Tortue Opaline : « la
 * première fois qu'un Opalin arrive en jeu à chacun de vos tours, gagnez 1
 * Armure »). Lus sur les `SUMMON` de l'action : posée depuis la main ou
 * invoquée, une arrivée est une arrivée.
 */
export function applyShipArrivalPassives(state: GameState, events: readonly GameEvent[], turnNumber: number): { state: GameState; events: GameEvent[] } {
  let next = state;
  const produits: GameEvent[] = [];
  for (const event of events) {
    if (event.type !== "SUMMON" || next.activePlayerId !== event.playerId) continue;
    const joueur = next.players.find((p) => p.id === event.playerId);
    if (!joueur) continue;
    const spec = getShipDefinition(joueur.shipId).armorOnFirstArchetypeArrivalEachTurn;
    if (!spec || getCardDefinition(event.cardId).archetype !== spec.archetype) continue;
    const pris = joueur.turnDiscountsUsed?.turnNumber === turnNumber ? joueur.turnDiscountsUsed.keys : [];
    if (pris.includes(CLE)) continue;
    const apres = armorOf(joueur) + spec.amount;
    next = {
      ...next,
      players: next.players.map((p) =>
        p.id === joueur.id ? { ...p, armor: apres, turnDiscountsUsed: { turnNumber, keys: [...pris, CLE] } } : p
      ) as GameState["players"],
    };
    produits.push(...armorEvents(joueur.id, spec.amount, apres, turnNumber));
  }
  return { state: next, events: produits };
}
