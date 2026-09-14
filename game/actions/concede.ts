import type { ActionResult, ConcedeAction } from "@/game/actions/types";
import type { GameState } from "@/game/state/types";

/**
 * Abandon volontaire — "abandonner le navire". Le joueur déclare forfait,
 * son adversaire l'emporte immédiatement.
 *
 * Seule action du moteur qui n'appartient à personne en particulier : elle
 * n'exige ni d'être le joueur actif, ni une phase donnée, ni même qu'aucune
 * fenêtre de réaction ne soit ouverte (cf. `dispatch`). On doit pouvoir
 * quitter une partie à n'importe quel moment — y compris pendant le tour
 * adverse, ou en attendant une réponse qui ne viendra jamais.
 */
export function concede(state: GameState, action: ConcedeAction): ActionResult {
  if (state.status !== "active") return { ok: false, error: "La partie est déjà terminée." };

  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return { ok: false, error: "Joueur inconnu." };

  // Pas de `find` inversé sur 3 joueurs possibles : une partie est toujours
  // à deux, l'adversaire est donc l'autre — `undefined` seulement dans un
  // état dégradé, auquel cas la partie se termine sans vainqueur.
  const opponent = state.players.find((p) => p.id !== action.playerId);

  return {
    ok: true,
    // `pendingReaction`/`pendingChoice` encore ouverts sont nettoyés par
    // `dispatch` dès que la partie n'est plus `active` — inutile de le
    // refaire ici.
    state: { ...state, status: "finished", winnerId: opponent?.id },
    events: [
      {
        type: "GAME_ENDED",
        turnNumber: state.turnNumber,
        timestamp: Date.now(),
        winnerId: opponent?.id,
        reason: "concede",
      },
    ],
  };
}
