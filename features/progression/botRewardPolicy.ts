/**
 * Politique de récompense des parties contre bot — LE seul endroit qui
 * décide si le cadrage « 0 Tide contre bot » est contourné.
 *
 * Depuis que les parties contre bot sont jouées et arbitrées côté serveur
 * (`features/matches/matchStore.ts`), leur ISSUE est aussi fiable que celle
 * d'une partie PvP : le navigateur ne déclare plus rien. Elles rapportent
 * donc toujours leur XP (`MATCH_XP.bot*`) et font avancer les quêtes
 * compatibles bot, en production comme en développement.
 *
 * Reste une dérogation de développement, pour les Tides seulement. Le
 * cadrage verrouille « les parties contre bot rapportent 0 Tide
 * directement » ; en développement, le PvP demande deux comptes réels, et
 * tester l'économie de bout en bout en solo reste utile. Les parties contre
 * bot rapportent alors des Tides réduites (`DEV_BOT_MATCH_TIDES`).
 *
 * Le plafond quotidien de parties bot récompensées a disparu avec
 * l'arbitrage serveur : il n'existait que parce que l'issue était déclarée
 * par le client, et le cadrage demande d'« éviter un plafond brutal ».
 */

/**
 * `true` si une partie contre bot doit rapporter des Tides (dérogation de
 * développement). N'affecte ni l'XP ni les quêtes.
 *
 * Par défaut : actif hors production, inactif en production. `off`/`on`
 * (`TIDEBOUND_BOT_REWARDS`) permet de forcer les deux sens — pour tester le
 * comportement de production en local, ou prolonger la dérogation sur un
 * déploiement de préproduction.
 */
export function botTidesEnabled(): boolean {
  const override = process.env.TIDEBOUND_BOT_REWARDS?.trim().toLowerCase();
  if (override === "on" || override === "true" || override === "1") return true;
  if (override === "off" || override === "false" || override === "0") return false;
  return process.env.NODE_ENV !== "production";
}
