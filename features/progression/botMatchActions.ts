"use server";

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/features/online/inviteCode";
import { awardMatchReward } from "@/features/progression/actions";
import { BOT_REWARD_DAILY_CAP, botRewardsEnabled } from "@/features/progression/botRewardPolicy";
import type { MatchOutcome, MatchReward } from "@/game/progression";

/**
 * Enregistre le résultat d'une partie contre bot et la récompense.
 *
 * Dérogation de développement assumée — lire
 * `features/progression/botRewardPolicy.ts` pour le pourquoi, le coût et la
 * sortie de secours. En résumé : la partie est jouée dans le navigateur,
 * donc c'est le CLIENT qui déclare l'issue. Trois garde-fous limitent la
 * portée de cette confiance :
 *
 *   1. la dérogation est désactivée en production par défaut ;
 *   2. la partie est enregistrée dans `matches` (`mode: 'bot'`) et payée par
 *      le même chemin idempotent que le PvP — un résultat ne peut pas être
 *      encaissé deux fois ;
 *   3. un plafond quotidien borne le nombre de parties bot récompensées.
 *
 * Le client ne déclare qu'une ISSUE ; les montants restent calculés côté
 * serveur.
 */

/**
 * Valeur écrite dans `matches.player1_deck_id` pour une partie bot locale.
 *
 * Le deck réellement joué n'est connu que du navigateur : le faire remonter
 * ne produirait qu'une donnée d'historique non vérifiable, avec l'apparence
 * d'un enregistrement fiable. On inscrit donc un marqueur explicite plutôt
 * qu'une valeur à laquelle on ne peut pas se fier — à remplacer par le vrai
 * deck le jour où les parties bot seront arbitrées côté serveur.
 */
const LOCAL_BOT_DECK_MARKER = "local_bot";

export interface RecordBotMatchInput {
  outcome: MatchOutcome;
}

export interface RecordBotMatchResult {
  ok: boolean;
  /** Raison courte quand rien n'a été octroyé — affichable, jamais bloquante. */
  reason?: "disabled" | "signed-out" | "daily-cap" | "already-granted" | "error";
  reward?: MatchReward;
}

export async function recordBotMatchResult({ outcome }: RecordBotMatchInput): Promise<RecordBotMatchResult> {
  if (!botRewardsEnabled()) return { ok: false, reason: "disabled" };

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "signed-out" };

    const service = createSupabaseServiceRoleClient();

    // Plafond quotidien (UTC, comme le bonus de première victoire). Compté
    // sur les parties bot RÉCOMPENSÉES du jour, donc insensible à une partie
    // créée mais non payée.
    const startOfDayUtc = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const { count, error: countError } = await service
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("player1_id", user.id)
      .eq("mode", "bot")
      .gte("created_at", startOfDayUtc);

    if (countError) {
      console.error("[recordBotMatchResult] Comptage du plafond impossible :", countError.message);
      return { ok: false, reason: "error" };
    }
    if ((count ?? 0) >= BOT_REWARD_DAILY_CAP) return { ok: false, reason: "daily-cap" };

    // L'enregistrement se fait avec la clé service_role : `matches` n'a pas
    // de policy permettant d'insérer une partie déjà terminée, et on ne veut
    // pas en ouvrir une (le navigateur pourrait alors fabriquer des parties
    // arbitraires, y compris en PvP).
    //
    // `state` reste `null` : l'état d'une partie locale est entièrement
    // client-asserté, le persister donnerait l'illusion d'un enregistrement
    // autoritaire. `winner_id` vaut `null` quand le bot gagne — il n'a pas
    // de profil ; une partie bot terminée sans vainqueur se lit donc comme
    // une défaite du joueur.
    const { data: match, error: insertError } = await service
      .from("matches")
      .insert({
        player1_id: user.id,
        player1_deck_id: LOCAL_BOT_DECK_MARKER,
        invite_code: generateInviteCode(),
        mode: "bot",
        is_vs_bot: true,
        status: "finished",
        winner_id: outcome === "win" ? user.id : null,
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !match) {
      console.error("[recordBotMatchResult] Enregistrement impossible :", insertError?.message);
      return { ok: false, reason: "error" };
    }

    const reward = await awardMatchReward({
      matchId: match.id,
      userId: user.id,
      mode: "bot",
      outcome,
      allowBotTides: true,
    });

    if (!reward) return { ok: false, reason: "already-granted" };
    return { ok: true, reward };
  } catch (error) {
    console.error("[recordBotMatchResult] Échec :", error);
    return { ok: false, reason: "error" };
  }
}
