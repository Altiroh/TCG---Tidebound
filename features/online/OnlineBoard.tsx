"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  getCardDefinition,
  getShipDefinition,
  UNIT_CARD_TYPES,
  type CardInstance,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { Button } from "@/components/ui/Button";
import { BoardBackdrop } from "@/features/match/BoardBackdrop";
import { CardBack } from "@/features/match/CardBack";
import { CardHoverPreview } from "@/features/match/CardHoverPreview";
import { CardTile } from "@/features/match/CardTile";
import { CargoCluster } from "@/features/match/CargoCluster";
import { PhaseActionButton } from "@/features/match/PhaseActionButton";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { PlayerSummary } from "@/features/match/PlayerSummary";
import { ShipInstrumentCluster } from "@/features/match/ShipInstrumentCluster";
import { TIDE_STATE_COLORS, TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { formatEvent } from "@/features/match/formatEvent";
import { usePhaseBannerEvent } from "@/features/match/usePhaseBannerEvent";

interface OnlineBoardProps {
  state: GameState;
  myUserId: PlayerId;
  onAction: (action: PlayerAction) => void;
  pending: boolean;
  error: string | null;
}

type Pending =
  | { kind: "playCard"; instanceId: string; needsTarget: boolean }
  | { kind: "attack"; attackerId: string }
  | { kind: "break"; instanceId: string; needsTarget: boolean };

interface HoverPreview {
  cardId: string;
  rect: DOMRect;
}

function isUnitType(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

/** Instance de MAIN en cours de glissement, décodée depuis `DataTransfer` au drop. */
const DRAG_MIME_HAND = "application/x-tidebound-card-instance";
/** Unité de PLATEAU (à soi) en cours de glissement — vers une cible (attaque) ou vers le cimetière (Sabordage). */
const DRAG_MIME_UNIT = "application/x-tidebound-board-unit";

/** Plateau d'une partie en ligne : oriente toujours "moi" en bas, main adverse cachée, actions envoyées au serveur. */
export function OnlineBoard({ state, myUserId, onAction, pending, error }: OnlineBoardProps) {
  const [selection, setSelection] = useState<Pending | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [dragOverOwnBoard, setDragOverOwnBoard] = useState(false);
  const [dragOverOpponentBoard, setDragOverOpponentBoard] = useState(false);
  const [dragOverGraveyard, setDragOverGraveyard] = useState(false);

  const me = state.players.find((p) => p.id === myUserId)!;
  const opponent = state.players.find((p) => p.id !== myUserId)!;
  const myShip = getShipDefinition(me.shipId);
  const opponentShip = getShipDefinition(opponent.shipId);
  const isMyTurn = state.activePlayerId === myUserId;
  const canPlay = isMyTurn && !pending;
  const canPlayCards = canPlay && state.phase === "mainPhase" && !me.hasUsedMainActionThisTurn;
  const canAttack = canPlay && state.phase === "combatPhase";

  const recentEvents = useMemo(() => state.eventLog.slice(-10).reverse(), [state.eventLog]);
  const bannerEvent = usePhaseBannerEvent(state);
  const bannerText = bannerEvent
    ? bannerEvent.kind === "combatPhase"
      ? "Phase de combat"
      : bannerEvent.playerId === myUserId
        ? "Ton tour"
        : "Tour de l'adversaire"
    : null;

  function clearSelection() {
    setSelection(null);
    setSelectedBoardId(null);
  }

  function act(action: PlayerAction) {
    onAction(action);
    clearSelection();
  }

  function handleHandCardClick(instanceId: string) {
    if (!canPlayCards) return;
    const card = me.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    const def = getCardDefinition(card.cardId);
    const needsTarget = (def.onPlayEffects ?? []).some((e) => e.target.kind === "chosenUnit");
    if (needsTarget) {
      setSelectedBoardId(null);
      setSelection({ kind: "playCard", instanceId, needsTarget: true });
    } else {
      act({ type: "playCard", playerId: myUserId, instanceId });
    }
  }

  function handleOwnBoardCardClick(instanceId: string) {
    if (selection?.kind === "attack") {
      setSelection(null);
      return;
    }
    setSelectedBoardId((current) => (current === instanceId ? null : instanceId));
  }

  function handleAnyBoardCardClick(instanceId: string, ownerId: PlayerId) {
    if (!canPlay) return;
    if (selection?.kind === "playCard" && selection.needsTarget) {
      act({ type: "playCard", playerId: myUserId, instanceId: selection.instanceId, targetInstanceId: instanceId });
      return;
    }
    if (selection?.kind === "break" && selection.needsTarget) {
      act({ type: "breakObject", playerId: myUserId, instanceId: selection.instanceId, targetInstanceId: instanceId });
      return;
    }
    if (selection?.kind === "attack") {
      if (ownerId === myUserId) return;
      act({ type: "attack", playerId: myUserId, attackerInstanceId: selection.attackerId, defenderInstanceId: instanceId });
      return;
    }
    if (ownerId === myUserId) handleOwnBoardCardClick(instanceId);
  }

  function startBreak(unit: CardInstance) {
    const def = getCardDefinition(unit.cardId);
    const needsTarget = (def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit");
    if (needsTarget) {
      setSelection({ kind: "break", instanceId: unit.instanceId, needsTarget: true });
    } else {
      act({ type: "breakObject", playerId: myUserId, instanceId: unit.instanceId });
    }
  }

  function showPreview(e: React.MouseEvent, cardId: string) {
    setHoverPreview({ cardId, rect: e.currentTarget.getBoundingClientRect() });
  }
  function hidePreview() {
    setHoverPreview(null);
  }

  // --- Glisser-déposer depuis la main (cf. MatchBoard, même logique) -----
  function handleHandDragStart(e: React.DragEvent, instanceId: string) {
    if (!canPlayCards) return;
    e.dataTransfer.setData(DRAG_MIME_HAND, instanceId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(instanceId);
    hidePreview();
  }
  function handleHandDragEnd() {
    setDraggingId(null);
    setDragOverTargetId(null);
    setDragOverOwnBoard(false);
  }
  function handleOwnBoardDragOver(e: React.DragEvent) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverOwnBoard(true);
  }
  function handleOwnBoardDragLeave() {
    setDragOverOwnBoard(false);
  }
  function handleOwnBoardDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverOwnBoard(false);
    const instanceId = e.dataTransfer.getData(DRAG_MIME_HAND);
    setDraggingId(null);
    if (instanceId) handleHandCardClick(instanceId);
  }

  // --- Glisser-déposer une unité de plateau : attaquer ou Saborder (cf. MatchBoard) ---
  function handleUnitDragStart(e: React.DragEvent, instanceId: string) {
    if (!canPlay) return;
    e.dataTransfer.setData(DRAG_MIME_UNIT, instanceId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingUnitId(instanceId);
    hidePreview();
  }
  function handleUnitDragEnd() {
    setDraggingUnitId(null);
    setDragOverTargetId(null);
    setDragOverOpponentBoard(false);
    setDragOverGraveyard(false);
  }
  function handleOpponentBoardDragOver(e: React.DragEvent) {
    if (!draggingUnitId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverOpponentBoard(true);
  }
  function handleOpponentBoardDragLeave() {
    setDragOverOpponentBoard(false);
  }
  function handleOpponentBoardDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverOpponentBoard(false);
    const instanceId = e.dataTransfer.getData(DRAG_MIME_UNIT);
    setDraggingUnitId(null);
    if (instanceId) act({ type: "attack", playerId: myUserId, attackerInstanceId: instanceId });
  }
  function handleGraveyardDragOver(e: React.DragEvent) {
    if (!draggingUnitId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGraveyard(true);
  }
  function handleGraveyardDragLeave() {
    setDragOverGraveyard(false);
  }
  function handleGraveyardDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverGraveyard(false);
    const instanceId = e.dataTransfer.getData(DRAG_MIME_UNIT);
    setDraggingUnitId(null);
    if (instanceId) act({ type: "saborder", playerId: myUserId, instanceId });
  }

  function handleBoardTileDragOver(e: React.DragEvent, targetInstanceId: string) {
    if (!draggingId && !draggingUnitId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTargetId(targetInstanceId);
  }
  function handleBoardTileDrop(e: React.DragEvent, targetInstanceId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTargetId(null);
    setDragOverOwnBoard(false);
    setDragOverOpponentBoard(false);

    const draggedUnitId = e.dataTransfer.getData(DRAG_MIME_UNIT);
    if (draggedUnitId) {
      setDraggingUnitId(null);
      const draggedUnit = me.board.find((u) => u.instanceId === draggedUnitId);
      const draggedDef = draggedUnit ? getCardDefinition(draggedUnit.cardId) : undefined;
      // Un Objet glissé sur une cible sert à résoudre son effet de bris ciblé
      // (ex: "Levier de Lest" : Sabordez une Structure) — seuls les Marins/
      // Créatures glissés sur une cible attaquent.
      if (draggedDef?.type === "objet") {
        act({ type: "breakObject", playerId: myUserId, instanceId: draggedUnitId, targetInstanceId });
      } else {
        act({ type: "attack", playerId: myUserId, attackerInstanceId: draggedUnitId, defenderInstanceId: targetInstanceId });
      }
      return;
    }

    const instanceId = e.dataTransfer.getData(DRAG_MIME_HAND);
    setDraggingId(null);
    if (!instanceId || !canPlayCards) return;
    const card = me.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    const def = getCardDefinition(card.cardId);
    const needsTarget = (def.onPlayEffects ?? []).some((e2) => e2.target.kind === "chosenUnit");
    if (needsTarget) {
      act({ type: "playCard", playerId: myUserId, instanceId, targetInstanceId });
    } else {
      act({ type: "playCard", playerId: myUserId, instanceId });
    }
  }

  if (state.status === "finished") {
    const iWon = state.winnerId === myUserId;
    return (
      <>
        <BoardBackdrop />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
          <h1 className="text-3xl font-bold">{state.winnerId ? (iWon ? "Tu gagnes" : "Tu perds") : "Match nul"}</h1>
          <p className="text-slate-400">La mer a tranché.</p>
          <Link href="/en-ligne">
            <Button>Nouvelle partie</Button>
          </Link>
        </div>
      </>
    );
  }

  const selectedUnit = selectedBoardId ? me.board.find((u) => u.instanceId === selectedBoardId) : undefined;
  const selectedDef = selectedUnit ? getCardDefinition(selectedUnit.cardId) : undefined;
  const myEmptySlots = Math.max(0, myShip.slotCount - me.board.length);
  const opponentEmptySlots = Math.max(0, opponentShip.slotCount - opponent.board.length);

  return (
    <>
      <BoardBackdrop />
      <PhaseBanner text={bannerText} bannerKey={bannerEvent?.id ?? null} />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4">
        <PlayerSummary label="Adversaire" handCount={opponent.hand.length} />
        <div className="flex flex-wrap gap-2">
          {opponent.hand.map((card) => (
            <CardBack key={card.instanceId} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ShipInstrumentCluster
            anchor={opponent.anchor}
            anchorMax={opponentShip.startingAnchor}
            reason={opponent.reason}
            reasonMax={opponent.reasonMax}
          />
          <div
            onDragOver={handleOpponentBoardDragOver}
            onDragLeave={handleOpponentBoardDragLeave}
            onDrop={handleOpponentBoardDrop}
            className={`flex flex-1 flex-wrap gap-2 rounded-md p-1 transition-colors ${
              dragOverOpponentBoard ? "bg-rose-500/10 ring-2 ring-rose-500/60" : ""
            }`}
          >
            {opponent.board.map((unit) => (
              <div
                key={unit.instanceId}
                onMouseEnter={(e) => showPreview(e, unit.cardId)}
                onMouseLeave={hidePreview}
                onDragOver={(e) => handleBoardTileDragOver(e, unit.instanceId)}
                onDragLeave={() => setDragOverTargetId((id) => (id === unit.instanceId ? null : id))}
                onDrop={(e) => handleBoardTileDrop(e, unit.instanceId)}
                className={dragOverTargetId === unit.instanceId ? "rounded-md ring-2 ring-board-accent" : ""}
              >
                <CardTile
                  instance={unit}
                  tideState={state.environment.tideState}
                  selected={selection?.kind === "attack"}
                  onClick={() => handleAnyBoardCardClick(unit.instanceId, opponent.id)}
                />
              </div>
            ))}
            {Array.from({ length: opponentEmptySlots }).map((_, i) => (
              <EmptySlot key={`opp-empty-${i}`} />
            ))}
          </div>
          <CargoCluster deckCount={opponent.deck.length} graveyardCount={opponent.graveyard.length} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-board-surface px-4 py-2 text-sm">
          <div className="flex items-center gap-4">
            <span>
              Tour <strong>{state.turnNumber}</strong>
            </span>
            <span>
              Marée :{" "}
              <strong className={TIDE_STATE_COLORS[state.environment.tideState]}>
                {TIDE_STATE_LABELS[state.environment.tideState]}
              </strong>{" "}
              ({state.environment.tideRemainingTurns} tour(s))
            </span>
            <span title={state.environment.tideOrientation === "montante" ? "Vers les Abysses" : "Vers le Calme"}>
              {state.environment.tideOrientation === "montante" ? "▲ Montante" : "▼ Descendante"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {selection && isMyTurn && (
              <Button variant="secondary" onClick={clearSelection}>
                Annuler
              </Button>
            )}
            <PhaseActionButton
              isMyTurn={isMyTurn && !pending}
              phase={state.phase}
              onAdvancePhase={() => act({ type: "advancePhase", playerId: myUserId })}
              onEndTurn={() => act({ type: "endTurn", playerId: myUserId })}
              size={56}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-rose-800 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}
        {selection?.kind === "playCard" && <p className="text-xs text-slate-400">Choisissez une cible sur le plateau.</p>}
        {selection?.kind === "break" && <p className="text-xs text-slate-400">Choisissez une cible pour l&apos;effet de bris.</p>}
        {selection?.kind === "attack" && (
          <p className="text-xs text-slate-400">Choisissez une cible adverse, ou attaquez le Navire directement.</p>
        )}

        <div className="flex items-center gap-2">
          <ShipInstrumentCluster
            anchor={me.anchor}
            anchorMax={myShip.startingAnchor}
            reason={me.reason}
            reasonMax={me.reasonMax}
          />
          <div
            onDragOver={handleOwnBoardDragOver}
            onDragLeave={handleOwnBoardDragLeave}
            onDrop={handleOwnBoardDrop}
            className={`flex flex-1 flex-wrap gap-2 rounded-md p-1 transition-colors ${
              dragOverOwnBoard ? "bg-board-accent/10 ring-2 ring-board-accent/60" : ""
            }`}
          >
            {me.board.map((unit) => (
              <div
                key={unit.instanceId}
                draggable={canPlay}
                onDragStart={(e) => handleUnitDragStart(e, unit.instanceId)}
                onDragEnd={handleUnitDragEnd}
                onMouseEnter={(e) => showPreview(e, unit.cardId)}
                onMouseLeave={hidePreview}
                onDragOver={(e) => handleBoardTileDragOver(e, unit.instanceId)}
                onDragLeave={() => setDragOverTargetId((id) => (id === unit.instanceId ? null : id))}
                onDrop={(e) => handleBoardTileDrop(e, unit.instanceId)}
                className={`${dragOverTargetId === unit.instanceId ? "rounded-md ring-2 ring-board-accent" : ""} ${
                  draggingUnitId === unit.instanceId ? "opacity-40" : ""
                }`}
              >
                <CardTile
                  instance={unit}
                  tideState={state.environment.tideState}
                  selected={selectedBoardId === unit.instanceId || selection?.kind === "attack"}
                  onClick={() => handleAnyBoardCardClick(unit.instanceId, me.id)}
                />
              </div>
            ))}
            {Array.from({ length: myEmptySlots }).map((_, i) => (
              <EmptySlot key={`own-empty-${i}`} />
            ))}
          </div>
          <CargoCluster
            deckCount={me.deck.length}
            graveyardCount={me.graveyard.length}
            graveyardDropZone={{
              isOver: dragOverGraveyard,
              onDragOver: handleGraveyardDragOver,
              onDragLeave: handleGraveyardDragLeave,
              onDrop: handleGraveyardDrop,
            }}
          />
        </div>

        {selectedUnit && selectedDef && !selection && isMyTurn && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-board-accent/40 bg-board-accent/5 px-3 py-2">
            <span className="text-xs text-slate-300">{selectedDef.name} :</span>
            {canAttack && isUnitType(selectedDef.type) && !selectedUnit.summoningSick && !selectedUnit.hasAttackedThisTurn && (
              <>
                <Button variant="secondary" onClick={() => setSelection({ kind: "attack", attackerId: selectedUnit.instanceId })}>
                  Attaquer une cible
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => act({ type: "attack", playerId: myUserId, attackerInstanceId: selectedUnit.instanceId })}
                >
                  Attaquer le Navire adverse
                </Button>
              </>
            )}
            {canPlayCards && (
              <>
                {selectedDef.type === "objet" && (
                  <Button variant="secondary" onClick={() => startBreak(selectedUnit)}>
                    Briser
                  </Button>
                )}
                <Button variant="secondary" onClick={() => act({ type: "saborder", playerId: myUserId, instanceId: selectedUnit.instanceId })}>
                  Saborder
                </Button>
              </>
            )}
            {!(
              (canAttack && isUnitType(selectedDef.type) && !selectedUnit.summoningSick && !selectedUnit.hasAttackedThisTurn) ||
              canPlayCards
            ) && (
              <span className="text-xs text-slate-500">
                {state.phase === "combatPhase"
                  ? "Aucune action disponible en Phase de combat pour cette carte."
                  : "Action principale déjà utilisée ce tour-ci."}
              </span>
            )}
          </div>
        )}

        <PlayerSummary label={isMyTurn ? "Toi (à toi de jouer)" : "Toi"} handCount={me.hand.length} highlighted={isMyTurn} />
        <div className="flex flex-wrap gap-2">
          {me.hand.map((card) => (
            <div
              key={card.instanceId}
              draggable={canPlayCards}
              onDragStart={(e) => handleHandDragStart(e, card.instanceId)}
              onDragEnd={handleHandDragEnd}
              onMouseEnter={(e) => showPreview(e, card.cardId)}
              onMouseLeave={hidePreview}
              className={draggingId === card.instanceId ? "opacity-40" : ""}
            >
              <CardTile
                instance={card}
                tideState={state.environment.tideState}
                selected={selection?.kind === "playCard" && selection.instanceId === card.instanceId}
                disabled={!canPlayCards}
                onClick={() => handleHandCardClick(card.instanceId)}
              />
            </div>
          ))}
          {me.hand.length === 0 && <p className="text-xs text-slate-600">Main vide.</p>}
        </div>

        <details className="rounded-md border border-slate-800 bg-board-surface/50 px-3 py-2 text-xs text-slate-400">
          <summary className="cursor-pointer select-none text-slate-300">Journal de la partie</summary>
          <ul className="mt-2 space-y-1">
            {recentEvents.map((event, i) => (
              <li key={i}>{formatEvent(state, event)}</li>
            ))}
          </ul>
        </details>

        {hoverPreview && <CardHoverPreview cardId={hoverPreview.cardId} anchorRect={hoverPreview.rect} />}
      </div>
    </>
  );
}

/** Emplacement de Slot inoccupé — rend visible le nombre total de Slots qu'autorise le Navire (4/5/6), pas seulement les permanents déjà posés. */
function EmptySlot() {
  return (
    <div
      aria-hidden
      className="flex aspect-[5/7] w-28 items-center justify-center rounded-md border border-dashed border-slate-700/70 text-center text-[10px] leading-tight text-slate-600"
    >
      Emplacement libre
    </div>
  );
}
