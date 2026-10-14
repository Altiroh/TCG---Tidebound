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
 * Ciblage en cours côté conteneur (clic sur une carte de main à effet —
 * Objet compris —, réaction ciblée, attaque, tir du canon de Navire). Le tir n'a pas
 * de `sourceInstanceId` : sa source est le Navire, qui n'est pas une carte
 * du plateau. Une réaction porte l'index de sa capacité et la carte qui l'a
 * déclenchée — ce sont eux qui disent quelles cibles sont légales.
 */
export type TableTargeting =
  | { kind: "playCard" | "attack" | "ability"; sourceInstanceId: string }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; triggerSourceInstanceId?: string }
  /**
   * Effet d'arrivée en réserve, peut-être à plusieurs modes (« choisissez :
   * A ou B ») : les cibles de TOUS les modes s'éclairent, et c'est la cible
   * touchée qui dit lequel s'applique (`arrivalModeFor`).
   */
  | { kind: "arrival"; sourceInstanceId: string; abilityIndexes: readonly number[] }
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

/** Cibles légales de CHAQUE mode d'un effet d'arrivée, par index de capacité. */
export function arrivalTargetsByMode(
  state: GameState,
  viewerId: PlayerId,
  sourceInstanceId: string,
  abilityIndexes: readonly number[]
): Map<number, Set<string>> {
  const card = state.players.flatMap((p) => p.board).find((c) => c.instanceId === sourceInstanceId);
  const modes = new Map<number, Set<string>>();
  if (!card) return modes;
  for (const index of abilityIndexes) {
    const ability = getCardDefinition(card.cardId).abilities?.[index];
    const among = ability ? chosenAmong(state, ability.effects, viewerId, card.instanceId) : null;
    if (among) modes.set(index, among);
  }
  return modes;
}

/** Le mode qu'une cible touchée désigne : le premier dont elle est une cible légale. */
export function arrivalModeFor(
  state: GameState,
  viewerId: PlayerId,
  sourceInstanceId: string,
  abilityIndexes: readonly number[],
  targetInstanceId: string
): number | undefined {
  for (const [index, targets] of arrivalTargetsByMode(state, viewerId, sourceInstanceId, abilityIndexes)) {
    if (targets.has(targetInstanceId)) return index;
  }
  return undefined;
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
      // Un Objet joué résout son effet de Bris.
      return chosenAmong(state, (def.type === "objet" ? def.onBreakEffects : def.onPlayEffects) ?? [], viewerId, card.instanceId);
    }
    case "ability": {
      const card = viewer.board.find((c) => c.instanceId === targeting.sourceInstanceId);
      const spec = card && getCardDefinition(card.cardId).activatableOncePerTurn;
      return card && spec ? chosenAmong(state, spec.effects, viewerId, card.instanceId) : null;
    }
    case "arrival": {
      const union = new Set<string>();
      for (const targets of arrivalTargetsByMode(state, viewerId, targeting.sourceInstanceId, targeting.abilityIndexes).values()) {
        for (const id of targets) union.add(id);
      }
      return union;
    }
    case "reaction": {
      // La source peut être EN MAIN : un Objet Chaîne qui se joue, ou une
      // carte jouée en réaction (Propagation, Mutation Réflexe — Lot 16). La
      // chercher seulement en jeu ne trouvait rien : aucune cible ne
      // s'éclairait, et le joueur restait dans la fenêtre sans savoir quoi toucher.
      const card = [...state.players.flatMap((p) => p.board), ...viewer.hand].find((c) => c.instanceId === targeting.sourceInstanceId);
      const ability = card && getCardDefinition(card.cardId).abilities?.[targeting.abilityIndex];
      return card && ability
        ? chosenAmong(state, ability.effects, viewerId, card.instanceId, targeting.triggerSourceInstanceId)
        : null;
    }
  }
}
