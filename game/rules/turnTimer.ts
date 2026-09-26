import { RULES } from "@/game/rules/constants";
import type { GameState, PlayerId, TurnTimerState } from "@/game/state/types";

/**
 * DÉLAI DE TOUR — qui doit jouer, jusqu'à quand, et ce qui arrive s'il ne
 * joue pas.
 *
 * Le problème à résoudre : un joueur peut ABANDONNER, mais rien n'empêchait
 * une partie de rester `active` indéfiniment si quelqu'un fermait son
 * onglet. L'autre joueur restait assis devant une table qui ne bougerait
 * plus jamais.
 *
 * Trois décisions structurent l'implémentation.
 *
 * 1. **Le compteur vit dans l'ÉTAT DE PARTIE**, pas dans une colonne à
 *    côté. L'état est déjà ce que le serveur persiste et fait autorité
 *    (`match_states`), c'est déjà lui qui dit qui a la priorité, et c'est
 *    lui qui revient à l'identique après une reconnexion. Une échéance
 *    rangée ailleurs aurait deux vérités à tenir d'accord.
 *
 * 2. **L'expiration n'est jamais déclarée par le navigateur.** Le client ne
 *    reçoit qu'une échéance à afficher ; c'est le serveur qui, à chaque
 *    fois qu'il touche la partie (un coup, une lecture de la table par
 *    l'adversaire), compare l'heure et applique ce qui doit l'être. Il n'y
 *    a pas de tâche de fond : la partie n'a besoin d'avancer que quand
 *    quelqu'un la regarde.
 *
 3. **Ce qui est mesuré, c'est l'inactivité, pas le tour.** Le même délai
 *    vaut pour tout ce que le moteur peut attendre — un tour, une fenêtre
 *    de réaction, un choix forcé : un joueur absent l'est devant l'un comme
 *    devant l'autre.
 *
 * 4. **Un délai DÉGRESSIF, puis le forfait** (décision du 26/09/2026, qui
 *    remplace « trois minutes et la partie s'arrête » du 22/09) : trois
 *    minutes, et l'échéance fait passer le tour ; si le même joueur laisse
 *    encore filer la suivante, il n'a plus que deux minutes, puis une ; la
 *    TROISIÈME échéance d'affilée vaut forfait (`MAX_MISSED_DEADLINES`).
 *    Un seul geste remet tout à zéro (`withDeadlineMet`) : un joueur
 *    distrait perd un tour, un joueur parti perd la partie.
 */

/** Qui le moteur attend, à cet instant — la seule réponse qui vaille pour un chrono. */
export function playerToAct(state: GameState): PlayerId | undefined {
  if (state.status !== "active") return undefined;
  if (state.pendingReaction) return state.pendingReaction.awaitingPlayerId;
  if (state.pendingChoice) return state.pendingChoice.playerId;
  return state.activePlayerId;
}

/**
 * Combien de temps le joueur attendu a pour agir. Le MÊME délai quelle que
 * soit la question posée (décision du 22/09/2026) : ce qu'on mesure n'est
 * pas « un tour » mais « du mouvement sur le plateau ». Il se RÉDUIT d'une
 * minute par échéance déjà manquée d'affilée (3, puis 2, puis 1 minute).
 */
export function allowanceFor(
  state: GameState,
  playerId: PlayerId | undefined = state.turnTimer?.awaitingPlayerId ?? playerToAct(state)
): number {
  const missed = playerId ? missedDeadlines(state, playerId) : 0;
  return Math.max(RULES.INACTIVITY_FLOOR_MS, RULES.INACTIVITY_LIMIT_MS - Math.max(0, missed) * RULES.INACTIVITY_STEP_MS);
}

/**
 * Seuils d'alerte en TEMPS RESTANT, tirés des paliers du délai plein
 * (`INACTIVITY_WARNINGS_MS`, en écoulé sur trois minutes) : attention à
 * deux minutes de la fin, urgence à une. Un délai réduit démarre donc
 * directement au bon niveau d'alerte — le joueur a déjà laissé filer.
 */
export function warningThresholdsRemaining(): number[] {
  return RULES.INACTIVITY_WARNINGS_MS.map((ecoule) => RULES.INACTIVITY_LIMIT_MS - ecoule).sort((a, b) => b - a);
}

/**
 * Paliers d'alerte encore à venir pour le chrono en cours, en horodatages
 * absolus — seulement ceux qui tombent APRÈS le départ du chrono et avant
 * l'échéance. Lus par l'interface ; ils ne changent rien à l'état.
 */
export function warningTimes(state: GameState): number[] {
  const timer = state.turnTimer;
  if (!timer) return [];
  const allowance = allowanceFor(state);
  return warningThresholdsRemaining()
    .filter((restant) => restant < allowance)
    .map((restant) => timer.deadlineAt - restant);
}

/**
 * Remet le chrono à l'heure après une action.
 *
 * Il repart quand la QUESTION change — un autre joueur à la manœuvre, ou
 * la même personne mais devant autre chose (son tour, puis une fenêtre de
 * réaction). Tant que la question ne bouge pas, l'échéance ne bouge pas
 * non plus : sans quoi une action sans conséquence (avancer de phase,
 * regarder son Cimetière) suffirait à repartir de zéro indéfiniment.
 */
export function refreshTurnTimer(state: GameState, now: number): GameState {
  const awaiting = playerToAct(state);
  if (!awaiting) {
    return state.turnTimer ? { ...state, turnTimer: undefined } : state;
  }

  const kind = state.pendingReaction ? "reaction" : state.pendingChoice ? "choice" : "turn";
  const current = state.turnTimer;
  if (current && current.awaitingPlayerId === awaiting && current.kind === kind) return state;

  const timer: TurnTimerState = { awaitingPlayerId: awaiting, kind, deadlineAt: now + allowanceFor(state, awaiting) };
  return { ...state, turnTimer: timer };
}

/** L'échéance est-elle passée ? `now` vient TOUJOURS du serveur. */
export function turnTimerExpired(state: GameState, now: number): boolean {
  if (state.status !== "active" || !state.turnTimer) return false;
  return now >= state.turnTimer.deadlineAt;
}

/** Échéances consécutives déjà manquées par ce joueur. */
export function missedDeadlines(state: GameState, playerId: PlayerId): number {
  return state.players.find((p) => p.id === playerId)?.missedDeadlines ?? 0;
}

/**
 * La prochaine échéance manquée par ce joueur vaut-elle abandon ? Lu par le
 * moteur pour trancher, et par l'interface pour prévenir avant.
 */
export function nextTimeoutEndsGame(state: GameState, playerId: PlayerId): boolean {
  return missedDeadlines(state, playerId) + 1 >= RULES.MAX_MISSED_DEADLINES;
}
