import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, CardInstance } from "@/game/cards/types";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import { isSentinel } from "@/game/rules/chromatic";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * LA PIERRE SURVIT À SON PORTEUR — règle de famille des Sentinelles
 * Chromatiques (Lot 15, décision du 24/09/2026).
 *
 * Quand une Sentinelle quitte le plateau par destruction, sa pierre reste :
 * son contrôleur crée un Éclat Chromatique de sa couleur. Écrite UNE fois
 * ici, comme les Signaux, et pas recopiée sur chaque définition.
 *
 * - Destruction SUBIE seulement : combat ou effet. Un Sabordage est un
 *   départ VOULU (le joueur fait de la place) : il ne laisse pas d'Éclat
 *   (décision du 25/09/2026 — l'appelant, `processDeaths`, ne l'appelle pas
 *   pour une unité sabordée). Un Assemblage (Le Géant Chromatique) place ses
 *   Sentinelles au Cimetière SANS les détruire : pas d'Éclat non plus.
 * - Couleur : celle de la carte au moment où elle part (imprimée, ou gagnée
 *   sur l'instance comme la couleur choisie de l'Émissaire) — la première
 *   si elle en a plusieurs, comme l'Émissaire.
 * - Une Sentinelle dont le texte crée DÉJÀ son Éclat (Émissaire de Quartz)
 *   n'en laisse pas un second.
 * - Pas de place sur le plateau : pas d'Éclat (règle d'invocation).
 */
const ECLAT_DE_SA_COULEUR: EffectDefinition[] = [{ type: "summon", target: { kind: "controllerPlayer" }, chromaticShardOf: "self" }];

/** Le texte de la carte crée déjà son propre Éclat à sa destruction. */
function creeDejaSonEclat(def: CardDefinition): boolean {
  return (def.abilities ?? []).some(
    (ability) => ability.trigger === "onDeath" && ability.effects.some((effect) => effect.chromaticShardOf === "self")
  );
}

/**
 * À appeler juste après la destruction d'une unité, une fois l'instance au
 * Cimetière de son propriétaire (c'est là que sa couleur est relue).
 */
export function leaveChromaticShard(
  state: GameState,
  unit: CardInstance,
  ownerId: PlayerId,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  if (!isSentinel(unit) || creeDejaSonEclat(getCardDefinition(unit.cardId))) return { state, events: [] };
  return resolveEffectSequence(state, ECLAT_DE_SA_COULEUR, { controllerId: ownerId, sourceInstanceId: unit.instanceId, turnNumber });
}
