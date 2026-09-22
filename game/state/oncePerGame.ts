import type { PlayerState } from "@/game/state/types";

/**
 * FRÉQUENCE « UNE FOIS PAR PARTIE » — primitive générique.
 *
 * Le moteur savait déjà compter deux choses :
 *   - « une fois par tour » sur une INSTANCE de carte
 *     (`CardInstance.oncePerTurnFlags`, `game/state/oncePerTurn.ts`), avec
 *     sa variante `onceEver` pour « la première fois que… » ;
 *   - « N activations par tour » pour la capacité de Navire
 *     (`PlayerState.shipAbility.activations`).
 *
 * Il manquait la troisième : une réserve d'usages qui vaut pour TOUTE la
 * partie et qui n'appartient à aucune carte posée — exactement ce que
 * demandent Virage court, Changer de cap et Tenir la ligne, dont le Navire
 * n'est justement pas sur le plateau.
 *
 * Choix de modélisation :
 *   - un simple COMPTEUR par clé, porté par le joueur. Un booléen dirait
 *     « une fois » et rien d'autre ; un compteur dit aussi « deux fois par
 *     partie » le jour où une carte le demandera, sans rien réécrire ;
 *   - la clé est une CHAÎNE fournie par l'appelant, pas un identifiant de
 *     Navire. C'est ce qui rend la primitive réutilisable : une carte y
 *     inscrira `carte:<cardId>` (une fois par partie toutes copies
 *     confondues), un Navire `navire:<shipId>:<capacité>` ;
 *   - c'est de la DONNÉE sérialisable dans `GameState`, donc elle vit en
 *     base avec le reste de l'état (`match_states`) : elle survit à une
 *     reconnexion, à un rechargement de page, à un redémarrage du serveur,
 *     et le navigateur n'en est jamais l'autorité.
 *
 * Aucun nettoyage de fin de tour, volontairement : ce qui ne se réarme
 * jamais n'a pas besoin d'être entretenu.
 */

/** Clé d'une capacité de Navire. Stable pour toute la partie : le Navire ne change pas. */
export function shipAbilityGameKey(shipId: string, abilityName: string): string {
  return `navire:${shipId}:${abilityName}`;
}

/** Clé d'une capacité de carte limitée à un usage par partie, toutes copies confondues. */
export function cardGameKey(cardId: string, abilityName: string): string {
  return `carte:${cardId}:${abilityName}`;
}

/** Usages déjà consommés sous cette clé. */
export function oncePerGameUses(player: PlayerState, key: string): number {
  return player.oncePerGameUses?.[key] ?? 0;
}

/** Reste-t-il un usage sous cette clé ? `allowed` vaut 1 pour une vraie « une fois par partie ». */
export function oncePerGameAvailable(player: PlayerState, key: string, allowed = 1): boolean {
  return oncePerGameUses(player, key) < allowed;
}

/** Inscrit un usage de plus. Jamais destructif : l'appelant reste libre de ne pas l'appeler. */
export function withOncePerGameUse(player: PlayerState, key: string): PlayerState {
  return {
    ...player,
    oncePerGameUses: { ...(player.oncePerGameUses ?? {}), [key]: oncePerGameUses(player, key) + 1 },
  };
}
