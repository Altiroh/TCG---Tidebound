import type { GameState } from "@/game";
import { computeMatchBalanceReport } from "@/game/balance";
import { countsAsPlayedMatch, matchActivity } from "@/game/progression";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * BANQUE D'ÉQUILIBRAGE — écriture SERVEUR. Pas de `"use server"` : la
 * fonction prend une partie et son état complet, elle ne doit jamais
 * devenir un point d'entrée joignable depuis le navigateur.
 *
 * Verse le relevé d'une partie terminée (`game/balance/`) dans les tables
 * `balance_*`, lues par `npm run banque`. Rien n'est montré au joueur.
 */

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

/** `PlayerState.id` du bot dans une partie serveur (miroir de `BOT_PLAYER_ID`, sans dépendre du magasin de parties). */
const BOT_PLAYER_ID = "bot";

/**
 * Toutes les parties terminées y passent, amicales comprises, et les DEUX
 * sièges, bot compris : c'est le jeu qu'on mesure, pas les joueurs. Le
 * filtre (camp, mode, partie vraiment jouée) se fait à la lecture.
 *
 * Idempotente (une partie ne se verse qu'une fois) et ne lève jamais : tant
 * que la migration `20261030120000_banque_statistiques` n'est pas
 * appliquée, l'appel échoue, se journalise, et la fin de partie continue.
 */
export async function recordMatchBalanceReport(match: MatchRow, finalState: GameState): Promise<void> {
  try {
    const vsBot = match.mode === "bot";
    const report = computeMatchBalanceReport({ state: finalState, vsBot });
    const durationMs = Date.now() - finalState.createdAt;

    const deckOf = (playerId: string): string | null => {
      if (playerId === match.player1_id) return match.player1_deck_id;
      if (playerId === match.player2_id) return match.player2_deck_id;
      // Contre le bot, il tient la seconde place de la partie.
      if (playerId === BOT_PLAYER_ID) return match.player2_deck_id;
      return null;
    };
    const isHuman = (playerId: string) => playerId === match.player1_id || playerId === match.player2_id;

    const payload = {
      mode: match.mode,
      bot_difficulty: match.bot_difficulty,
      version: report.version,
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
      seconds: report.seconds,
      table_turns: report.tableTurns,
      end_reason: report.endReason,
      winner_seat: report.winnerSeat,
      first_seat: report.firstSeat,
      seats: report.seats.map((seat) => ({
        seat: seat.seat,
        user_id: isHuman(seat.playerId) ? seat.playerId : null,
        is_bot: seat.playerId === BOT_PLAYER_ID,
        ship_id: seat.shipId,
        deck_id: deckOf(seat.playerId),
        result: seat.result,
        went_first: seat.wentFirst,
        own_turns: seat.ownTurns,
        final_anchor: seat.finalAnchor,
        final_reason: seat.finalReason,
        ship_ability_uses: seat.shipAbilityUses,
        ship_ability_damage: seat.shipAbilityDamage,
        // Même règle que les récompenses (sans le plafond par adversaire, qui
        // juge le joueur, pas la partie) : un abandon immédiat ne dit rien du jeu.
        counts_as_played: countsAsPlayedMatch({ activity: matchActivity(finalState, seat.playerId), durationMs }),
        stats: seat.stats,
        cards: seat.cards.map((line) => ({
          card_id: line.cardId,
          def_hash: line.defHash,
          copies: line.copies,
          seen: line.seen,
          played: line.played,
          play_turn_sum: line.playTurnSum,
          summoned: line.summoned,
          damage_dealt: line.damageDealt,
          ship_damage: line.shipDamage,
          kills: line.kills,
          deaths: line.deaths,
          reactions: line.reactions,
          abilities: line.abilities,
        })),
      })),
    };

    const { data, error } = await createSupabaseServiceRoleClient().rpc("record_match_balance_report", {
      p_match_id: match.id,
      p_report: payload,
    });
    if (error) {
      console.error("[recordMatchBalanceReport] Enregistrement refusé :", error.message);
      return;
    }
    if (data && !data.ok) console.error("[recordMatchBalanceReport] Relevé refusé :", data.error);
  } catch (error) {
    console.error("[recordMatchBalanceReport] Échec :", error);
  }
}
