import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import type { GameState } from "@/game/state/types";

/**
 * Résout une SUITE d'effets — et sait s'interrompre.
 *
 * Tous les appelants (pose, Bris, capacité déclenchée, réaction, capacité
 * de Navire, option de capacité) faisaient la même boucle à la main. Elle
 * suffisait tant qu'aucun effet ne demandait quoi que ce soit au joueur.
 *
 * « Défaussez 1 carte » le demande. Et un texte comme « défaussez 1 carte.
 * Si une carte Un Dead a rejoint votre Cimetière ce tour, piochez 1 carte
 * supplémentaire » (Le Goûter) évalue sa condition APRÈS la défausse : la
 * pioche ne peut donc pas se résoudre avant que le joueur ait répondu.
 *
 * D'où cette boucle unique : dès qu'un effet ouvre un choix de défausse,
 * elle ACCROCHE au choix les effets qui restent et s'arrête. `resolveChoice`
 * les reprendra une fois les cartes désignées parties. Le reste de l'action
 * en cours (déclencheurs d'arrivée, fenêtre de réaction…) continue comme
 * pour n'importe quel choix en attente — `dispatch` refuse déjà toute autre
 * action tant qu'il est ouvert.
 */
export function resolveEffectSequence(
  state: GameState,
  effects: readonly EffectDefinition[],
  context: EffectContext
): { state: GameState; events: GameEvent[] } {
  let nextState = state;
  const events: GameEvent[] = [];

  for (let i = 0; i < effects.length; i += 1) {
    const result = resolveEffect(nextState, effects[i]!, context);
    nextState = result.state;
    events.push(...result.events);

    const choice = nextState.pendingChoice;
    // `continuation` déjà posée : le choix vient d'une séquence PLUS
    // ANCIENNE qu'on est en train de reprendre, ce n'est pas à celle-ci de
    // la réécrire.
    if (choice?.kind === "handDiscard" && !choice.continuation) {
      const rest = effects.slice(i + 1);
      if (rest.length > 0) {
        nextState = {
          ...nextState,
          pendingChoice: { ...choice, continuation: { effects: [...rest], context: { ...context } } },
        };
      }
      break;
    }
  }

  return { state: nextState, events };
}
