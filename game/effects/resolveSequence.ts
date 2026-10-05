import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import { closeDieRoll, dieRollHasOptions } from "@/game/rules/dice";
import type { DieRollChoice, GameState } from "@/game/state/types";

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
  // Joueurs qui ont PIOCHÉ par un effet de cette même suite : leur défausse
  // qui suit est un « piochez puis défaussez » (Oracle d'Améthyste).
  const ontPioche = new Set<string>();
  // « PIOCHEZ PUIS DÉFAUSSEZ » (règle du 05/10/2026) : cartes que la pioche
  // vient d'apporter, par joueur — la défausse qui suit ne peut pas les
  // désigner.
  const piochees = new Map<string, string[]>();

  for (let i = 0; i < effects.length; i += 1) {
    const effect = effects[i]!;
    const suivant = effects[i + 1];
    const piocheur = effect.type === "draw" && suivant?.type === "discard" ? lootPlayerId(nextState, effect, suivant, context) : undefined;
    let mainAvant: string[] | undefined;
    if (piocheur) {
      mainAvant = nextState.players.find((p) => p.id === piocheur)!.hand.map((card) => card.instanceId);
      // Rien d'autre à défausser que ce qu'on piocherait : l'effet ne
      // s'applique pas — ni la pioche, ni la défausse. Une défausse
      // facultative (« vous pouvez ») n'impose rien : la pioche a lieu.
      const aDefausser = suivant!.amount?.kind === "flat" ? suivant!.amount.value : 1;
      if (!suivant!.refusable && mainAvant.length < aDefausser) {
        i += 1;
        continue;
      }
    }

    const questionAvant = nextState.pendingChoice;
    const result = resolveEffect(nextState, effect, context);
    nextState = result.state;
    events.push(...result.events);
    for (const event of result.events) if (event.type === "DRAW_CARD") ontPioche.add(event.playerId);
    if (piocheur && mainAvant) {
      const avant = new Set(mainAvant);
      const nouvelles = nextState.players.find((p) => p.id === piocheur)!.hand.map((card) => card.instanceId).filter((id) => !avant.has(id));
      piochees.set(piocheur, nouvelles);
    }

    // UN JET DE DÉ vient d'être lancé (Lot 17) : s'il n'y a rien à y faire,
    // la Chaîne se ferme aussitôt et la suite se résout avec le résultat ;
    // sinon le jet attend le joueur, la suite accrochée à la question.
    if (nextState.pendingChoice?.kind === "dieRoll" && !nextState.pendingChoice.continuation && nextState.pendingChoice !== questionAvant) {
      const jet = nextState.pendingChoice;
      const rest = effects.slice(i + 1);
      if (!dieRollHasOptions(nextState, jet)) {
        const ferme = closeAndResolveDieRoll(nextState, { ...jet, continuation: { effects: [...rest] } });
        nextState = ferme.state;
        events.push(...ferme.events);
        break;
      }
      nextState = { ...nextState, pendingChoice: { ...jet, continuation: { effects: [...rest] } } };
      break;
    }

    let choice = nextState.pendingChoice;
    // La défausse qui suit la pioche : les cartes piochées sont hors d'atteinte.
    const exclues = choice?.kind === "handDiscard" && !choice.continuation ? piochees.get(choice.playerId) : undefined;
    if (choice?.kind === "handDiscard" && exclues && exclues.length > 0 && !choice.excludedInstanceIds) {
      const main = nextState.players.find((p) => p.id === choice!.playerId)!.hand;
      const count = Math.min(choice.count, main.length - exclues.length);
      if (count <= 0) {
        // Seule la pioche est en main (défausse facultative) : rien à
        // désigner, la question ne se pose pas.
        nextState = { ...nextState, pendingChoice: undefined };
        continue;
      }
      choice = { ...choice, excludedInstanceIds: exclues, count };
      nextState = { ...nextState, pendingChoice: choice };
    }
    if (choice?.kind === "handDiscard" && !choice.continuation && !choice.afterDraw && ontPioche.has(choice.playerId)) {
      choice = { ...choice, afterDraw: true };
      nextState = { ...nextState, pendingChoice: choice };
    }
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

/**
 * Le joueur d'un « piochez puis défaussez » : la pioche et la défausse qui
 * la suit visent le même joueur (soi-même, le plus souvent). `undefined`
 * sinon — deux effets sans rapport l'un avec l'autre.
 */
function lootPlayerId(
  state: GameState,
  draw: EffectDefinition,
  discard: EffectDefinition,
  context: EffectContext
): string | undefined {
  const joueur = (effect: EffectDefinition) =>
    effect.target.kind === "controllerPlayer"
      ? context.controllerId
      : effect.target.kind === "opponentPlayer"
        ? state.players.find((p) => p.id !== context.controllerId)?.id
        : undefined;
  const piocheur = joueur(draw);
  return piocheur && piocheur === joueur(discard) ? piocheur : undefined;
}

/**
 * FERMETURE D'UN JET (Lot 17) : le résultat retenu, son issue, puis ses
 * branches et la suite de la séquence — avec « ? » = le résultat — et enfin
 * les suites de critique d'autres cartes (Maurice, Miss Franche-Comté 1987),
 * chacune avec sa propre source. Appelé par la séquence (jet sans option),
 * par `resolveChoice` (« Valider le jet ») et par un Bris de Chaîne qui
 * laisse le joueur sans plus rien à faire.
 */
export function closeAndResolveDieRoll(state: GameState, choice: DieRollChoice): { state: GameState; events: GameEvent[] } {
  const fermeture = closeDieRoll(state, choice);
  let nextState = fermeture.state;
  const events: GameEvent[] = [...fermeture.events];
  for (const hook of fermeture.hooks) {
    const r = resolveEffectSequence(nextState, hook.effects, hook.context);
    nextState = r.state;
    events.push(...r.events);
  }
  const suite = resolveEffectSequence(nextState, fermeture.effects, fermeture.context);
  return { state: suite.state, events: [...events, ...suite.events] };
}

/** Après un geste sur un jet en cours : s'il ne reste rien à décider, la Chaîne se ferme d'elle-même. */
export function closeDieRollIfIdle(state: GameState): { state: GameState; events: GameEvent[] } {
  const jet = state.pendingChoice?.kind === "dieRoll" ? state.pendingChoice : undefined;
  if (!jet || jet.candidates !== undefined || dieRollHasOptions(state, jet)) return { state, events: [] };
  return closeAndResolveDieRoll(state, jet);
}
