import {
  canBeEquipTarget,
  eligibleChosenUnits,
  getCardDefinition,
  hasResistance,
  type EffectDefinition,
  type GameState,
  type PlayerId,
} from "@/game";
import { needsPlayTarget } from "@/features/match/needsPlayTarget";

/**
 * Ciblage en cours côté conteneur (clic sur une carte de main à effet, bris
 * ciblé, réaction ciblée, attaque, tir du canon de Navire). Le tir n'a pas
 * de `sourceInstanceId` : sa source est le Navire, qui n'est pas une carte
 * du plateau. Une réaction porte l'index de sa capacité et la carte qui l'a
 * déclenchée — ce sont eux qui disent quelles cibles sont légales.
 */
export type TableTargeting =
  | { kind: "playCard" | "break" | "attack" | "ability"; sourceInstanceId: string }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; triggerSourceInstanceId?: string }
  | { kind: "shipShot" | "shipTarget"; sourceInstanceId?: undefined }
  | null;

/** Unités qui satisfont TOUS les effets « unité désignée » d'une liste (le moteur exige chacun). */
function chosenAmong(
  state: GameState,
  effects: readonly EffectDefinition[],
  controllerId: PlayerId,
  sourceInstanceId: string,
  triggerSourceInstanceId?: string
): Set<string> | null {
  const chosen = effects.filter((e) => e.target.kind === "chosenUnit");
  if (chosen.length === 0) return null;
  const sets = chosen.map(
    (e) => new Set(eligibleChosenUnits(state, e.target, controllerId, sourceInstanceId, triggerSourceInstanceId).map((c) => c.unit.instanceId))
  );
  return new Set([...sets[0]!].filter((id) => sets.every((set) => set.has(id))));
}

/**
 * CIBLES LÉGALES du ciblage en cours, par `instanceId` de carte en jeu —
 * celles qui s'éclairent, et les seules qu'un toucher désigne : toucher une
 * autre carte la montre en grand au lieu de lancer une action que le moteur
 * refuserait.
 *
 * Mêmes règles que le moteur (`eligibleChosenUnits`, `canBeEquipTarget`).
 * `null` : le ciblage ne vise pas de carte précise qu'on sache énumérer
 * ici — le conteneur tranche, comme avant.
 */
export function legalTargetsFor(state: GameState, viewerId: PlayerId, targeting: TableTargeting): Set<string> | null {
  if (!targeting) return null;
  const viewer = state.players.find((p) => p.id === viewerId);
  if (!viewer) return null;
  const opponentBoard = state.players.find((p) => p.id !== viewerId)?.board ?? [];

  switch (targeting.kind) {
    case "attack":
    case "shipShot":
      // Les unités adverses ; le moteur garde le dernier mot (Garde…).
      return new Set(opponentBoard.map((u) => u.instanceId));
    case "shipTarget":
      return new Set(
        state.players.flatMap((p) => p.board.filter((u) => hasResistance(getCardDefinition(u.cardId))).map((u) => u.instanceId))
      );
    case "playCard": {
      const card = viewer.hand.find((c) => c.instanceId === targeting.sourceInstanceId);
      if (!card) return null;
      const def = getCardDefinition(card.cardId);
      if (!needsPlayTarget(def, viewer.board)) return null;
      if ((def.onPlayEffects ?? []).some((e) => e.type === "attachEquipment")) {
        return new Set(viewer.board.filter((unit) => canBeEquipTarget(def, viewer.board, unit)).map((unit) => unit.instanceId));
      }
      return chosenAmong(state, def.onPlayEffects ?? [], viewerId, card.instanceId);
    }
    case "break": {
      const card = [...viewer.hand, ...viewer.board].find((c) => c.instanceId === targeting.sourceInstanceId);
      return card ? chosenAmong(state, getCardDefinition(card.cardId).onBreakEffects ?? [], viewerId, card.instanceId) : null;
    }
    case "ability": {
      const card = viewer.board.find((c) => c.instanceId === targeting.sourceInstanceId);
      const spec = card && getCardDefinition(card.cardId).activatableOncePerTurn;
      return card && spec ? chosenAmong(state, spec.effects, viewerId, card.instanceId) : null;
    }
    case "reaction": {
      const card = state.players.flatMap((p) => p.board).find((c) => c.instanceId === targeting.sourceInstanceId);
      const ability = card && getCardDefinition(card.cardId).abilities?.[targeting.abilityIndex];
      return card && ability
        ? chosenAmong(state, ability.effects, viewerId, card.instanceId, targeting.triggerSourceInstanceId)
        : null;
    }
  }
}
