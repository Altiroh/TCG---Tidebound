import { getShipDefinition } from "@/game/environment/shipData";
import { graveyardReplacementOf, stripMarkers } from "@/game/cards/markers";
import type { CardInstance } from "@/game/cards/types";
import type { GameEvent } from "@/game/events/types";
import { boardSlotLayout } from "@/game/rules/boardSlots";
import { boardPermanents, slotsUsed } from "@/game/rules/ongoing";
import type { GameState, PlayerState } from "@/game/state/types";

/**
 * EMPLACEMENTS DU TERRAIN qu'une carte modifie (décision du 09/10/2026 —
 * Y'a plus de place !, Le Barrage des Égarés, Le Pont Sans Fin, Place au
 * Large). Un seul vocabulaire :
 *
 *  - CONDAMNER un emplacement libre : il ne peut plus recevoir de carte,
 *    pour une durée en tours de table (`expiresAtTurn`) ou tant que la carte
 *    qui l'a condamné est en jeu (`whileSourceInPlay`) ;
 *  - LIBÉRER un emplacement condamné : la condamnation tombe, quelle
 *    qu'en soit la source ;
 *  - AJOUTER un emplacement, pour une durée : à son terme, la carte posée
 *    dessus part au Cimetière.
 *
 * Plafonds (à valider en playtest, Notion) : une condamnation et un ajout
 * actifs par joueur au plus, et jamais plus de `MAX_BOARD_SLOTS`
 * emplacements.
 *
 * Les emplacements n'ont pas d'identité pour les règles (`boardSlots.ts` :
 * la case est une affaire de présentation) : condamner retire UN
 * emplacement libre, sans qu'il y ait à choisir lequel — aucune décision
 * n'est prise à la place du joueur. L'affichage grise les derniers.
 */
export interface SlotEffect {
  kind: "condemned" | "extra";
  /** Carte qui l'a posé. */
  sourceCardId: string;
  /** Exemplaire qui l'a posé — lu par `whileSourceInPlay`. */
  sourceInstanceId?: string;
  /** Dure tant que `sourceInstanceId` est en jeu (Le Barrage des Égarés). */
  whileSourceInPlay?: boolean;
  /** Tombe à l'ENTAME de ce tour (numéro de tour de jeu). Absent : pas d'échéance. */
  expiresAtTurn?: number;
}

/** Jamais plus d'emplacements que ça sur un terrain (plafond Notion, 09/10/2026). */
export const MAX_BOARD_SLOTS = 7;

const enJeu = (state: GameState, instanceId: string) => state.players.some((p) => p.board.some((u) => u.instanceId === instanceId));

/** Les effets d'emplacement encore en vigueur pour ce joueur, au tour en cours. */
export function activeSlotEffects(state: GameState, player: Pick<PlayerState, "slotEffects">): SlotEffect[] {
  return (player.slotEffects ?? []).filter(
    (effet) =>
      (effet.expiresAtTurn === undefined || state.turnNumber < effet.expiresAtTurn) &&
      (!effet.whileSourceInPlay || (effet.sourceInstanceId !== undefined && enJeu(state, effet.sourceInstanceId)))
  );
}

/** Emplacements condamnés en ce moment sur le terrain de ce joueur. */
export function condemnedSlots(state: GameState, player: Pick<PlayerState, "slotEffects">): number {
  return activeSlotEffects(state, player).filter((e) => e.kind === "condemned").length;
}

/** Emplacements AJOUTÉS en ce moment sur le terrain de ce joueur. */
export function extraSlots(state: GameState, player: Pick<PlayerState, "slotEffects">): number {
  return activeSlotEffects(state, player).filter((e) => e.kind === "extra").length;
}

/**
 * Emplacements UTILISABLES du terrain de ce joueur : ceux de son Navire,
 * plus les ajoutés (sans dépasser `MAX_BOARD_SLOTS`), moins les condamnés.
 * Seule lecture de la capacité d'un terrain — pose, invocation, retour du
 * Cimetière, affichage.
 */
export function boardCapacity(state: GameState, player: Pick<PlayerState, "shipId" | "slotEffects">): number {
  const base = getShipDefinition(player.shipId).slotCount;
  const avecAjouts = Math.min(MAX_BOARD_SLOTS, base + extraSlots(state, player));
  return Math.max(0, avecAjouts - condemnedSlots(state, player));
}

/** Emplacements encore libres sur ce terrain. */
export function freeBoardSlots(state: GameState, player: Pick<PlayerState, "shipId" | "slotEffects" | "board">): number {
  return Math.max(0, boardCapacity(state, player) - slotsUsed(player.board));
}

/** « Condamnez un emplacement libre » : possible s'il en reste un, et sans condamnation déjà active (plafond). */
export function canCondemnSlot(state: GameState, player: PlayerState): boolean {
  return freeBoardSlots(state, player) > 0 && condemnedSlots(state, player) === 0;
}

/** « Ajoutez 1 emplacement » : possible sans ajout déjà actif, et sous le plafond du terrain. */
export function canAddSlot(state: GameState, player: PlayerState): boolean {
  const base = getShipDefinition(player.shipId).slotCount;
  return extraSlots(state, player) === 0 && base + 1 <= MAX_BOARD_SLOTS;
}

/** Pose un effet d'emplacement sur le terrain de `playerId`. */
export function addSlotEffect(state: GameState, playerId: string, effet: SlotEffect): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, slotEffects: [...(p.slotEffects ?? []), effet] } : p)) as [PlayerState, PlayerState],
  };
}

/** « Libérez un emplacement condamné » : la plus ancienne condamnation en vigueur tombe. `freed: false` s'il n'y en avait aucune. */
export function freeCondemnedSlot(state: GameState, playerId: string): { state: GameState; freed: boolean } {
  const player = state.players.find((p) => p.id === playerId)!;
  const actifs = new Set(activeSlotEffects(state, player));
  const index = (player.slotEffects ?? []).findIndex((e) => e.kind === "condemned" && actifs.has(e));
  if (index < 0) return { state, freed: false };
  const slotEffects = (player.slotEffects ?? []).filter((_, i) => i !== index);
  return {
    state: { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, slotEffects } : p)) as [PlayerState, PlayerState] },
    freed: true,
  };
}

/**
 * Entame d'un tour : les effets d'emplacement échus tombent (durée écoulée,
 * ou source partie). Un emplacement AJOUTÉ qui disparaît emporte la carte
 * posée dessus au Cimetière (décision du 09/10/2026) — les cases au-delà de
 * la nouvelle capacité. Une unité marquée Mort va sous la pioche, comme
 * toujours quand elle devrait rejoindre le Cimetière.
 */
export function expireSlotEffects(state: GameState): { state: GameState; events: GameEvent[] } {
  let next = state;
  const events: GameEvent[] = [];
  for (const player of state.players) {
    if (!player.slotEffects?.length) continue;
    const avant = boardCapacity({ ...state, turnNumber: state.turnNumber - 1 }, player);
    const restants = activeSlotEffects(state, player);
    const nettoye: PlayerState = { ...player, slotEffects: restants.length > 0 ? restants : undefined };
    const apres = boardCapacity(state, nettoye);
    const rangee = boardSlotLayout(boardPermanents(player.board), Math.max(avant, apres));
    const debordent = rangee.slice(apres).filter((c): c is CardInstance => c !== undefined);
    const ids = new Set(debordent.map((c) => c.instanceId));
    const sousLaPioche = debordent.filter((c) => graveyardReplacementOf(c) === "deckBottom");
    const auCimetiere = debordent.filter((c) => graveyardReplacementOf(c) !== "deckBottom");
    const majJoueur: PlayerState = {
      ...nettoye,
      board: player.board.filter((u) => !ids.has(u.instanceId) && !(u.attachedToInstanceId && ids.has(u.attachedToInstanceId))),
      graveyard: [
        ...player.graveyard,
        ...auCimetiere.map((c) => ({ ...stripMarkers(c), damageMarked: 0, modifiers: [], graveyardCause: "expired" as const })),
        // Ses Équipements la suivent.
        ...player.board
          .filter((u) => u.attachedToInstanceId && ids.has(u.attachedToInstanceId))
          .map((u) => ({ ...u, damageMarked: 0, modifiers: [], attachedToInstanceId: undefined, graveyardCause: "expired" as const })),
      ],
      deck: [
        ...player.deck,
        ...sousLaPioche.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId, ownerId: c.ownerId, damageMarked: 0, modifiers: [], summoningSick: false, hasAttackedThisTurn: false })),
      ],
    };
    next = { ...next, players: next.players.map((p) => (p.id === player.id ? majJoueur : p)) as [PlayerState, PlayerState] };
    for (const carte of debordent) {
      const versPioche = graveyardReplacementOf(carte) === "deckBottom";
      events.push({
        type: "CARD_MOVED",
        instanceId: carte.instanceId,
        cardId: carte.cardId,
        ownerId: player.id,
        fromZone: "board",
        toZone: versPioche ? "deck" : "graveyard",
        ...(versPioche ? { deckPosition: "bottom" as const } : {}),
        turnNumber: state.turnNumber,
        timestamp: Date.now(),
      });
    }
  }
  return { state: next, events };
}
