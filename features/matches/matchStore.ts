import { botHasSomethingToDo, dispatch, runBotUntilIdle, stepBotTurn, toPlayerView, turnTimerExpired, type GameState, type PlayerAction } from "@/game";
import { waitUntil } from "@vercel/functions";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { awardMatchReward } from "@/features/progression/rewards";
import { botCountsAsPvp } from "@/features/progression/botRewardPolicy";
import { hasSaneActionShape, MAX_ACTIONS_PER_BATCH } from "@/features/matches/actionShape";
import { audienceOpponent, countsAsPlayedMatch, matchActivity, matchModePaysRewards, utcDayKey } from "@/game/progression";
import { recordMatchQuestProgress } from "@/features/quests/questService";
import { recordMatchLifetimeStats } from "@/features/achievements/lifetimeStatsService";
import { recordMatchBalanceReport } from "@/features/balance/balanceBankService";
import { recordMatchAudience } from "@/features/progression/hubService";
import { isRecentDeck } from "@/features/decks/recentDecks";
import { packFrames, type KnownLog, type PackedFrames } from "@/features/matches/matchFrames";

/**
 * Parties arbitrées côté serveur — PvP comme contre bot.
 *
 * Module SERVEUR sans directive `"use server"` : il manipule l'état complet
 * et la clé service_role, et n'est joignable qu'à travers les Server Actions
 * qui l'importent (`features/online/actions.ts`, `features/bot/actions.ts`),
 * lesquelles identifient toujours le joueur par sa session.
 *
 * Invariants :
 *   - l'état complet ne sort d'ici que projeté pour son destinataire
 *     (`toPlayerView`) ;
 *   - un coup n'est accepté que s'il est joué AU NOM de l'appelant ;
 *   - un coup n'est enregistré que sur la version d'état à partir de laquelle
 *     il a été calculé (`commit_match_state`, verrou optimiste) ;
 *   - la fin de partie est constatée ici, dans l'état autoritaire, et c'est
 *     ici — et seulement ici — que récompenses et quêtes sont déclenchées.
 */

export type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

/** `PlayerState.id` du bot dans une partie serveur : il n'a pas de profil, donc pas d'uuid. */
export const BOT_PLAYER_ID = "bot";

export interface MatchSnapshot {
  match: MatchRow;
  /** Vue projetée pour l'appelant ; `null` tant que la partie attend un second joueur. */
  view: GameState | null;
}

export interface MatchUpdate {
  match: MatchRow;
  /**
   * Vues successives, projetées pour l'appelant : l'état juste après son
   * coup, puis après chaque action du bot. Le client les rejoue une par une
   * pour que le tour du bot reste lisible, carte par carte. Emballées pour
   * ne transporter le journal qu'une fois (`unpackFrames` côté client).
   */
  frames: PackedFrames;
  /**
   * Partie contre bot : le bot a encore quelque chose à décider (son tour,
   * une réaction). Le client demande alors la suite (`advanceBot`) PENDANT
   * qu'il rejoue ce qu'il a déjà reçu.
   */
  botToMove: boolean;
}

export type StoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Résultat d'un enregistrement : `conflict` quand une autre écriture est passée entre la lecture et le verrou. */
type CommitResult = { ok: true; data: MatchUpdate } | { ok: false; error: string; conflict?: boolean };

export function isParticipant(match: MatchRow, userId: string): boolean {
  return match.player1_id === userId || match.player2_id === userId;
}

function service() {
  return createSupabaseServiceRoleClient();
}

async function loadMatchRow(matchId: string): Promise<MatchRow | null> {
  const { data, error } = await service().from("matches").select("*").eq("id", matchId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function loadFullState(matchId: string): Promise<{ state: GameState; version: number } | null> {
  const { data, error } = await service().from("match_states").select("state, version").eq("match_id", matchId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { state: data.state as GameState, version: data.version };
}

/** Partie + vue projetée pour un participant. `null` si la partie n'existe pas ou si l'appelant n'y joue pas. */
export async function loadSnapshot(matchId: string, userId: string): Promise<MatchSnapshot | null> {
  // En parallèle : l'état n'est renvoyé qu'après la vérification de
  // participation, qui reste la condition pour qu'il sorte d'ici.
  const [match, full] = await Promise.all([loadMatchRow(matchId), loadFullState(matchId)]);
  if (!match || !isParticipant(match, userId)) return null;
  return { match, view: full ? toPlayerView(full.state, userId) : null };
}

/** Partie contre bot, encore en cours, où le bot a quelque chose à décider. */
function botStillToMove(match: MatchRow, state: GameState): boolean {
  return match.mode === "bot" && state.status === "active" && botHasSomethingToDo(state, BOT_PLAYER_ID);
}

/** Uuid de profil du vainqueur, ou `null` (bot vainqueur, match nul, partie en cours). */
export function winnerUserId(match: MatchRow, state: GameState): string | null {
  const winner = state.winnerId;
  if (!winner) return null;
  if (winner === match.player1_id || winner === match.player2_id) return winner;
  if (winner !== BOT_PLAYER_ID) console.error(`[winnerUserId] Vainqueur non résolu pour la partie ${match.id} : "${winner}".`);
  return null;
}

/**
 * Réponse à un LOT de coups (`submitActions`). Les vues de `frames` se
 * répartissent entre les coups PRIS EN CHARGE, dans l'ordre :
 * `frameEnds[i]` est l'index (exclu) de la dernière vue du coup `i`. Les
 * vues d'un rattrapage d'échéance précèdent celles du premier coup ; celles
 * d'une première tranche du bot suivent celles du dernier.
 *
 * Les coups au-delà de `frameEnds.length` n'ont PAS été tentés — le bot a
 * pris la main entre-temps, ou la partie s'est terminée — sauf si
 * `rejected` est présent : le coup `rejected.index` a été refusé par le
 * moteur, ceux d'avant sont enregistrés, ceux d'après abandonnés.
 */
export interface MatchBatchUpdate extends MatchUpdate {
  frameEnds: number[];
  rejected?: { index: number; error: string };
}

/**
 * Applique un coup du joueur connecté et l'enregistre — un lot d'un seul
 * coup (`submitActions`), conservé pour les appelants existants.
 */
export async function submitAction(
  matchId: string,
  userId: string,
  action: PlayerAction,
  known?: KnownLog
): Promise<StoreResult<MatchBatchUpdate>> {
  return submitActions(matchId, userId, [action], known);
}

/** Refus de FORME ou d'identité d'un coup reçu du navigateur, avant toute lecture. `null` : recevable. */
function actionRejection(action: PlayerAction, userId: string): string | null {
  // Le moteur valide la légalité d'un coup, pas l'identité de celui qui
  // l'envoie : sans cette vérification, un joueur pourrait terminer le tour
  // de son adversaire, ou jouer à la place du bot.
  if (!action || typeof action !== "object" || action.playerId !== userId) return "Action refusée.";
  // Une échéance ne s'invoque pas, elle se constate : seul le serveur émet
  // `timeout` (`applyExpiredDeadlines`), avec SA propre heure. Reçue du
  // navigateur, elle porterait un `now` choisi par le joueur.
  if (action.type === "timeout") return "Action refusée.";
  // Forme avant légalité : nombres finis, chaînes et tableaux bornés.
  if (!hasSaneActionShape(action)) return "Action refusée.";
  return null;
}

/**
 * Applique un LOT de coups du joueur connecté — ceux qu'il a enchaînés
 * pendant qu'un autre était en route — avec UNE lecture, les `dispatch`
 * successifs et UN enregistrement : un aller-retour pour toute la file, au
 * lieu d'un par coup.
 *
 * Mêmes garanties que coup par coup : chaque coup est contrôlé (identité,
 * forme) et revalidé par le moteur sur l'état laissé par le précédent. Un
 * coup refusé arrête le lot : ce qui précède est enregistré, ce qui suit
 * abandonné (`rejected`). Contre le bot, le lot s'arrête dès que le bot a
 * la main — joué coup par coup, il aurait répondu avant le coup suivant —
 * et les coups restants ne sont pas tentés (le client les renvoie).
 */
export async function submitActions(
  matchId: string,
  userId: string,
  actions: readonly PlayerAction[],
  known?: KnownLog
): Promise<StoreResult<MatchBatchUpdate>> {
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_ACTIONS_PER_BATCH) {
    return { ok: false, error: "Action refusée." };
  }
  // Un coup irrecevable coupe le lot à cet endroit, comme un refus du moteur.
  let receivable = actions.length;
  let rejection: string | null = null;
  for (let index = 0; index < actions.length; index += 1) {
    rejection = actionRejection(actions[index]!, userId);
    if (rejection) {
      receivable = index;
      break;
    }
  }
  if (receivable === 0) return { ok: false, error: rejection ?? "Action refusée." };
  const batch = actions.slice(0, receivable);
  const shapeRejected = rejection ? { index: receivable, error: rejection } : undefined;

  // Une écriture concurrente — l'écran de l'adversaire qui constate une
  // échéance au même instant, typiquement — fait échouer l'enregistrement
  // sous verrou optimiste. Les coups n'ont alors PAS eu lieu : on les rejoue
  // sur l'état frais, que le moteur revalide entièrement (un coup devenu
  // illégal est refusé comme n'importe quel autre). Le joueur n'a plus à
  // refaire son geste sur un « la partie a changé entre-temps ».
  let attempt = await submitActionsOnce(matchId, userId, batch, known);
  for (let retry = 1; retry < MAX_COMMIT_ATTEMPTS && !attempt.ok && attempt.conflict; retry += 1) {
    attempt = await submitActionsOnce(matchId, userId, batch, known);
  }
  if (!attempt.ok) return { ok: false, error: attempt.error };
  // Le lot a été joué jusqu'au coup irrecevable : c'est lui qui l'arrête.
  if (shapeRejected && !attempt.data.rejected && attempt.data.frameEnds.length === batch.length) {
    return { ok: true, data: { ...attempt.data, rejected: shapeRejected } };
  }
  return attempt;
}

/** Tentatives d'enregistrement d'un même coup face à des écritures concurrentes. */
const MAX_COMMIT_ATTEMPTS = 3;

type BatchCommitResult = { ok: true; data: MatchBatchUpdate } | { ok: false; error: string; conflict?: boolean };

async function submitActionsOnce(matchId: string, userId: string, actions: readonly PlayerAction[], known?: KnownLog): Promise<BatchCommitResult> {
  // Les deux lectures en parallèle : un aller-retour en base de moins par
  // coup. L'état complet ne quitte jamais cette fonction, il n'y a donc rien
  // à protéger en attendant la vérification de participation.
  const [match, full] = await Promise.all([loadMatchRow(matchId), loadFullState(matchId)]);
  if (!match || !isParticipant(match, userId)) return { ok: false, error: "Partie introuvable." };
  if (match.status !== "active") return { ok: false, error: "Cette partie n'est pas en cours." };
  if (!full) return { ok: false, error: "Cette partie n'est pas en cours." };

  // Le délai de l'ADVERSAIRE d'abord : s'il a laissé filer son tour, c'est
  // au moment où quelqu'un touche la partie que ça se constate. Jamais le
  // délai de l'appelant — il vient précisément de jouer, fût-ce en retard.
  const frames: GameState[] = [];
  const rattrape = applyExpiredDeadlines(full.state, match, Date.now(), userId);
  frames.push(...rattrape.frames);
  let state = rattrape.state;

  // Le rattrapage a pu terminer la partie (abandon automatique) : le coup
  // qui suit n'a plus lieu d'être, mais ce qui vient d'arriver, si. Le
  // premier coup est pris en charge (sans effet), les suivants non tentés.
  if (state.status !== "active") {
    return withFrameEnds(await commitAndSettle(matchId, userId, match, full.version, frames, state, known), [frames.length]);
  }

  const frameEnds: number[] = [];
  let rejected: MatchBatchUpdate["rejected"];
  for (let index = 0; index < actions.length; index += 1) {
    const result = dispatch(state, actions[index]!);
    if (!result.ok) {
      rejected = { index, error: result.error };
      break;
    }
    state = result.state;
    frames.push(state);
    frameEnds.push(frames.length);
    // Partie terminée, ou le bot a quelque chose à décider (son tour, une
    // réaction) : coup par coup, il aurait répondu avant le coup suivant.
    if (state.status !== "active" || botStillToMove(match, state)) break;
  }
  // Refusé dès le premier coup : rien n'a eu lieu, rien n'est enregistré.
  if (frameEnds.length === 0) return { ok: false, error: rejected?.error ?? "Action refusée." };

  // PREMIÈRE TRANCHE DU BOT dans la même requête : le plus souvent, son tour
  // entier (quelques millisecondes en facile/moyen), sans second aller-retour.
  // Le reste se demande comme avant (`advanceBot`, `botToMove`).
  if (!rejected && botStillToMove(match, state)) {
    const inline = playBotSlice(state, match, BOT_INLINE_BUDGET_MS, { inline: true });
    if (inline.frames.length > 0) {
      frames.push(...inline.frames);
      state = inline.state;
      frameEnds[frameEnds.length - 1] = frames.length;
    }
  }

  const committed = await commitAndSettle(matchId, userId, match, full.version, frames, state, known);
  return withFrameEnds(committed, frameEnds, rejected);
}

function withFrameEnds(result: CommitResult, frameEnds: number[], rejected?: MatchBatchUpdate["rejected"]): BatchCommitResult {
  if (!result.ok) return result;
  return { ok: true, data: { ...result.data, frameEnds, ...(rejected ? { rejected } : {}) } };
}

/**
 * Budget de la première tranche du bot jouée dans la requête du coup du
 * joueur. Court : la réponse au coup ne doit pas attendre le bot ; ce qui ne
 * tient pas dedans se joue par `advanceBot`. Un pas facile ou moyen coûte
 * de l'ordre de la milliseconde (p95 ≈ 6 ms, mesuré le 14/10/2026).
 */
const BOT_INLINE_BUDGET_MS = 40;

/**
 * Fait jouer le bot tant qu'il a quelque chose à décider, dans la limite
 * d'un budget de temps et de `MAX_BOT_ACTIONS_PER_SLICE` actions.
 *
 * `inline` : tranche jouée dans la requête d'un coup du joueur. Elle n'a
 * pas lieu en difficulté « difficile », dont un seul pas coûte 120 à 275 ms
 * — la réponse au coup partirait aussitôt sans elle. Sinon, au moins une
 * action, quoi qu'il arrive.
 */
function playBotSlice(
  initial: GameState,
  match: MatchRow,
  budgetMs: number,
  { inline = false }: { inline?: boolean } = {}
): { state: GameState; frames: GameState[] } {
  const difficulty = match.bot_difficulty ?? "moyen";
  const frames: GameState[] = [];
  if (inline && difficulty === "difficile") return { state: initial, frames };
  let state = initial;
  const startedAt = performance.now();
  while (frames.length < MAX_BOT_ACTIONS_PER_SLICE && state.status === "active" && botHasSomethingToDo(state, BOT_PLAYER_ID)) {
    if (inline && performance.now() - startedAt >= budgetMs) break;
    const step = stepBotTurn(state, BOT_PLAYER_ID, difficulty);
    // Aucune progression possible : on s'arrête plutôt que de boucler.
    if (step.state === state) break;
    state = step.state;
    frames.push(state);
    if (step.done || performance.now() - startedAt >= budgetMs) break;
  }
  return { state, frames };
}

/**
 * Temps de réflexion accordé au bot par tranche. Au-delà, on enregistre ce
 * qui est joué et on le renvoie : l'écran le montre pendant que la tranche
 * suivante se calcule. Au moins une action par tranche, quoi qu'il arrive.
 */
const BOT_SLICE_BUDGET_MS = 350;
/** Garde-fou : actions par tranche (un tour entier tient largement dedans). */
const MAX_BOT_ACTIONS_PER_SLICE = 40;

/**
 * Fait jouer au bot la TRANCHE suivante de ce qu'il a à décider, l'enregistre
 * et renvoie les vues correspondantes (`botToMove` : il en reste).
 *
 * Seul un participant d'une partie contre bot peut le demander, et la
 * demande ne porte aucun coup : c'est le serveur qui fait jouer le bot, sur
 * l'état autoritaire, sous le même verrou optimiste qu'un coup du joueur.
 */
export async function advanceBot(matchId: string, userId: string, known?: KnownLog): Promise<StoreResult<MatchUpdate>> {
  const [match, full] = await Promise.all([loadMatchRow(matchId), loadFullState(matchId)]);
  if (!match || !isParticipant(match, userId)) return { ok: false, error: "Partie introuvable." };
  if (match.mode !== "bot" || match.status !== "active" || !full) return { ok: false, error: "Cette partie n'est pas en cours." };

  const { state, frames } = playBotSlice(full.state, match, BOT_SLICE_BUDGET_MS);

  // Rien à jouer : la vue telle quelle, sans écriture.
  if (frames.length === 0) {
    return { ok: true, data: { match, frames: packFrames([toPlayerView(state, userId)], known), botToMove: false } };
  }
  return await commitAndSettle(matchId, userId, match, full.version, frames, state, known);
}

/**
 * Garde-fou : nombre d'échéances rattrapées d'affilée en une passe. Chaque
 * échéance appliquée repose un chrono dans le FUTUR, donc la boucle sort
 * d'elle-même ; cette borne n'est là que pour qu'un état inattendu ne
 * puisse pas la faire tourner.
 */
const MAX_DEADLINES_PER_PASS = 4;

/**
 * Applique les échéances de tour ÉCHUES, l'heure du serveur en main.
 *
 * C'est ici — et seulement ici — que le temps devient une décision de jeu.
 * Le navigateur ne déclare jamais une expiration : il reçoit une échéance à
 * afficher, et le serveur la constate à la prochaine occasion où il touche
 * la partie (un coup de l'un, une lecture de la table par l'autre). Aucune
 * tâche de fond n'est nécessaire — une partie que plus personne ne regarde
 * n'a pas besoin d'avancer.
 *
 * `exemptPlayerId` protège l'appelant d'un coup qu'il est en train de
 * jouer : arriver en retard vaut mieux que ne pas arriver.
 */
function applyExpiredDeadlines(
  state: GameState,
  match: MatchRow,
  now: number,
  exemptPlayerId?: string
): { state: GameState; frames: GameState[] } {
  const frames: GameState[] = [];
  let current = state;

  for (let pass = 0; pass < MAX_DEADLINES_PER_PASS; pass += 1) {
    if (current.status !== "active") break;
    const awaiting = current.turnTimer?.awaitingPlayerId;
    if (!awaiting || awaiting === exemptPlayerId) break;
    if (!turnTimerExpired(current, now)) break;

    const timedOut = dispatch(current, { type: "timeout", playerId: awaiting, now });
    if (!timedOut.ok) break;
    current = timedOut.state;
    frames.push(current);

    // Passer le tour d'un joueur absent peut rendre la main au bot : il
    // joue le sien comme après n'importe quel coup.
    if (match.mode === "bot" && current.status === "active") {
      const botFrames = runBotUntilIdle(current, BOT_PLAYER_ID, match.bot_difficulty ?? "moyen");
      if (botFrames.length > 0) {
        frames.push(...botFrames);
        current = botFrames[botFrames.length - 1]!;
      }
    }
  }

  return { state: current, frames };
}

/**
 * Enregistre l'état final sous verrou optimiste, puis — s'il termine la
 * partie — déclenche récompenses et quêtes. Extrait de `submitAction` parce
 * qu'un rattrapage d'échéance emprunte exactement le même chemin : ce qui
 * décide d'une fin de partie ne doit exister qu'une fois.
 */
async function commitAndSettle(
  matchId: string,
  userId: string,
  match: MatchRow,
  expectedVersion: number,
  frames: GameState[],
  finalState: GameState,
  known?: KnownLog
): Promise<CommitResult> {
  const finished = finalState.status === "finished";

  const { data: commit, error } = await service().rpc("commit_match_state", {
    p_match_id: matchId,
    p_expected_version: expectedVersion,
    p_state: finalState,
    p_status: finished ? "finished" : "active",
    p_winner_id: winnerUserId(match, finalState),
  });
  if (error) return { ok: false, error: error.message };
  if (!commit?.ok) {
    if (commit?.error === "conflict") return { ok: false, error: "La partie a changé entre-temps : réessaie.", conflict: true };
    return { ok: false, error: commit?.error ?? "Coup non enregistré." };
  }

  const updatedMatch: MatchRow = {
    ...match,
    state_version: commit.version ?? match.state_version,
    status: finished ? "finished" : "active",
    winner_id: winnerUserId(match, finalState),
  };

  // APRÈS la persistance de l'état final : on ne récompense jamais une fin
  // de partie qui n'a pas été enregistrée. Idempotent en base, donc sûr même
  // si deux chemins observent la même fin.
  if (finished) {
    // La banque d'équilibrage mesure le JEU : toutes les parties, amicales
    // comprises (que `settleFinishedMatch` laisse de côté), et en parallèle
    // du règlement — le joueur n'attend rien d'elle.
    //
    // APRÈS la réponse (14/10/2026) : le coup qui achève attendait tout le
    // règlement (récompenses, audience, quêtes, statistiques) avant de
    // s'afficher — une à deux secondes de table figée. L'écran de fin relit
    // le gain de lui-même (`useMatchReward`) ; `waitUntil` garde la fonction
    // Vercel en vie jusqu'au bout du règlement (sans effet hors Vercel, où
    // le processus reste de toute façon).
    const settlement = Promise.all([settleFinishedMatch(updatedMatch, finalState), recordMatchBalanceReport(updatedMatch, finalState)]).catch((error) =>
      console.error("[commitAndSettle] Règlement de fin de partie en échec :", error)
    );
    waitUntil(settlement);
  }

  return {
    ok: true,
    data: {
      match: updatedMatch,
      frames: packFrames(
        frames.map((frame) => toPlayerView(frame, userId)),
        known
      ),
      botToMove: botStillToMove(match, finalState),
    },
  };
}

/**
 * Fait avancer une partie dont le délai est écoulé, SANS qu'un coup soit
 * joué — le chemin de LECTURE (`fetchMatchView`).
 *
 * C'est ce qui permet au joueur présent de sortir d'une table abandonnée :
 * son écran interroge le serveur, le serveur constate l'heure, et la partie
 * avance (ou se termine) sans que le navigateur n'ait rien décidé.
 *
 * Rend la partie telle qu'elle est APRÈS ce rattrapage — rattrapée ou non —
 * pour que la lecture n'ait pas à relire la base : c'était deux lectures de
 * la partie et de son état à chaque rafraîchissement de la table. `null` si
 * la partie n'existe pas ou si l'appelant n'y joue pas.
 */
export async function settleExpiredDeadlines(matchId: string, userId: string): Promise<MatchSnapshot | null> {
  const [match, full] = await Promise.all([loadMatchRow(matchId), loadFullState(matchId)]);
  if (!match || !isParticipant(match, userId)) return null;
  const asIs: MatchSnapshot = { match, view: full ? toPlayerView(full.state, userId) : null };
  if (!full || match.status !== "active") return asIs;

  const rattrape = applyExpiredDeadlines(full.state, match, Date.now());
  // Un tour du bot resté en suspens — l'écran a été fermé pendant qu'il le
  // jouait par tranches (`advanceBot`) : la lecture le termine, pour qu'une
  // table rouverte ne reste jamais figée sur « au bot de jouer ».
  if (botStillToMove(match, rattrape.state)) {
    const botFrames = runBotUntilIdle(rattrape.state, BOT_PLAYER_ID, match.bot_difficulty ?? "moyen");
    if (botFrames.length > 0) {
      rattrape.frames.push(...botFrames);
      rattrape.state = botFrames[botFrames.length - 1]!;
    }
  }
  if (rattrape.frames.length === 0) return asIs;

  const committed = await commitAndSettle(matchId, userId, match, full.version, rattrape.frames, rattrape.state);
  // Rattrapage refusé (une autre écriture est passée entre-temps) : on rend
  // ce qu'on a lu ; le prochain rafraîchissement verra la version gagnante.
  if (!committed.ok) return asIs;
  return { match: committed.data.match, view: toPlayerView(rattrape.state, userId) };
}

/**
 * Parties de MATCHMAKING déjà terminées aujourd'hui (UTC) entre les deux joueurs de
 * `match`, celle-ci exclue — pour le plafond par adversaire
 * (`SAME_OPPONENT_DAILY_REWARDED_MATCHES`). `undefined` si la question ne se
 * pose pas (un seul joueur humain) ou si la base ne répond pas : dans le
 * doute, on ne punit pas une partie légitime.
 */
async function finishedTodayBetween(match: MatchRow): Promise<number | undefined> {
  const a = match.player1_id;
  const b = match.player2_id;
  if (!a || !b || a === b) return undefined;
  const { count, error } = await service()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("status", "finished")
    // Les matchs amicaux ne comptent pas : ils ne paient rien, et deux amis
    // qui jouent ensemble ne doivent pas y perdre leurs parties classées.
    .eq("mode", "matchmaking")
    .neq("id", match.id)
    .gte("finished_at", `${utcDayKey(new Date())}T00:00:00.000Z`)
    .or(`and(player1_id.eq.${a},player2_id.eq.${b}),and(player1_id.eq.${b},player2_id.eq.${a})`);
  if (error) {
    console.error("[settleFinishedMatch] Comptage des parties du jour impossible :", error.message);
    return undefined;
  }
  return count ?? 0;
}

/** Récompenses et quêtes de chaque participant HUMAIN d'une partie terminée. */
async function settleFinishedMatch(match: MatchRow, finalState: GameState): Promise<void> {
  // Match amical : pour le plaisir, rien à régler. La partie reste dans
  // l'historique ; l'écran de fin n'annonce simplement aucun gain.
  if (!matchModePaysRewards(match.mode)) return;

  const vsBot = match.mode === "bot";
  // Dérogation de développement : hors production, une partie contre bot est
  // récompensée et comptée comme une partie PvP, pour que toute la boucle
  // (Tides, bonus du jour, quêtes PvP) soit testable avec un seul compte.
  const botAsPvp = vsBot && botCountsAsPvp();
  const winner = winnerUserId(match, finalState);
  // Une partie contre soi-même (même compte aux deux places) ne serait payée
  // qu'une fois de toute façon — clés (match_id, user_id) — autant ne pas
  // émettre le second octroi.
  const participants = Array.from(new Set([match.player1_id, match.player2_id].filter((id): id is string => Boolean(id))));

  // Anti-farm : durée réelle (depuis la création SERVEUR de l'état) et, en
  // PvP, parties déjà jouées aujourd'hui contre le même adversaire.
  const durationMs = Date.now() - finalState.createdAt;
  const finishedAgainstOpponentToday = vsBot ? undefined : await finishedTodayBetween(match);

  await Promise.all(
    participants.map(async (userId) => {
      const won = winner === userId;
      // Une partie qui n'est pas comptée comme jouée paie comme un abandon
      // et n'avance ni quêtes, ni Traversée, ni audience.
      const played = countsAsPlayedMatch({
        activity: matchActivity(finalState, userId),
        durationMs,
        finishedAgainstOpponentToday,
      });
      const deckId = userId === match.player1_id ? match.player1_deck_id : (match.player2_deck_id ?? undefined);
      const reward = await awardMatchReward({
        matchId: match.id,
        userId,
        mode: match.mode,
        outcome: won ? "win" : "loss",
        // L'état final sert à mesurer l'activité réelle du joueur : une
        // partie abandonnée sans rien jouer ne paie pas plein tarif
        // (anti-AFK, Notion « Progression joueur » §7).
        finalState,
        enginePlayerId: userId,
        botCountsAsPvp: botAsPvp,
        botDifficulty: match.bot_difficulty,
        countsAsPlayed: played,
      });
      // Le public juge la partie, puis les mécènes y puisent leur intérêt —
      // une seule fois (`reward` est nul quand la partie avait déjà été
      // payée). En parallèle des quêtes : le joueur n'attend rien de plus.
      const audience = reward
        ? recordMatchAudience(match.id, userId, finalState, {
            accountLevel: reward.levelAfter,
            playStreak: reward.playStreak,
            // Contre un bot, la partie pèse d'autant moins sur l'audience que le
            // bot est facile — sauf sous la dérogation de développement, comme
            // pour les quêtes (`AUDIENCE_OPPONENT_WEIGHT`).
            opponent: audienceOpponent(match.mode, match.bot_difficulty, botAsPvp),
            prize: reward.audiencePrize,
            // Une partie que ce joueur n'a pas vraiment jouée ne pèse rien sur son public.
            played,
          })
        : Promise.resolve();
      // Une partie non jouée n'avance aucune quête : « jouer N parties »
      // se remplissait à coups d'abandons immédiats contre le bot.
      const quests = !played
        ? Promise.resolve()
        : recordMatchQuestProgress({
            matchId: match.id,
            userId,
            playerId: userId,
            finalState,
            // Idem côté quêtes : sous la dérogation, la partie n'est pas « bot »,
            // donc les objectifs réservés au PvP avancent aussi.
            vsBot: vsBot && !botAsPvp,
            won,
            // Deck joué par CE participant : les objectifs de la catégorie
            // Decks (« jouer avec 2 decks différents ») comptent des decks
            // distincts, pas des parties.
            deckId,
            // Série : la valeur d'APRÈS cette partie, telle que l'octroi vient
            // de l'écrire. `null` quand la partie avait déjà payé (rejeu) : la
            // quête de série ne bouge alors pas, ce qui est correct.
            playStreak: reward?.playStreak,
            deckIsNew: await isRecentDeck(userId, deckId),
          });
      // Compteurs À VIE (exploits, Collectables) : même garde que les
      // quêtes — un abandon immédiat ne nourrit aucune statistique —, même
      // lecture du bot, et même indifférence à l'échec.
      const lifetime = !played
        ? Promise.resolve()
        : recordMatchLifetimeStats({ matchId: match.id, userId, playerId: userId, finalState, vsBot: vsBot && !botAsPvp, won });
      await Promise.all([audience, quests, lifetime]);
    })
  );
}
