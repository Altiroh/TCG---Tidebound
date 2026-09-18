import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { MAX_REWARDED_LEVEL, levelForTotalXp, levelRewardItems, type LevelRewardItem } from "@/game/progression";
import type { CardRarity } from "@/game/boosters/types";
import { openLevelCardChoices } from "@/features/progression/cardChoices";

/**
 * Récompenses de niveau À RÉCLAMER — module SERVEUR (pas de `"use server"` :
 * ces fonctions prennent un identifiant de joueur, elles ne doivent pas
 * devenir des points d'entrée HTTP ; les actions exposées vivent dans
 * `profileActions.ts` et déduisent le joueur de sa session).
 *
 * Un palier franchi n'est plus crédité en fin de partie : il attend. Le
 * joueur vient le chercher au profil, et c'est ce geste qui crédite — le
 * moment de la récompense lui appartient.
 */

/** Une « carte au choix » ouverte et pas encore tranchée. */
export interface PendingCardChoice {
  id: string;
  /** Palier d'origine (`source_ref`), `null` pour une autre source. */
  level: number | null;
  rarity: CardRarity;
  offeredCardIds: string[];
}

export interface LevelRewardState {
  /** Niveau stocké — celui que `claim_level_reward` vérifie. */
  level: number;
  claimedLevels: number[];
  /** Paliers atteints et pas encore réclamés, du plus ancien au plus récent. */
  claimableLevels: number[];
  pendingCardChoices: PendingCardChoice[];
}

/**
 * Le niveau RÉELLEMENT atteint, et non celui que dit la colonne.
 *
 * `player_progression.level` n'est pas une source de vérité : c'est un
 * CACHE, et seule la fin de partie le rafraîchit. Les quêtes, la récompense
 * de connexion, les exploits et le tutoriel ajoutent de l'XP sans y
 * toucher — la migration le dit en toutes lettres : « le passage de niveau
 * éventuel est rattrapé à la partie suivante ». Entre-temps, l'écran
 * affichait le niveau calculé depuis l'XP pendant que les récompenses,
 * elles, se fiaient à la colonne.
 *
 * Relevé le 2026-09-18 sur le compte du projet : 2300 XP, soit le niveau 10
 * d'après la courbe, pour une colonne restée à 8. Le Jeton de Préconstruit
 * du palier 10 n'était donc proposé nulle part, et n'aurait pu l'être
 * qu'après une partie de plus. C'est aussi ce qui donnait l'impression que
 * les récompenses « mettent du temps » : elles n'arrivent pas en retard,
 * elles attendent la partie suivante.
 *
 * La courbe vit en TypeScript (`game/progression/levels.ts`) et nulle part
 * ailleurs — la dupliquer en SQL ferait deux vérités. On la relit donc ici,
 * et `jamais à la baisse` : un niveau accordé reste acquis.
 */
export function reachedLevel(xpTotal: number, storedLevel: number): number {
  return Math.max(storedLevel, levelForTotalXp(xpTotal));
}

/**
 * Remet la colonne d'aplomb quand elle a pris du retard, et rend le niveau
 * atteint. Indispensable AVANT toute réclamation : `claim_level_reward`
 * refuse un palier au-dessus de la colonne (« Ce palier n'est pas encore
 * atteint »), donc l'offrir sans la remettre à jour ne ferait que déplacer
 * le refus d'un cran.
 */
export interface SyncedLevel {
  /** Niveau réellement atteint d'après la courbe. */
  reached: number;
  /** Ce que disait la colonne avant le rattrapage. */
  stored: number;
  /** `false` si la colonne est en retard ET n'a pas pu être remise à jour. */
  ok: boolean;
}

export async function syncStoredLevel(userId: string): Promise<SyncedLevel> {
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("player_progression")
    .select("xp_total, level")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return { reached: 1, stored: 1, ok: true };

  const stored = data.level ?? 1;
  const reached = reachedLevel(data.xp_total ?? 0, stored);
  if (reached <= stored) return { reached: stored, stored, ok: true };

  // L'écriture passe par une fonction Postgres, jamais par un `update`
  // direct : les tables autoritaires sont typées en lecture seule
  // exprès (`lib/supabase/types.ts`), et c'est ce qui garantit qu'aucune
  // règle d'économie ne s'écrit à deux endroits. `sync_player_level` ne
  // fait que relever la colonne, jamais l'abaisser.
  const { error: writeError } = await service.rpc("sync_player_level", { p_user_id: userId, p_level: reached });
  if (writeError) console.error("[syncStoredLevel] Niveau non rattrapé :", writeError.message);
  return { reached, stored, ok: !writeError };
}

export function claimableLevelsFor(level: number, claimed: Iterable<number>): number[] {
  const done = new Set(claimed);
  const levels: number[] = [];
  for (let value = 1; value <= Math.min(level, MAX_REWARDED_LEVEL); value++) {
    if (!done.has(value) && levelRewardItems(value).length > 0) levels.push(value);
  }
  return levels;
}

export async function readLevelRewardState(userId: string): Promise<LevelRewardState> {
  const service = createSupabaseServiceRoleClient();
  const [progression, claimed, choices] = await Promise.all([
    service.from("player_progression").select("xp_total, level").eq("user_id", userId).maybeSingle(),
    service.from("player_level_rewards").select("level").eq("user_id", userId),
    service.from("player_card_choices").select("id, source, source_ref, rarity, offered_card_ids").eq("user_id", userId).is("resolved_at", null),
  ]);

  const level = reachedLevel(progression.data?.xp_total ?? 0, progression.data?.level ?? 1);
  const claimedLevels = (claimed.data ?? []).map((row) => row.level);
  return {
    level,
    claimedLevels,
    claimableLevels: claimableLevelsFor(level, claimedLevels),
    pendingCardChoices: (choices.data ?? []).map((row) => ({
      id: row.id,
      level: row.source === "level" && /^\d+$/.test(row.source_ref) ? Number(row.source_ref) : null,
      rarity: row.rarity,
      offeredCardIds: row.offered_card_ids,
    })),
  };
}

export interface ClaimLevelRewardResult {
  ok: boolean;
  error?: string;
  level?: number;
  items?: readonly LevelRewardItem[];
  /** Le palier ouvrait un choix de carte : les propositions, à trancher tout de suite. */
  cardChoice?: PendingCardChoice;
}

/**
 * Réclame UN palier. Le contenu vient de la table TypeScript, pas du
 * client ; la base vérifie que le niveau est atteint et que le palier n'a
 * pas déjà été payé.
 */
export async function claimLevelRewardFor(userId: string, level: number): Promise<ClaimLevelRewardResult> {
  const items = levelRewardItems(level);
  if (!Number.isInteger(level) || items.length === 0) return { ok: false, error: "Palier inconnu." };

  try {
    const service = createSupabaseServiceRoleClient();
    // La colonne d'abord : la base refuse tout palier au-dessus d'elle. Si
    // elle est en retard et qu'on n'a pas su la rattraper, le dire ICI
    // plutôt que de laisser la base répondre « ce palier n'est pas encore
    // atteint » — ce qui serait faux, et indébrouillable côté joueur.
    const synced = await syncStoredLevel(userId);
    if (!synced.ok && level > synced.stored) {
      return {
        ok: false,
        error: "Le niveau enregistré est en retard sur ton XP et n'a pas pu être remis à jour (migration 20260927120000 à appliquer).",
      };
    }
    const { data, error } = await service.rpc("claim_level_reward", {
      p_user_id: userId,
      p_level: level,
      p_items: items,
    });
    if (error) {
      console.error("[claimLevelRewardFor] Réclamation refusée :", error.message);
      const missing = /function .*claim_level_reward/i.test(error.message) || error.code === "PGRST202";
      return {
        ok: false,
        error: missing
          ? "La réclamation des paliers n'est pas encore installée en base (migration 20260920120000 à appliquer)."
          : "Réclamation impossible pour l'instant — réessaie dans un instant.",
      };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation impossible." };

    // Palier « carte au choix » : le tirage est fait ICI, figé en base, puis
    // renvoyé pour que le joueur tranche sur-le-champ.
    const choices = items
      .filter((item): item is Extract<LevelRewardItem, { kind: "cardChoice" }> => item.kind === "cardChoice")
      .map((item) => ({ level, rarity: item.rarity, choices: item.choices }));
    let cardChoice: PendingCardChoice | undefined;
    if (choices.length > 0) {
      await openLevelCardChoices(userId, choices);
      const { data: opened } = await service
        .from("player_card_choices")
        .select("id, rarity, offered_card_ids")
        .eq("user_id", userId)
        .eq("source", "level")
        .eq("source_ref", String(level))
        .is("resolved_at", null)
        .maybeSingle();
      if (opened) cardChoice = { id: opened.id, level, rarity: opened.rarity, offeredCardIds: opened.offered_card_ids };
    }

    return { ok: true, level, items, cardChoice };
  } catch (cause) {
    console.error("[claimLevelRewardFor] Échec :", cause);
    return { ok: false, error: "Réclamation impossible pour l'instant — réessaie dans un instant." };
  }
}

export async function resolveCardChoiceFor(userId: string, choiceId: string, cardId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("resolve_card_choice", {
      p_user_id: userId,
      p_choice_id: choiceId,
      p_card_id: cardId,
    });
    if (error) {
      console.error("[resolveCardChoiceFor] Refusé :", error.message);
      return { ok: false, error: "Choix impossible pour l'instant — réessaie dans un instant." };
    }
    return data?.ok ? { ok: true } : { ok: false, error: data?.error ?? "Choix impossible." };
  } catch (cause) {
    console.error("[resolveCardChoiceFor] Échec :", cause);
    return { ok: false, error: "Choix impossible pour l'instant — réessaie dans un instant." };
  }
}
