/**
 * Politique de récompense des parties contre bot — LE seul endroit qui
 * décide si le cadrage « 0 Tide contre bot » est contourné.
 *
 * Pourquoi cette dérogation existe. Aujourd'hui, rien ne permet de tester
 * l'économie de bout en bout : le PvP demande deux joueurs réels, et les
 * Contrats (missions quotidiennes), que le cadrage désigne comme la source
 * PRINCIPALE de Tides, ne sont pas implémentés. Les parties contre bot sont
 * donc la seule boucle jouable en solo — d'où XP et Tides réduites contre
 * bot pendant le développement.
 *
 * Ce que ça coûte, explicitement. Une partie contre bot est jouée
 * ENTIÈREMENT dans le navigateur (`features/match/createLocalMatch.ts`) :
 * c'est le client qui déclare son résultat. Un joueur déterminé peut donc
 * s'octroyer des victoires. C'est acceptable en développement — ça ne l'est
 * pas en production, d'où le garde-fou ci-dessous.
 *
 * Ce qui reste protégé malgré tout :
 *   - chaque partie bot est ENREGISTRÉE dans `matches` (`mode: 'bot'`) et
 *     récompensée par le même chemin idempotent que le PvP, donc un même
 *     résultat ne peut pas être encaissé deux fois ;
 *   - les montants restent ceux du serveur : le client déclare une issue,
 *     jamais un gain ;
 *   - le plafond quotidien limite la casse même si l'issue est falsifiée.
 *
 * Quand les parties bot seront persistées et arbitrées côté serveur, il n'y
 * aura qu'à faire retourner `true` en toute circonstance à ce module — le
 * calcul, lui, ne change pas.
 */

/**
 * Nombre de parties contre bot récompensées par jour (UTC) et par joueur.
 *
 * Existe parce que l'issue est déclarée par le client : sans plafond, une
 * boucle automatisée pourrait générer des Tides sans limite et rendre les
 * données d'équilibrage inutilisables. 12 parties/jour couvre largement une
 * session de test réelle.
 */
export const BOT_REWARD_DAILY_CAP = 12;

/**
 * `true` si une partie contre bot doit rapporter XP et Tides.
 *
 * Par défaut : actif hors production, inactif en production. `off`/`on`
 * (`TIDEBOUND_BOT_REWARDS`) permet de forcer les deux sens — pour tester le
 * comportement de production en local, ou prolonger la dérogation sur un
 * déploiement de préproduction.
 */
export function botRewardsEnabled(): boolean {
  const override = process.env.TIDEBOUND_BOT_REWARDS?.trim().toLowerCase();
  if (override === "on" || override === "true" || override === "1") return true;
  if (override === "off" || override === "false" || override === "0") return false;
  return process.env.NODE_ENV !== "production";
}
