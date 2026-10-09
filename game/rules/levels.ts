import { stripMarkers } from "@/game/cards/markers";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import type { GameEvent } from "@/game/events/types";
import { recordUnitArrivals, unitArrivalsLeft } from "@/game/rules/lande";
import { recordGraveyardArrival } from "@/game/state/discard";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * LIGNÉE LV (Lot 17 — Eidolon Opalin LV1 → LV5 → LVX).
 *
 * « Placez 1 marqueur Niveau sur lui. À N marqueurs Niveau, remplacez-le par
 * [carte] depuis votre main ou votre pioche. »
 *
 * - Les marqueurs vivent sur l'exemplaire en jeu (`CardInstance.levelMarkers`).
 * - Au seuil, la carte suivante est prise dans la MAIN, sinon dans la PIOCHE
 *   (le premier exemplaire trouvé). Sans exemplaire : rien, les marqueurs
 *   restent — un prochain marqueur retentera.
 * - L'ancienne part au Cimetière (ni détruite, ni Sabordée) ; la nouvelle
 *   prend sa place dans le rang, garde ses Équipements, et ARRIVE : son
 *   arrivée est une invocation (`SUMMON`), qui réveille ses effets d'arrivée.
 * - Une arrivée comme une autre : une Lande qui limite les arrivées
 *   (Chaîne de construction) peut l'empêcher.
 */
export function addLevelMarkers(
  state: GameState,
  ownerId: PlayerId,
  instanceId: string,
  amount: number,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const owner = state.players.find((p) => p.id === ownerId);
  const unit = owner?.board.find((u) => u.instanceId === instanceId);
  if (!owner || !unit || amount <= 0 || unit.pendingRemoval) return { state, events: [] };
  const markers = (unit.levelMarkers ?? 0) + amount;
  const next = replaceOwner(state, { ...owner, board: owner.board.map((u) => (u.instanceId === instanceId ? { ...u, levelMarkers: markers } : u)) });
  const spec = getCardDefinition(unit.cardId).levelUp;
  if (!spec || markers < spec.markers) return { state: next, events: [] };
  return evolve(next, ownerId, instanceId, spec.into, turnNumber);
}

function replaceOwner(state: GameState, owner: PlayerState): GameState {
  return { ...state, players: state.players.map((p) => (p.id === owner.id ? owner : p)) as GameState["players"] };
}

/** Même carte au sens des règles : identiques, ou l'une est la variante `-abyssal` de l'autre. */
function memeCarte(a: string, b: string): boolean {
  const base = (id: string) => id.replace(/-abyssal$/, "");
  return base(a) === base(b);
}

function evolve(state: GameState, ownerId: PlayerId, instanceId: string, intoCardId: string, turnNumber: number): { state: GameState; events: GameEvent[] } {
  const owner = state.players.find((p) => p.id === ownerId)!;
  const ancienne = owner.board.find((u) => u.instanceId === instanceId)!;
  // « Remplacez-le par X » : X ou sa variante Abyssale — une variante reste
  // la même carte pour toute condition qui nomme une carte (Règles, 17/09/2026).
  const estX = (c: CardInstance) => memeCarte(c.cardId, intoCardId);
  const depuisMain = owner.hand.find(estX);
  const depuisPioche = depuisMain ? undefined : owner.deck.find(estX);
  const prise = depuisMain ?? depuisPioche;
  if (!prise) return { state, events: [] };
  if (unitArrivalsLeft(state, ownerId, turnNumber) <= 0) return { state, events: [] };

  const nouvelle: CardInstance = {
    ...stripMarkers(prise),
    damageMarked: 0,
    modifiers: [],
    summoningSick: true,
    hasAttackedThisTurn: false,
    arrivedViaCardId: ancienne.cardId,
  };
  const board = owner.board.map((u) => {
    if (u.instanceId === instanceId) return nouvelle;
    // Ses Équipements suivent : ils équipaient la lignée, pas l'exemplaire.
    return u.attachedToInstanceId === instanceId ? { ...u, attachedToInstanceId: nouvelle.instanceId } : u;
  });
  let apres: PlayerState = {
    ...owner,
    board,
    hand: depuisMain ? owner.hand.filter((c) => c.instanceId !== prise.instanceId) : owner.hand,
    deck: depuisPioche ? owner.deck.filter((c) => c.instanceId !== prise.instanceId) : owner.deck,
    graveyard: [...owner.graveyard, { ...ancienne, damageMarked: 0, modifiers: [], levelMarkers: undefined, graveyardCause: "replaced" as const }],
  };
  apres = recordGraveyardArrival(apres, { cardId: ancienne.cardId, instanceId: ancienne.instanceId, turnNumber, fromZone: "board" });
  let next = replaceOwner(state, apres);
  next = recordUnitArrivals(next, ownerId, [getCardDefinition(nouvelle.cardId)], turnNumber);

  const base = { turnNumber, timestamp: Date.now() };
  const events: GameEvent[] = [
    { ...base, type: "CARD_MOVED", instanceId: ancienne.instanceId, cardId: ancienne.cardId, ownerId, fromZone: "board", toZone: "graveyard" },
    { ...base, type: "CARD_MOVED", instanceId: nouvelle.instanceId, cardId: nouvelle.cardId, ownerId, fromZone: depuisMain ? "hand" : "deck", toZone: "board" },
    { ...base, type: "SUMMON", playerId: ownerId, instanceId: nouvelle.instanceId, cardId: nouvelle.cardId },
  ];
  return { state: next, events };
}
