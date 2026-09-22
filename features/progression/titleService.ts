import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { TITLE_CATALOG, isTitleUnlocked, titleById, titleRequiredAchievement, titleUnlockLabel } from "@/game/titles";

/**
 * Titres — lecture et équipement côté SERVEUR. Pas de `"use server"` : ces
 * fonctions prennent un identifiant de joueur en paramètre et ne doivent
 * jamais devenir des points d'entrée HTTP. L'action exposée
 * (`equipTitle`, `profileActions.ts`) déduit le joueur de sa session.
 *
 * Le déblocage n'est pas stocké : il se DÉDUIT des exploits obtenus
 * (`player_achievements`). Seul le titre CHOISI l'est (`player_titles`).
 */

export interface TitleOption {
  id: string;
  name: string;
  /** Exploit obtenu : le titre peut être porté. */
  unlocked: boolean;
  /** Ce qu'il faut faire pour l'obtenir, en toutes lettres. */
  condition: string;
  /** Exploit qui le débloque — l'écran des exploits l'affiche à côté. */
  achievementCode: string;
}

export interface ProfileTitles {
  /** Catalogue complet, verrouillés compris : un objectif qu'on ne voit pas ne donne envie de rien. */
  options: TitleOption[];
  /** Titre porté, ou `null`. Toujours un titre connu ET débloqué. */
  equipped: string | null;
  /**
   * `false` tant que la migration `player_titles` n'est pas passée (ou que
   * la base ne répond pas) : le sélecteur le dit au lieu d'échouer.
   */
  available: boolean;
}

function options(unlockedCodes: ReadonlySet<string>): TitleOption[] {
  return TITLE_CATALOG.map((title) => ({
    id: title.id,
    name: title.name,
    unlocked: isTitleUnlocked(title, unlockedCodes),
    condition: titleUnlockLabel(title),
    achievementCode: titleRequiredAchievement(title),
  }));
}

/**
 * Titres vus par CE joueur. Ne lève jamais : sans table (migration en
 * attente) ou sans base, le joueur n'a simplement pas de titre.
 *
 * Un titre stocké mais inconnu du catalogue (retiré) ou dont l'exploit
 * n'est plus en base n'est pas affiché : on ne montre jamais un titre que
 * le serveur refuserait d'équiper.
 */
export async function loadTitles(userId: string | null, unlockedCodes: ReadonlySet<string>): Promise<ProfileTitles> {
  const base = options(unlockedCodes);
  if (!userId) return { options: base, equipped: null, available: false };

  try {
    const { data, error } = await createSupabaseServiceRoleClient()
      .from("player_titles")
      .select("title_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[loadTitles] Titres indisponibles :", error.message);
      return { options: base, equipped: null, available: false };
    }
    const stored = titleById(data?.title_id ?? null);
    const equipped = stored && isTitleUnlocked(stored, unlockedCodes) ? stored.id : null;
    return { options: base, equipped, available: true };
  } catch (cause) {
    console.error("[loadTitles] Lecture impossible :", cause);
    return { options: base, equipped: null, available: false };
  }
}

export interface EquipTitleResult {
  ok: boolean;
  error?: string;
  /** Titre réellement porté après l'appel (`null` : aucun). */
  equipped?: string | null;
}

const UNAVAILABLE = "Les titres ne sont pas encore disponibles — réessaie plus tard.";

/**
 * Équipe un titre, ou le retire (`null`).
 *
 * DEUX vérifications, toutes deux côté serveur : ici, l'exploit exigé est
 * relu dans `player_achievements` ; puis `set_player_title` le revérifie
 * en base avant d'écrire. Le navigateur ne fournit que l'identifiant du
 * titre — jamais la condition.
 */
export async function equipTitleFor(userId: string, titleId: string | null): Promise<EquipTitleResult> {
  const title = titleId === null ? null : titleById(titleId);
  if (titleId !== null && !title) return { ok: false, error: "Ce titre n'existe pas." };

  try {
    const service = createSupabaseServiceRoleClient();

    if (title) {
      const required = titleRequiredAchievement(title);
      const { data: proof, error: proofError } = await service
        .from("player_achievements")
        .select("code")
        .eq("user_id", userId)
        .eq("code", required)
        .maybeSingle();
      if (proofError) return { ok: false, error: "Vérification impossible pour l'instant — réessaie dans un instant." };
      if (!proof) return { ok: false, error: "Ce titre n'est pas encore débloqué." };
    }

    const { data, error } = await service.rpc("set_player_title", {
      p_user_id: userId,
      p_title_id: title ? title.id : null,
      p_required_achievement: title ? titleRequiredAchievement(title) : null,
    });
    if (error) {
      console.error("[equipTitleFor] Écriture refusée :", error.message);
      return { ok: false, error: UNAVAILABLE };
    }
    if (!data?.ok) {
      return { ok: false, error: data?.error === "not_unlocked" ? "Ce titre n'est pas encore débloqué." : "Titre refusé." };
    }
    return { ok: true, equipped: title ? title.id : null };
  } catch (cause) {
    console.error("[equipTitleFor] Échec :", cause);
    return { ok: false, error: UNAVAILABLE };
  }
}
