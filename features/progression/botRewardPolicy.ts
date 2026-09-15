/**
 * Politique de récompense des parties contre bot — LE seul endroit qui
 * décide si le cadrage « 0 Tide contre bot » est contourné.
 *
 * Depuis que les parties contre bot sont jouées et arbitrées côté serveur
 * (`features/matches/matchStore.ts`), leur ISSUE est aussi fiable que celle
 * d'une partie PvP : le navigateur ne déclare plus rien. Elles rapportent
 * donc toujours leur XP (`MATCH_XP`) et font avancer les quêtes compatibles
 * bot, en production comme en développement.
 *
 * Reste une DÉROGATION DE DÉVELOPPEMENT, pour tout ce qui est réservé au
 * PvP. Le cadrage verrouille « les parties contre bot rapportent 0 Tide
 * directement » et le pool de quêtes réserve quelques objectifs au PvP ; en
 * développement, le PvP demande deux comptes réels, et il faut pouvoir
 * tester la boucle complète — XP, Tides, paliers, quêtes, y compris les
 * quêtes PvP — avec un seul compte fictif. Sous la dérogation, une partie
 * contre bot est traitée EXACTEMENT comme une partie PvP :
 *
 *   - Tides de partie : `MATCH_TIDES.pvpWin` / `pvpLoss` au lieu de 0 ;
 *   - bonus de Tides de la première victoire du jour ;
 *   - quêtes marquées `botProgressAllowed: false` : elles avancent.
 *
 * Le plafond quotidien de parties bot récompensées a disparu avec
 * l'arbitrage serveur : il n'existait que parce que l'issue était déclarée
 * par le client, et le cadrage demande d'« éviter un plafond brutal ».
 */

/**
 * `true` si une partie contre bot doit compter comme une partie PvP pour
 * les récompenses (dérogation de développement).
 *
 * Par défaut : actif hors production, inactif en production. `off`/`on`
 * (`TIDEBOUND_BOT_REWARDS`) permet de forcer les deux sens — pour tester le
 * comportement de production en local, ou prolonger la dérogation sur un
 * déploiement de préproduction.
 */
export function botCountsAsPvp(): boolean {
  const override = process.env.TIDEBOUND_BOT_REWARDS?.trim().toLowerCase();
  if (override === "on" || override === "true" || override === "1") return true;
  if (override === "off" || override === "false" || override === "0") return false;
  return process.env.NODE_ENV !== "production";
}
