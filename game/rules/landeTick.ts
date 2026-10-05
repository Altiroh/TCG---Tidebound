import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import { activeLandeRules, sendLandeToGraveyard } from "@/game/rules/lande";
import type { GameState } from "@/game/state/types";

/**
 * Fin d'un tour de JOUEUR : la Lande en jeu décompte un demi-tour de table.
 *
 * Un tour de table, pour une Lande, ce sont les deux tours de joueur qui
 * suivent sa pose — le sien qui s'achève, puis celui de l'adversaire —,
 * puis les deux suivants, etc. Chaque fois que le décompte retombe sur un
 * nombre pair, un tour de table de la Lande vient de s'achever :
 *
 * 1. « À la fin de chaque tour de table, tous les permanents en jeu
 *    subissent N dégâts » (`damageAllPermanentsEachTableTurn`) — un effet
 *    de la Lande, donc de son propriétaire ;
 * 2. puis, si sa durée est écoulée, elle part au Cimetière de son
 *    propriétaire. Le dernier tour de table compte : il frappe AVANT le
 *    départ.
 *
 * Les morts sont laissées à `processDeaths`, que `dispatch` passe après
 * chaque action, fin de tour comprise.
 */
export function tickLande(state: GameState, turnNumber: number): { state: GameState; events: GameEvent[] } {
  const lande = state.environment.lande;
  if (!lande) return { state, events: [] };

  const remaining = lande.remainingPlayerTurns - 1;
  let nextState: GameState = { ...state, environment: { ...state.environment, lande: { ...lande, remainingPlayerTurns: remaining } } };
  const events: GameEvent[] = [];

  if (remaining % 2 === 0) {
    const damage = activeLandeRules(state.environment)?.damageAllPermanentsEachTableTurn;
    if (damage) {
      // À l'abri (Zone de repli) : le coup est ignoré pour ce permanent, et
      // l'abri est consommé. Les permanents abrités sont mis de côté le
      // temps du coup, puis rendus à leur place dans le rang.
      const abrites = new Map<string, number>();
      const sansAbrites: GameState = {
        ...nextState,
        players: nextState.players.map((p) => ({
          ...p,
          board: p.board.filter((u, index) => {
            if (!u.modifiers.some((m) => m.ignoresLande)) return true;
            abrites.set(u.instanceId, index);
            return false;
          }),
        })) as GameState["players"],
      };
      const hit = resolveEffect(
        sansAbrites,
        { type: "damage", target: { kind: "allUnits" }, amount: { kind: "flat", value: damage } },
        { controllerId: lande.ownerId, turnNumber }
      );
      nextState = {
        ...hit.state,
        players: hit.state.players.map((p) => {
          const avant = nextState.players.find((q) => q.id === p.id)!;
          const board = [...p.board];
          for (const unit of avant.board) {
            const index = abrites.get(unit.instanceId);
            if (index === undefined) continue;
            board.splice(Math.min(index, board.length), 0, { ...unit, modifiers: unit.modifiers.filter((m) => !m.ignoresLande) });
          }
          return { ...p, board };
        }) as GameState["players"],
      };
      events.push(...hit.events);
    }
  }

  if (remaining <= 0) {
    const gone = sendLandeToGraveyard(nextState, "expired", turnNumber);
    nextState = gone.state;
    events.push(...gone.events);
  }
  return { state: nextState, events };
}
