import type { ProfileAchievement } from "@/features/progression/profileActions";

/** Libellé d'un exploit caché, tant qu'il n'est pas obtenu. */
export const MASKED_ACHIEVEMENT_NAME = "Exploit caché";

/**
 * Voile d'un exploit CACHÉ pas encore obtenu — même doctrine que les
 * Collectables cachés (`isSlotMasked`, `game/cosmetics/unlock.ts`) : ni
 * nom, ni condition, ni jauge, ni titre. Le CODE aussi est remplacé
 * (`cache-N`, N = rang au catalogue) : « lose_to_own_deraison_1 » dirait
 * tout. Seule la famille reste — le tableau range le voile à sa place.
 *
 * Appelé côté serveur (`fetchProfile`) : ce qui est masqué ne quitte
 * jamais le serveur. Obtenu (à réclamer ou réclamé), l'exploit passe tel
 * quel.
 */
export function maskAchievement(achievement: ProfileAchievement, hidden: boolean, index: number): ProfileAchievement {
  if (!hidden || achievement.unlocked) return achievement;
  return {
    code: `cache-${index}`,
    family: achievement.family,
    name: MASKED_ACHIEVEMENT_NAME,
    description: "",
    rewardTides: 0,
    masked: true,
    unlocked: false,
    claimable: false,
    progress: null,
    titleName: null,
  };
}
