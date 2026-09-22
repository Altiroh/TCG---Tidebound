import { dispatch, runBotUntilIdle, toPlayerView, turnTimerExpired, type GameState, type PlayerAction } from "@/game";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { awardMatchReward } from "@/features/progression/rewards";
import { botCountsAsPvp } from "@/features/progression/botRewardPolicy";
import { recordMatchQuestProgress } from "@/features/quests/questService";
import { isRecentDeck } from "@/features/decks/recentDecks";
import { packFrames, type PackedFrames } from "@/features/matches/matchFrames";

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
}

export type StoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

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

/** Uuid de profil du vainqueur, ou `null` (bot vainqueur, match nul, partie en cours). */
export function winnerUserId(match: MatchRow, state: GameState): string | null {
  const winner = state.winnerId;
  if (!winner) return null;
  if (winner === match.player1_id || winner === match.player2_id) return winner;
  if (winner !== BOT_PLAYER_ID) console.error(`[winnerUserId] Vainqueur non résolu pour la partie ${match.id} : "${winner}".`);
  return null;
}

/**
 * Applique un coup du joueur connecté, fait répondre le bot si besoin, et
 * enregistre le résultat.
 */
export async function submitAction(matchId: string, userId: string, action: PlayerAction): Promise<StoreResult<MatchUpdate>> {
  // Le moteur valide la légalité d'un coup, pas l'identité de celui qui
  // l'envoie : sans cette vérification, un joueur pourrait terminer le tour
  // de son adversaire, ou jouer à la place du bot.
  if (!action || typeof action !== "object" || action.playerId !== userId) {
    return { ok: false, error: "Action refusée." };
  }

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
  const beforeAction = rattrape.state;

  // Le rattrapage a pu terminer la partie (abandon automatique) : le coup
  // qui suit n'a plus lieu d'être, mais ce qui vient d'arriver, si.
  if (beforeAction.status !== "active") {
    return await commitAndSettle(matchId, userId, match, full.version, frames, beforeAction);
  }

  const result = dispatch(beforeAction, action);
  if (!result.ok) return { ok: false, error: result.error };

  frames.push(result.state);
  if (match.mode === "bot") {
    frames.push(...runBotUntilIdle(result.state, BOT_PLAYER_ID, match.bot_difficulty ?? "moyen"));
  }
  return await commitAndSettle(matchId, userId, match, full.version, frames, frames[frames.length - 1]!);
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
  finalState: GameState
): Promise<StoreResult<MatchUpdate>> {
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
    return {
      ok: false,
      error: commit?.error === "conflict" ? "La partie a changé entre-temps : réessaie." : commit?.error ?? "Coup non enregistré.",
    };
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
  if (finished) await settleFinishedMatch(updatedMatch, finalState);

  return { ok: true, data: { match: updatedMatch, frames: packFrames(frames.map((frame) => toPlayerView(frame, userId))) } };
}

/**
 * Fait avancer une partie dont le délai est écoulé, SANS qu'un coup soit
 * joué — le chemin de LECTURE (`fetchMatchView`).
 *
 * C'est ce qui permet au joueur présent de sortir d'une table abandonnée :
 * son écran interroge le serveur, le serveur constate l'heure, et la partie
 * avance (ou se termine) sans que le navigateur n'ait rien décidé. Rend
 * `null` quand il n'y avait rien à rattraper.
 */
export async function settleExpiredDeadlines(matchId: string, userId: string): Promise<MatchSnapshot | null> {
  const [match, full] = await Promise.all([loadMatchRow(matchId), loadFullState(matchId)]);
  if (!match || !isParticipant(match, userId) || !full || match.status !== "active") return null;

  const rattrape = applyExpiredDeadlines(full.state, match, Date.now());
  if (rattrape.frames.length === 0) return null;

  const committed = await commitAndSettle(matchId, userId, match, full.version, rattrape.frames, rattrape.state);
  if (!committed.ok) return null;
  return { match: committed.data.match, view: toPlayerView(rattrape.state, userId) };
}

/** Récompenses et quêtes de chaque participant HUMAIN d'une partie terminée. */
async function settleFinishedMatch(match: MatchRow, finalState: GameState): Promise<void> {
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

  await Promise.all(
    participants.map(async (userId) => {
      const won = winner === userId;
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
      });
      await recordMatchQuestProgress({
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
    })
  );
}
