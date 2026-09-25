import { getCardDefinition } from "@/game";
import { LOGIN_STREAK_MILESTONE, loginBoosterName } from "@/game/progression";
import type { ClaimLoginActionResult } from "@/features/progression/profileActions";

/**
 * Ce que l'escale du jour vient de rapporter, en une ligne : « +25 Tides ·
 * carte : Murène Aveugle ». Partagé par le carnet de bord, la scène du
 * profil et le popup de série — un seul libellé pour un seul geste.
 */
export function loginGainsText(result: ClaimLoginActionResult): string {
  return [
    result.tides ? `+${result.tides} Tides` : "",
    result.xp ? `+${result.xp} XP` : "",
    result.boosterId ? `1 booster ${loginBoosterName(result.boosterId)}` : "",
    result.cardId ? `carte : ${getCardDefinition(result.cardId).name}` : "",
    result.streakCardId ? `${LOGIN_STREAK_MILESTONE} jours d'affilée, carte Abyssale : ${getCardDefinition(result.streakCardId).name}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
