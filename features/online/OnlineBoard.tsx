"use client";

import { useState } from "react";
import Link from "next/link";
import {
  eligibleCandidatesFor,
  getCardDefinition,
  getShipDefinition,
  STATUS_SILENCE,
  UNIT_CARD_TYPES,
  type CardInstance,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { Button } from "@/components/ui/Button";
import { ActionToastStack } from "@/features/match/ActionToastStack";
import { BoardBackdrop } from "@/features/match/BoardBackdrop";
import { BoardCardTile } from "@/features/match/BoardCardTile";
import { BoardStage } from "@/features/match/BoardStage";
import { CardDetailModal } from "@/features/match/CardDetailModal";
import { CardFlightLayer } from "@/features/match/CardFlightLayer";
import { CargoCluster } from "@/features/match/CargoCluster";
import { DragTargetingTrail } from "@/features/match/DragTargetingTrail";
import { EventFeed } from "@/features/match/EventFeed";
import { GraveyardViewer } from "@/features/match/GraveyardViewer";
import { HandFan } from "@/features/match/HandFan";
import { OpponentHandFan } from "@/features/match/OpponentHandFan";
import { PhaseActionButton } from "@/features/match/PhaseActionButton";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { ShipInstrumentCluster } from "@/features/match/ShipInstrumentCluster";
import { TideOrientationTile } from "@/features/match/TideOrientationTile";
import { TideProgressBar } from "@/features/match/TideProgressBar";
import { useActionToasts } from "@/features/match/useActionToasts";
import { useCardFlights, type CardFlight } from "@/features/match/useCardFlights";
import { usePhaseBannerEvent } from "@/features/match/usePhaseBannerEvent";

/** Centres approximatifs (repère `BoardStage`, 1672×941) des zones pioche/main/cimetière de chaque côté — repris des coordonnées déjà posées pour `CargoCluster`/les mains/le plateau, pour l'animation `CardFlightLayer`. */
const OWN_DECK_POS = { x: 1310, y: 640 };
const OWN_GRAVEYARD_POS = { x: 1430, y: 640 };
const OWN_HAND_POS = { x: 836, y: 872 };
const OWN_BOARD_POS = { x: 740, y: 640 };
const OPPONENT_DECK_POS = { x: 1310, y: 233 };
const OPPONENT_GRAVEYARD_POS = { x: 1430, y: 233 };
const OPPONENT_HAND_POS = { x: 836, y: 40 };
const OPPONENT_BOARD_POS = { x: 740, y: 233 };

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
  | { kind: "break"; instanceId: string; needsTarget: boolean }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; needsTarget: boolean };

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  /** Origine (viewport) du glisser-déposer en cours (main ou unité de plateau) — alimente `DragTargetingTrail`. */
  const [dragAnchor, setDragAnchor] = useState<{ x: number; y: number } | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [dragOverOpponentBoard, setDragOverOpponentBoard] = useState(false);
  const [dragOverGraveyard, setDragOverGraveyard] = useState(false);
  const [graveyardViewerPlayerId, setGraveyardViewerPlayerId] = useState<PlayerId | null>(null);
  const [detailInstance, setDetailInstance] = useState<CardInstance | null>(null);

  const me = state.players.find((p) => p.id === myUserId)!;
  const opponent = state.players.find((p) => p.id !== myUserId)!;
  const myShip = getShipDefinition(me.shipId);
  const opponentShip = getShipDefinition(opponent.shipId);
  const isMyTurn = state.activePlayerId === myUserId;
  const canRespondToReaction = state.pendingReaction?.awaitingPlayerId === myUserId;
  const canPlay = isMyTurn && !pending && !state.pendingReaction;
  const canPlayCards = canPlay && state.phase === "mainPhase";
  const canAttack = canPlay && state.phase === "combatPhase";
  const myReactionCandidates = canRespondToReaction
    ? eligibleCandidatesFor(state, state.pendingReaction!.events, myUserId, state.pendingReaction!.turnNumber, state.pendingReaction!.usedCandidateKeys)
    : [];

  const bannerEvent = usePhaseBannerEvent(state);
  const actionToasts = useActionToasts(state);
  const cardFlights = useCardFlights(state);

  function getFlightCoords(flight: CardFlight) {
    const isMine = flight.playerId === myUserId;
    if (flight.kind === "draw") {
      return isMine ? { from: OWN_DECK_POS, to: OWN_HAND_POS } : { from: OPPONENT_DECK_POS, to: OPPONENT_HAND_POS };
    }
    if (flight.kind === "play") {
      return isMine ? { from: OWN_HAND_POS, to: OWN_BOARD_POS } : { from: OPPONENT_HAND_POS, to: OPPONENT_BOARD_POS };
    }
    return isMine
      ? { from: OWN_BOARD_POS, to: OWN_GRAVEYARD_POS }
      : { from: OPPONENT_BOARD_POS, to: OPPONENT_GRAVEYARD_POS };
  }

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

  function activateMyReaction(sourceInstanceId: string, abilityIndex: number, needsTarget: boolean) {
    if (needsTarget) {
      setSelection({ kind: "reaction", sourceInstanceId, abilityIndex, needsTarget: true });
    } else {
      act({ type: "activateReaction", playerId: myUserId, sourceInstanceId, abilityIndex });
    }
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
    if (selection?.kind === "reaction" && selection.needsTarget) {
      act({
        type: "activateReaction",
        playerId: myUserId,
        sourceInstanceId: selection.sourceInstanceId,
        abilityIndex: selection.abilityIndex,
        targetInstanceId: instanceId,
      });
      return;
    }
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

  // --- Glisser-déposer depuis la main (cf. MatchBoard, même logique) -----
  function handleHandDragStart(e: React.DragEvent, instanceId: string) {
    if (!canPlayCards) return;
    e.dataTransfer.setData(DRAG_MIME_HAND, instanceId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(instanceId);
    // Le suivi pointillé n'a de sens que pour CHOISIR une cible (effet ciblé) — une simple pose sur le
    // plateau n'a pas de cible, la carte tombe sur le premier Slot libre quel que soit l'endroit du dépôt.
    const card = me.hand.find((c) => c.instanceId === instanceId);
    const needsTarget = card ? (getCardDefinition(card.cardId).onPlayEffects ?? []).some((e2) => e2.target.kind === "chosenUnit") : false;
    if (needsTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      setDragAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }
  }
  function handleHandDragEnd() {
    setDraggingId(null);
    setDragOverTargetId(null);
    setDragAnchor(null);
  }
  function handleOwnBoardDragOver(e: React.DragEvent) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function handleOwnBoardDrop(e: React.DragEvent) {
    e.preventDefault();
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
    const rect = e.currentTarget.getBoundingClientRect();
    setDragAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }
  function handleUnitDragEnd() {
    setDraggingUnitId(null);
    setDragOverTargetId(null);
    setDragOverOpponentBoard(false);
    setDragOverGraveyard(false);
    setDragAnchor(null);
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
  const hasHint = Boolean(error) || selection?.kind === "playCard" || selection?.kind === "break" || selection?.kind === "attack";

  return (
    <>
      <BoardStage>
        <BoardBackdrop variant="absolute" />

        {/* Main adverse — arc inversé, remontée pour ne pas cacher son plateau. `pointer-events-none` : purement
            décorative (dos de carte, jamais interactive), et sans ça ce conteneur pleine-largeur peut intercepter
            des glisser-déposer destinés au plateau juste en-dessous. */}
        <div
          className="pointer-events-none absolute flex items-start justify-center"
          style={{ left: 0, top: -70, width: 1672, height: 220 }}
        >
          <OpponentHandFan cards={opponent.hand} />
        </div>

        {/* Tour, nichée dans le cadre boussole en haut à droite */}
        <div className="absolute flex items-center justify-center" style={{ left: 1518, top: 272, width: 108 }}>
          <div className="text-center text-xl font-bold uppercase tracking-wide text-slate-100 [font-family:var(--font-card-title)] [text-shadow:0_1px_4px_rgba(0,0,0,0.95),0_0_8px_rgba(0,0,0,0.8)]">
            Tour {state.turnNumber}
          </div>
        </div>

        {/* Fil des événements — "pourquoi quelque chose vient de se produire" */}
        <div className="absolute" style={{ left: 1462, top: 350, width: 204, height: 170 }}>
          <EventFeed state={state} />
        </div>

        {/* Ligne de plateau adverse */}
        <div className="absolute" style={{ left: 0, top: 125, width: 230 }}>
          <ShipInstrumentCluster
            anchor={opponent.anchor}
            anchorMax={opponentShip.startingAnchor}
            reason={opponent.reason}
            reasonMax={opponent.reasonMax}
            width={230}
          />
        </div>
        <div
          onDragOver={handleOpponentBoardDragOver}
          onDragLeave={handleOpponentBoardDragLeave}
          onDrop={handleOpponentBoardDrop}
          className={`absolute flex items-center justify-center gap-2 rounded-md p-1 transition-colors ${
            dragOverOpponentBoard ? "bg-rose-500/10 ring-2 ring-rose-500/60" : ""
          }`}
          style={{ left: 235, top: 130, width: 1010, height: 205 }}
        >
          {opponent.board.map((unit) => (
            <div
              key={unit.instanceId}
              onDragOver={(e) => handleBoardTileDragOver(e, unit.instanceId)}
              onDragLeave={() => setDragOverTargetId((id) => (id === unit.instanceId ? null : id))}
              onDrop={(e) => handleBoardTileDrop(e, unit.instanceId)}
              className={dragOverTargetId === unit.instanceId ? "rounded-md ring-2 ring-board-accent" : ""}
            >
              <BoardCardTile
                instance={unit}
                tideState={state.environment.tideState}
                selected={selection?.kind === "attack"}
                onClick={() => handleAnyBoardCardClick(unit.instanceId, opponent.id)}
                onShowDetail={() => setDetailInstance(unit)}
              />
            </div>
          ))}
          {Array.from({ length: opponentEmptySlots }).map((_, i) => (
            <EmptySlot key={`opp-empty-${i}`} />
          ))}
        </div>
        <div className="absolute" style={{ left: 1250, top: 143, width: 240 }}>
          <CargoCluster
            deckCount={opponent.deck.length}
            graveyardCount={opponent.graveyard.length}
            width={240}
            onOpenGraveyard={() => setGraveyardViewerPlayerId(opponent.id)}
          />
        </div>

        {/* Bande centrale : tuile de sens de Marée (gauche), progression de la Marée (centre), interaction (droite) */}
        <div className="absolute" style={{ left: 40, top: 350, width: 150, height: 170 }}>
          <TideOrientationTile orientation={state.environment.tideOrientation} />
        </div>

        {/* Fenêtre de réaction ouverte, en attente de "moi" — priorité
            d'affichage sur tout le reste tant qu'elle reste ouverte. */}
        {canRespondToReaction && (
          <div
            className="absolute z-20 flex flex-col items-center gap-2 rounded-lg border-2 border-amber-400/80 bg-black/90 px-4 py-3 shadow-[0_0_25px_rgba(251,191,36,0.35)]"
            style={{ left: 336, top: 300, width: 1000 }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-300">Une carte peut réagir</span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {myReactionCandidates.map((candidate) => {
                const def = getCardDefinition(candidate.cardId);
                const ability = def.abilities?.[candidate.abilityIndex];
                return (
                  <Button
                    key={`${candidate.sourceInstanceId}:${candidate.abilityIndex}`}
                    variant="secondary"
                    onClick={() => activateMyReaction(candidate.sourceInstanceId, candidate.abilityIndex, candidate.needsTarget)}
                    title={ability?.description ?? def.text}
                  >
                    {def.name}
                    {candidate.reasonCost > 0 ? ` (${candidate.reasonCost} Raison)` : ""}
                  </Button>
                );
              })}
              <Button variant="secondary" onClick={() => act({ type: "passReaction", playerId: myUserId })}>
                Passer
              </Button>
            </div>
            {selection?.kind === "reaction" && selection.needsTarget && (
              <span className="text-xs text-slate-300">Choisissez une cible sur le plateau.</span>
            )}
          </div>
        )}

        <div
          className="absolute flex flex-col items-center justify-center gap-2 text-center"
          style={{ left: 290, top: 340, width: 930, height: 190 }}
        >
          <TideProgressBar tideState={state.environment.tideState} tideRemainingTurns={state.environment.tideRemainingTurns} />
          {hasHint && (
            <p
              className={`max-w-md rounded-md px-3 py-1 text-xs ${
                error ? "border border-rose-800 bg-rose-950/70 text-rose-300" : "bg-black/50 text-slate-300"
              }`}
            >
              {error
                ? error
                : selection?.kind === "playCard"
                  ? "Choisissez une cible sur le plateau."
                  : selection?.kind === "break"
                    ? "Choisissez une cible pour l'effet de bris."
                    : "Choisissez une cible adverse, ou attaquez le Navire directement."}
            </p>
          )}
        </div>

        <div className="absolute flex flex-col items-center gap-2" style={{ left: 1473, top: 555, width: 182 }}>
          <PhaseActionButton
            isMyTurn={isMyTurn && !pending}
            phase={state.phase}
            onAdvancePhase={() => act({ type: "advancePhase", playerId: myUserId })}
            onEndTurn={() => act({ type: "endTurn", playerId: myUserId })}
            size={120}
          />
          {selection && isMyTurn && (
            <Button variant="secondary" onClick={clearSelection}>
              Annuler
            </Button>
          )}
        </div>

        {/* Ligne de plateau du viewer */}
        <div className="absolute" style={{ left: 0, top: 530, width: 230 }}>
          <ShipInstrumentCluster
            anchor={me.anchor}
            anchorMax={myShip.startingAnchor}
            reason={me.reason}
            reasonMax={me.reasonMax}
            width={230}
          />
        </div>
        <div
          onDragOver={handleOwnBoardDragOver}
          onDrop={handleOwnBoardDrop}
          className="absolute flex items-center justify-center gap-2 rounded-md p-1"
          style={{ left: 235, top: 538, width: 1010, height: 205 }}
        >
          {me.board.map((unit) => (
            <div
              key={unit.instanceId}
              // Seuls Marins/Créatures peuvent attaquer (et donc être "glissés" en Phase de combat) —
              // Structure/Objet/Équipement se Sabordent via le bouton dédié, pas le glisser-déposer.
              // Une unité Engourdie (maladie d'invocation) ne peut pas encore attaquer, et une unité
              // Silencée ne peut pas utiliser d'effet (y compris Sabordage) — ni l'une ni l'autre n'a
              // donc de raison d'être glissée.
              draggable={
                canPlay &&
                isUnitType(getCardDefinition(unit.cardId).type) &&
                !unit.summoningSick &&
                !unit.statuses?.includes(STATUS_SILENCE)
              }
              onDragStart={(e) => handleUnitDragStart(e, unit.instanceId)}
              onDragEnd={handleUnitDragEnd}
              onDragOver={(e) => handleBoardTileDragOver(e, unit.instanceId)}
              onDragLeave={() => setDragOverTargetId((id) => (id === unit.instanceId ? null : id))}
              onDrop={(e) => handleBoardTileDrop(e, unit.instanceId)}
              className={`rounded-xl transition-shadow ${dragOverTargetId === unit.instanceId ? "ring-2 ring-board-accent" : ""} ${
                draggingUnitId === unit.instanceId
                  ? "opacity-50 shadow-[0_0_25px_6px_rgba(125,211,252,0.65)]"
                  : ""
              } ${myReactionCandidates.some((c) => c.sourceInstanceId === unit.instanceId) ? "animate-reaction-pulse" : ""}`}
            >
              <BoardCardTile
                instance={unit}
                tideState={state.environment.tideState}
                selected={selectedBoardId === unit.instanceId || selection?.kind === "attack"}
                onClick={() => handleAnyBoardCardClick(unit.instanceId, me.id)}
                onShowDetail={() => setDetailInstance(unit)}
              />
            </div>
          ))}
          {Array.from({ length: myEmptySlots }).map((_, i) => (
            <EmptySlot key={`own-empty-${i}`} />
          ))}
        </div>
        <div className="absolute" style={{ left: 1250, top: 550, width: 240 }}>
          <CargoCluster
            deckCount={me.deck.length}
            graveyardCount={me.graveyard.length}
            width={240}
            graveyardDropZone={{
              isOver: dragOverGraveyard,
              onDragOver: handleGraveyardDragOver,
              onDragLeave: handleGraveyardDragLeave,
              onDrop: handleGraveyardDrop,
            }}
            onOpenGraveyard={() => setGraveyardViewerPlayerId(me.id)}
          />
        </div>

        {selectedUnit && selectedDef && !selection && isMyTurn && (
          <div
            className="absolute flex flex-wrap items-center justify-center gap-2 rounded-md border border-board-accent/40 bg-black/70 px-3 py-2"
            style={{ left: 336, top: 706, width: 1000 }}
          >
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
            {state.phase === "combatPhase" &&
              !(isUnitType(selectedDef.type) && !selectedUnit.summoningSick && !selectedUnit.hasAttackedThisTurn) && (
                <span className="text-xs text-slate-500">
                  Aucune action disponible en Phase de combat pour cette carte.
                </span>
              )}
          </div>
        )}

        {/* Main du viewer — centrée en bas de l'écran, en éventail. `pointer-events-none` sur ce conteneur
            pleine-largeur (chaque carte se réactive individuellement, `HandFan`) : sinon la zone vide entre les
            cartes peut intercepter des glisser-déposer destinés au plateau juste au-dessus. */}
        <div className="pointer-events-none absolute flex items-end justify-center" style={{ left: 0, top: 775, width: 1672, height: 195 }}>
          <HandFan
            cards={me.hand}
            tideState={state.environment.tideState}
            selectedInstanceId={selection?.kind === "playCard" ? selection.instanceId : undefined}
            disabled={!canPlayCards}
            draggable={canPlayCards}
            draggingId={draggingId}
            onDragStart={handleHandDragStart}
            onDragEnd={handleHandDragEnd}
            onClick={handleHandCardClick}
          />
          {me.hand.length === 0 && <p className="text-xs text-slate-600">Main vide.</p>}
        </div>

        {/* Info du viewer, en bas à droite */}
        <div
          className={`absolute truncate rounded-md border px-2 py-1 text-[11px] ${
            isMyTurn ? "border-board-accent/50 bg-board-accent/10 text-slate-100" : "border-slate-700/70 bg-black/60 text-slate-200"
          }`}
          style={{ left: 1462, top: 906, width: 204 }}
        >
          Toi{isMyTurn ? " (à toi)" : ""}
          <span className="ml-1 text-slate-500">· {me.hand.length} carte(s)</span>
        </div>
        <CardFlightLayer flights={cardFlights} getCoords={getFlightCoords} />
      </BoardStage>

      <DragTargetingTrail anchor={dragAnchor} />
      <ActionToastStack toasts={actionToasts} />
      <PhaseBanner text={bannerText} bannerKey={bannerEvent?.id ?? null} />
      {graveyardViewerPlayerId && (
        <GraveyardViewer
          playerLabel={graveyardViewerPlayerId === myUserId ? "Toi" : "Adversaire"}
          cards={state.players.find((p) => p.id === graveyardViewerPlayerId)!.graveyard}
          onClose={() => setGraveyardViewerPlayerId(null)}
        />
      )}
      {detailInstance && (
        <CardDetailModal
          instance={detailInstance}
          tideState={state.environment.tideState}
          onClose={() => setDetailInstance(null)}
        />
      )}
    </>
  );
}

/** Emplacement de Slot inoccupé — rend visible le nombre total de Slots qu'autorise le Navire (4/5/6), pas seulement les permanents déjà posés. */
/**
 * Surbrillance individuelle au survol d'un glisser-déposer (au lieu du
 * plateau entier auparavant) : le joueur voit précisément quels
 * emplacements libres accepteraient la carte. `onDragOver` sans
 * `preventDefault` propre à ce Slot — la propagation vers le conteneur
 * parent (qui l'appelle déjà) suffit à valider la cible de dépôt.
 */
function EmptySlot() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      aria-hidden
      onDragEnter={() => setHovered(true)}
      onDragLeave={() => setHovered(false)}
      onDrop={() => setHovered(false)}
      className={`aspect-[5/7] w-28 rounded-xl border-[3px] border-dashed transition-colors ${
        hovered ? "border-board-accent bg-board-accent/15" : "border-slate-500/50"
      }`}
    />
  );
}
