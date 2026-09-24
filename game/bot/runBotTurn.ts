import { chooseBotAction } from "@/game/bot/chooseAction";
import type { BotDifficulty } from "@/game/bot/types";
import { dispatch } from "@/game/engine";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * Garde-fou défensif contre une boucle infinie — en pratique largement
 * suffisant pour un tour complet (cartes jouées + permanents
 * sabordés/brisés + attaques + éventuelles réactions), jamais atteint en
 * jeu normal.
 */
const MAX_ACTIONS_PER_TURN = 40;

/** `true` si CE joueur a quelque chose à décider maintenant : soit c'est son tour, soit une fenêtre de réaction ou un choix forcé (ex: Le Fond Vous Regarde) l'attend (peut survenir hors de son tour — ex: l'adversaire vient de jouer une carte). */
export function botHasSomethingToDo(state: GameState, playerId: PlayerId): boolean {
  // Tant qu'une fenêtre de réaction ou un choix est ouvert, SEUL le joueur
  // attendu peut agir (`dispatch` refuse tout le reste) — même si l'autre est
  // le joueur actif.
  if (state.pendingReaction) return state.pendingReaction.awaitingPlayerId === playerId;
  if (state.pendingChoice) return state.pendingChoice.playerId === playerId;
  return state.activePlayerId === playerId;
}

export interface BotTurnStep {
  state: GameState;
  /** `true` si le bot n'a plus rien à faire (tour terminé, ou fin de partie en cours de tour) — plus la peine d'appeler `stepBotTurn` à nouveau. */
  done: boolean;
}

/**
 * Exécute UNE SEULE action du bot, plutôt que tout son tour d'un coup —
 * pensé pour être rappelé par l'UI avec un délai entre chaque appel
 * (`MatchBoard`), pour que le tour du bot se joue visiblement carte par
 * carte plutôt que de "téléporter" instantanément vers son état final.
 * Même logique de secours que l'ancien `runBotTurn` (une action censée
 * être valide mais refusée force `endTurn`/`passReaction`).
 */
export function stepBotTurn(state: GameState, playerId: PlayerId, difficulty: BotDifficulty): BotTurnStep {
  if (state.status !== "active" || !botHasSomethingToDo(state, playerId)) return { state, done: true };

  const action = chooseBotAction(state, playerId, difficulty);
  const result = dispatch(state, action);
  if (!result.ok) {
    // L'Ancrage pèse bien plus lourd que la Raison dans `evaluateState` :
    // "perdre de la Raison" est le repli le plus sûr par défaut si le choix
    // normalement évalué par `chooseBotAction` a, contre toute attente, échoué.
    const fallbackAction = state.pendingReaction
      ? { type: "passReaction" as const, playerId }
      : state.pendingChoice
        ? {
            type: "resolveChoice" as const,
            playerId,
            choice:
              state.pendingChoice.kind === "abilityOption"
                ? { abilityIndex: state.pendingChoice.abilityIndexes[0] ?? 0 }
                : state.pendingChoice.kind === "pickUnits"
                  ? { pickInstanceIds: [] as string[] }
                : state.pendingChoice.kind === "chromaticColor"
                  ? // Une couleur imposée doit être choisie : la première suffit.
                    { color: state.pendingChoice.options[0]! }
                : state.pendingChoice.kind === "deckTopDecision"
                  ? { deckTop: "keep" as const }
                : state.pendingChoice.kind === "keepUnits"
                  ? // Ne rien garder est légal ; le repli n'a pas à être
                    // bon, seulement valide.
                    { keepInstanceIds: [] as string[] }
                : state.pendingChoice.kind === "healAllocation"
                  ? // Ne rien répartir est légal (« jusqu'à N ») : le repli
                    // n'a pas à être bon, seulement valide.
                    { healAllocation: [] as Array<{ instanceId: string; amount: number }> }
                : state.pendingChoice.kind === "deckLook"
                  ? // Ne rien prendre est toujours légal : les cartes
                    // regardées repassent sous la pioche.
                    { takeInstanceIds: [] }
                  : state.pendingChoice.kind === "handDiscard"
                  ? // Un repli doit rester LÉGAL : une défausse attend
                    // exactement son compte de cartes (un « jusqu'à N » se
                    // satisfait, lui, de n'en désigner aucune).
                    {
                      discardInstanceIds: state.pendingChoice.atMost
                        ? []
                        : (state.players.find((p) => p.id === playerId)?.hand ?? [])
                            .slice(0, state.pendingChoice.count)
                            .map((card) => card.instanceId),
                    }
                  : ("reasonLoss" as const),
          }
        : { type: "endTurn" as const, playerId };
    const fallback = dispatch(state, fallbackAction);
    return { state: fallback.ok ? fallback.state : state, done: true };
  }

  const nextState = result.state;
  // Ce qui décide, c'est « ce joueur a-t-il encore quelque chose à
  // décider », jamais le TYPE de la dernière action. Rendre la main peut
  // ouvrir une fenêtre qui attend ce même joueur — l'annonce d'une Marée
  // au tour d'en face, une capacité de Navire qui s'y active — et un
  // `done` posé sur « c'était un endTurn » laissait alors la partie
  // suspendue sur une question que personne ne venait plus poser.
  const done = nextState.status !== "active" || !botHasSomethingToDo(nextState, playerId);
  return { state: nextState, done };
}

/**
 * Joue un tour ENTIER pour le bot EN UNE FOIS (boucle synchrone complète,
 * sans rythme visuel) — utilisé par les tests et tout appelant qui n'a pas
 * besoin d'animer le tour action par action. L'UI de jeu (`MatchBoard`)
 * utilise `stepBotTurn` à la place, pour espacer les actions dans le
 * temps.
 */
export function runBotTurn(initialState: GameState, playerId: PlayerId, difficulty: BotDifficulty): GameState {
  let state = initialState;

  for (let i = 0; i < MAX_ACTIONS_PER_TURN; i++) {
    const step = stepBotTurn(state, playerId, difficulty);
    state = step.state;
    if (step.done) return state;
  }

  return state;
}

/**
 * Garde-fou de `runBotUntilIdle` : un tour complet (40 actions max, cf.
 * `MAX_ACTIONS_PER_TURN`) plus de la marge pour les réactions et choix forcés
 * qui peuvent s'intercaler.
 */
const MAX_ACTIONS_UNTIL_IDLE = 120;

/**
 * Fait jouer le bot jusqu'à ce qu'il n'ait plus rien à décider — son tour
 * entier, ou une réaction / un choix forcé survenu pendant le tour de
 * l'adversaire — et retourne CHAQUE état intermédiaire, dans l'ordre.
 *
 * Utilisé par les parties contre bot arbitrées côté serveur
 * (`features/matches/matchStore.ts`) : le serveur fait jouer le bot après le
 * coup du joueur, puis renvoie ces états pour que le client rejoue le tour
 * du bot action par action. Retourne un tableau vide si le bot n'a rien à
 * faire.
 */
export function runBotUntilIdle(initialState: GameState, playerId: PlayerId, difficulty: BotDifficulty): GameState[] {
  const frames: GameState[] = [];
  let state = initialState;

  for (let i = 0; i < MAX_ACTIONS_UNTIL_IDLE; i++) {
    if (state.status !== "active" || !botHasSomethingToDo(state, playerId)) break;
    const step = stepBotTurn(state, playerId, difficulty);
    // Aucune progression possible (même le repli a été refusé) : on s'arrête
    // plutôt que de boucler sur le même état.
    if (step.state === state) break;
    state = step.state;
    frames.push(state);
  }

  return frames;
}
