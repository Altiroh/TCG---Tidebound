import { hasAnyValidEquipTarget, type CardDefinition, type CardInstance } from "@/game";

/**
 * Une carte jouée demande-t-elle une cible ? Cas général : présence d'un
 * `onPlayEffect` en `chosenUnit`. Cas particulier des Équipements
 * (`attachEquipment`) : seulement "si possible" — s'il n'existe aucun
 * permanent équipable sur le plateau du joueur, la carte se joue sans lien
 * plutôt que de rester bloquée en attente d'une cible qui n'existe pas.
 * Même règle que `game/actions/playCard.ts` (`validate`), dupliquée ici
 * côté client (partagée par `MatchBoard`/`OnlineBoard`) pour ne pas ouvrir
 * un état "pending" sans issue.
 */
export function needsPlayTarget(def: CardDefinition, board: CardInstance[]): boolean {
  const effects = def.onPlayEffects ?? [];
  if (!effects.some((e) => e.target.kind === "chosenUnit")) return false;
  const attachEffect = effects.some((e) => e.type === "attachEquipment");
  if (attachEffect) return hasAnyValidEquipTarget(def, board);
  return true;
}
