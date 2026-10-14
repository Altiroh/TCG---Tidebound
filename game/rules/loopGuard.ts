import type { GameState } from "@/game/state/types";

/**
 * ANTI-BOUCLE (refonte du 13/10/2026) : pas de plafond arbitraire de tours
 * de boucle. Une résolution en chaîne (passe de morts, Éveils qui
 * s'enchaînent) s'arrête quand elle retombe sur un état DÉJÀ vu sans avoir
 * progressé, ou quand la partie est jouée (une coque à 0).
 *
 * L'empreinte ne garde que ce qui fait la position : cartes en jeu (par
 * carte, pas par instance — un corps rappelé est un nouvel exemplaire du
 * même), dégâts, modificateurs, marqueurs, Raison, Ancrage, Armure, tailles
 * de main et de pioche, Marée. Les journaux (événements, arrivées au
 * Cimetière) et le Cimetière lui-même n'en sont pas : ils grossissent à
 * chaque tour de boucle sans que rien ne change sur la table.
 */
export function positionFingerprint(state: GameState): string {
  const players = state.players.map((p) => ({
    board: p.board
      .map((u) =>
        [u.cardId, u.damageMarked, u.modifiers.length, u.pendingRemoval ?? "", JSON.stringify(u.markers ?? {}), u.attachedToInstanceId ? 1 : 0].join("|")
      )
      .sort(),
    reason: p.reason,
    anchor: p.anchor,
    armor: p.armor ?? 0,
    hand: p.hand.length,
    deck: p.deck.length,
  }));
  return JSON.stringify([players, state.environment.tideState, state.environment.lande?.cardId ?? ""]);
}

/** La partie est jouée : une coque est tombée, plus rien ne doit s'enchaîner. */
export function positionSettled(state: GameState): boolean {
  return state.status !== "active" || state.players.some((p) => p.anchor <= 0);
}

/**
 * Mémoire des positions d'une résolution en chaîne : `true` si celle-ci a
 * déjà été vue. `geste` distingue deux gestes différents posés sur la même
 * position (l'Éveil de deux cartes distinctes).
 */
export function createLoopGuard(): (state: GameState, geste?: string) => boolean {
  const vues = new Set<string>();
  return (state, geste = "") => {
    const empreinte = `${geste}#${positionFingerprint(state)}`;
    if (vues.has(empreinte)) return true;
    vues.add(empreinte);
    return false;
  };
}
