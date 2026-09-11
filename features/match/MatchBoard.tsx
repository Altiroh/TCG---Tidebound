"use client";

import { useEffect, useState } from "react";
import {
  dispatch,
  getCardDefinition,
  getShipDefinition,
  runBotTurn,
  UNIT_CARD_TYPES,
  type BotDifficulty,
  type CardInstance,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { Button } from "@/components/ui/Button";
import { BoardBackdrop } from "@/features/match/BoardBackdrop";
import { BoardStage } from "@/features/match/BoardStage";
import { CardBack } from "@/features/match/CardBack";
import { CargoCluster } from "@/features/match/CargoCluster";
import { GraveyardViewer } from "@/features/match/GraveyardViewer";
import { HandFan } from "@/features/match/HandFan";
import { HoverLiftTile } from "@/features/match/HoverLiftTile";
import { PhaseActionButton } from "@/features/match/PhaseActionButton";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { ShipInstrumentCluster } from "@/features/match/ShipInstrumentCluster";
import { TideOrientationTile } from "@/features/match/TideOrientationTile";
import { TIDE_STATE_COLORS, TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { usePhaseBannerEvent } from "@/features/match/usePhaseBannerEvent";

interface MatchBoardProps {
  initialState: GameState;
  onExit: () => void;
  /** Si défini, ce joueur est joué automatiquement par le bot (`runBotTurn`) plutôt qu'en hot-seat. */
  botPlayerId?: PlayerId;
  botDifficulty?: BotDifficulty;
}

type Pending =
  | { kind: "playCard"; instanceId: string; needsTarget: boolean }
  | { kind: "attack"; attackerId: string }
  | { kind: "break"; instanceId: string; needsTarget: boolean };

function isUnitType(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

/** Instance de MAIN en cours de glissement, décodée depuis `DataTransfer` au drop. */
const DRAG_MIME_HAND = "application/x-tidebound-card-instance";
/** Unité de PLATEAU (à soi) en cours de glissement — vers une cible (attaque) ou vers le cimetière (Sabordage). */
const DRAG_MIME_UNIT = "application/x-tidebound-board-unit";

/**
 * Plateau d'une partie locale (hot-seat ou contre un bot).
 *
 * "Perspective du viewer" : en hot-seat pur (`botPlayerId` absent), le bas
 * de l'écran suit le joueur actif (on se passe l'appareil) — comportement
 * historique, inchangé. Contre un bot, le joueur humain reste TOUJOURS en
 * bas, même pendant le tour du bot : l'écran ne doit pas se réorganiser
 * pendant que l'adversaire joue.
 */
export function MatchBoard({ initialState, onExit, botPlayerId, botDifficulty }: MatchBoardProps) {
  const [state, setState] = useState<GameState>(initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [dragOverOwnBoard, setDragOverOwnBoard] = useState(false);
  const [dragOverOtherBoard, setDragOverOtherBoard] = useState(false);
  const [dragOverGraveyard, setDragOverGraveyard] = useState(false);
  const [graveyardViewerPlayerId, setGraveyardViewerPlayerId] = useState<PlayerId | null>(null);

  const activePlayerId = state.activePlayerId;
  const humanPlayerId = botPlayerId ? state.players.find((p) => p.id !== botPlayerId)!.id : null;
  const viewerPlayerId = humanPlayerId ?? activePlayerId;
  const viewerPlayer = state.players.find((p) => p.id === viewerPlayerId)!;
  const otherPlayer = state.players.find((p) => p.id !== viewerPlayerId)!;
  const viewerShip = getShipDefinition(viewerPlayer.shipId);
  const otherShip = getShipDefinition(otherPlayer.shipId);
  const isViewerTurn = activePlayerId === viewerPlayerId;
  const canPlayCards = isViewerTurn && state.phase === "mainPhase";

  const bannerEvent = usePhaseBannerEvent(state);

  function playerLabel(id: PlayerId): string {
    if (id === botPlayerId) return "du Bot";
    return id === "p1" ? "du Joueur 1" : "du Joueur 2";
  }
  const bannerText = bannerEvent
    ? bannerEvent.kind === "combatPhase"
      ? "Phase de combat"
      : `Tour ${playerLabel(bannerEvent.playerId)}`
    : null;

  // Joue automatiquement le tour du bot dès qu'il devient actif. Un léger
  // délai laisse le temps de voir l'état précédent (et évite un
  // enchaînement instantané qui donnerait l'impression d'un bug plutôt
  // que d'un adversaire qui "réfléchit").
  useEffect(() => {
    if (activePlayerId !== botPlayerId || state.status !== "active" || !botDifficulty) return;
    const timer = setTimeout(() => {
      setState((current) => {
        if (current.status !== "active" || current.activePlayerId !== botPlayerId) return current;
        return runBotTurn(current, botPlayerId, botDifficulty);
      });
      setPending(null);
      setSelectedBoardId(null);
      setError(null);
    }, 700);
    return () => clearTimeout(timer);
  }, [activePlayerId, state.status, botPlayerId, botDifficulty]);

  // Abandonner la partie via ÉCHAP plutôt qu'un bouton visible en permanence
  // à l'écran — libère l'espace pour le board pleine page.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onExit();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  function clearSelection() {
    setPending(null);
    setSelectedBoardId(null);
  }

  function runAction(action: PlayerAction) {
    if (!isViewerTurn) return;
    const result = dispatch(state, action);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setState(result.state);
    clearSelection();
  }

  function handleHandCardClick(instanceId: string) {
    if (!canPlayCards) return;
    const card = viewerPlayer.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    const def = getCardDefinition(card.cardId);
    const needsTarget = (def.onPlayEffects ?? []).some((e) => e.target.kind === "chosenUnit");
    setError(null);
    if (needsTarget) {
      setSelectedBoardId(null);
      setPending({ kind: "playCard", instanceId, needsTarget: true });
    } else {
      runAction({ type: "playCard", playerId: activePlayerId, instanceId });
    }
  }

  function handleOwnBoardCardClick(instanceId: string) {
    if (!isViewerTurn) return;
    if (pending?.kind === "attack") {
      // Un clic sur son propre plateau pendant une sélection de cible d'attaque : annule.
      setPending(null);
      return;
    }
    setSelectedBoardId((current) => (current === instanceId ? null : instanceId));
  }

  function handleAnyBoardCardClick(instanceId: string, ownerId: PlayerId) {
    if (pending?.kind === "playCard" && pending.needsTarget) {
      runAction({
        type: "playCard",
        playerId: activePlayerId,
        instanceId: pending.instanceId,
        targetInstanceId: instanceId,
      });
      return;
    }
    if (pending?.kind === "break" && pending.needsTarget) {
      runAction({ type: "breakObject", playerId: activePlayerId, instanceId: pending.instanceId, targetInstanceId: instanceId });
      return;
    }
    if (pending?.kind === "attack") {
      if (ownerId === viewerPlayerId) return; // géré par handleOwnBoardCardClick
      runAction({
        type: "attack",
        playerId: activePlayerId,
        attackerInstanceId: pending.attackerId,
        defenderInstanceId: instanceId,
      });
      return;
    }
    if (ownerId === viewerPlayerId) handleOwnBoardCardClick(instanceId);
  }

  function startBreak(unit: CardInstance) {
    if (!isViewerTurn) return;
    const def = getCardDefinition(unit.cardId);
    const needsTarget = (def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit");
    if (needsTarget) {
      setPending({ kind: "break", instanceId: unit.instanceId, needsTarget: true });
    } else {
      runAction({ type: "breakObject", playerId: activePlayerId, instanceId: unit.instanceId });
    }
  }

  // --- Glisser-déposer depuis la main -------------------------------------
  // Ajouté EN PLUS du clic (jamais à sa place) : le clic reste le parcours
  // principal, notamment tant que le support tactile du drag HTML5 natif
  // reste inégal sur mobile.
  function handleHandDragStart(e: React.DragEvent, instanceId: string) {
    if (!canPlayCards) return;
    e.dataTransfer.setData(DRAG_MIME_HAND, instanceId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(instanceId);
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

  // --- Glisser-déposer une unité de plateau : attaquer ou Saborder --------
  // Une seule source de glissement pour les deux usages (le geste "prendre
  // l'unité" est le même) — c'est la CIBLE du dépôt qui décide de l'action
  // (adversaire = attaque, cimetière = Sabordage) ; `dispatch` refuse
  // silencieusement toute combinaison illégale (mauvaise Phase, etc.).
  function handleUnitDragStart(e: React.DragEvent, instanceId: string) {
    if (!isViewerTurn) return;
    e.dataTransfer.setData(DRAG_MIME_UNIT, instanceId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingUnitId(instanceId);
  }
  function handleUnitDragEnd() {
    setDraggingUnitId(null);
    setDragOverTargetId(null);
    setDragOverOtherBoard(false);
    setDragOverGraveyard(false);
  }
  function handleOtherBoardDragOver(e: React.DragEvent) {
    if (!draggingUnitId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverOtherBoard(true);
  }
  function handleOtherBoardDragLeave() {
    setDragOverOtherBoard(false);
  }
  function handleOtherBoardDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverOtherBoard(false);
    const instanceId = e.dataTransfer.getData(DRAG_MIME_UNIT);
    setDraggingUnitId(null);
    if (instanceId) runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId: instanceId });
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
    if (instanceId) runAction({ type: "saborder", playerId: activePlayerId, instanceId });
  }

  /** Déposer directement SUR un permanent (à soi ou adverse) résout la cible en un seul geste, sans étape intermédiaire — carte de main (effet ciblé) ou unité de plateau (attaque). */
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
    setDragOverOtherBoard(false);

    const draggedUnitId = e.dataTransfer.getData(DRAG_MIME_UNIT);
    if (draggedUnitId) {
      setDraggingUnitId(null);
      const draggedUnit = viewerPlayer.board.find((u) => u.instanceId === draggedUnitId);
      const draggedDef = draggedUnit ? getCardDefinition(draggedUnit.cardId) : undefined;
      // Un Objet glissé sur une cible sert à résoudre son effet de bris ciblé
      // (ex: "Levier de Lest" : Sabordez une Structure) — seuls les Marins/
      // Créatures glissés sur une cible attaquent.
      if (draggedDef?.type === "objet") {
        runAction({ type: "breakObject", playerId: activePlayerId, instanceId: draggedUnitId, targetInstanceId });
      } else {
        runAction({
          type: "attack",
          playerId: activePlayerId,
          attackerInstanceId: draggedUnitId,
          defenderInstanceId: targetInstanceId,
        });
      }
      return;
    }

    const instanceId = e.dataTransfer.getData(DRAG_MIME_HAND);
    setDraggingId(null);
    if (!instanceId) return;
    const card = viewerPlayer.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    const def = getCardDefinition(card.cardId);
    const needsTarget = (def.onPlayEffects ?? []).some((e2) => e2.target.kind === "chosenUnit");
    setError(null);
    if (needsTarget) {
      runAction({ type: "playCard", playerId: activePlayerId, instanceId, targetInstanceId });
    } else {
      runAction({ type: "playCard", playerId: activePlayerId, instanceId });
    }
  }

  if (state.status === "finished") {
    return (
      <>
        <BoardBackdrop />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
          <h1 className="text-3xl font-bold">
            {state.winnerId
              ? `${state.winnerId === botPlayerId ? "Le bot" : state.winnerId === "p1" ? "Joueur 1" : "Joueur 2"} l'emporte`
              : "Match nul"}
          </h1>
          <p className="text-slate-400">La mer a tranché.</p>
          <Button onClick={onExit}>Nouvelle partie</Button>
        </div>
      </>
    );
  }

  const selectedUnit = selectedBoardId ? viewerPlayer.board.find((u) => u.instanceId === selectedBoardId) : undefined;
  const selectedDef = selectedUnit ? getCardDefinition(selectedUnit.cardId) : undefined;
  const ownEmptySlots = Math.max(0, viewerShip.slotCount - viewerPlayer.board.length);
  const otherEmptySlots = Math.max(0, otherShip.slotCount - otherPlayer.board.length);
  const hasHint = Boolean(error) || pending?.kind === "playCard" || pending?.kind === "break" || pending?.kind === "attack";

  return (
    <>
      <BoardStage>
        <BoardBackdrop variant="absolute" />

        {/* Main adverse — centrée en haut, au-dessus de la ligne de plateau adverse */}
        <div className="absolute flex items-start justify-center gap-2" style={{ left: 0, top: 8, width: 1672, height: 108 }}>
          {otherPlayer.hand.map((card) => (
            <CardBack key={card.instanceId} widthClassName="w-16" />
          ))}
        </div>

        {/* Tour + info adversaire, nichés dans le cadre boussole en haut à droite */}
        <div className="absolute flex flex-col items-stretch gap-1" style={{ left: 1518, top: 272, width: 108 }}>
          <div className="rounded border border-slate-700/70 bg-black/60 px-1 py-0.5 text-center text-[9px] text-slate-200">
            Tour <strong>{state.turnNumber}</strong>
          </div>
          <div className="truncate rounded border border-slate-700/70 bg-black/60 px-1 py-0.5 text-center text-[9px] text-slate-200">
            {otherPlayer.id === botPlayerId ? "Bot" : otherPlayer.id === "p1" ? "Joueur 1" : "Joueur 2"}
            <span className="ml-1 text-slate-500">· {otherPlayer.hand.length}</span>
          </div>
        </div>

        {/* Ligne de plateau adverse */}
        <div className="absolute" style={{ left: 0, top: 125, width: 230 }}>
          <ShipInstrumentCluster
            anchor={otherPlayer.anchor}
            anchorMax={otherShip.startingAnchor}
            reason={otherPlayer.reason}
            reasonMax={otherPlayer.reasonMax}
            width={230}
          />
        </div>
        <div
          onDragOver={handleOtherBoardDragOver}
          onDragLeave={handleOtherBoardDragLeave}
          onDrop={handleOtherBoardDrop}
          className={`absolute flex items-center justify-center gap-2 rounded-md p-1 transition-colors ${
            dragOverOtherBoard ? "bg-rose-500/10 ring-2 ring-rose-500/60" : ""
          }`}
          style={{ left: 235, top: 130, width: 1010, height: 205 }}
        >
          {otherPlayer.board.map((unit) => (
            <div
              key={unit.instanceId}
              onDragOver={(e) => handleBoardTileDragOver(e, unit.instanceId)}
              onDragLeave={() => setDragOverTargetId((id) => (id === unit.instanceId ? null : id))}
              onDrop={(e) => handleBoardTileDrop(e, unit.instanceId)}
              className={dragOverTargetId === unit.instanceId ? "rounded-md ring-2 ring-board-accent" : ""}
            >
              <HoverLiftTile
                instance={unit}
                tideState={state.environment.tideState}
                selected={pending?.kind === "attack"}
                onClick={() => handleAnyBoardCardClick(unit.instanceId, otherPlayer.id)}
              />
            </div>
          ))}
          {Array.from({ length: otherEmptySlots }).map((_, i) => (
            <EmptySlot key={`other-empty-${i}`} />
          ))}
        </div>
        <div className="absolute" style={{ left: 1250, top: 143, width: 240 }}>
          <CargoCluster
            deckCount={otherPlayer.deck.length}
            graveyardCount={otherPlayer.graveyard.length}
            width={240}
            onOpenGraveyard={() => setGraveyardViewerPlayerId(otherPlayer.id)}
          />
        </div>

        {/* Bande centrale : orientation de la Marée (gauche), état de la Marée (centre), interaction (droite) */}
        <div className="absolute" style={{ left: 8, top: 350, width: 214, height: 170 }}>
          <TideOrientationTile orientation={state.environment.tideOrientation} />
        </div>

        <div
          className="absolute flex flex-col items-center justify-center gap-2 text-center"
          style={{ left: 230, top: 340, width: 1020, height: 190 }}
        >
          <span className="text-sm">
            Marée :{" "}
            <strong className={TIDE_STATE_COLORS[state.environment.tideState]}>
              {TIDE_STATE_LABELS[state.environment.tideState]}
            </strong>{" "}
            ({state.environment.tideRemainingTurns} tour(s))
          </span>
          {hasHint && (
            <p
              className={`max-w-md rounded-md px-3 py-1 text-xs ${
                error ? "border border-rose-800 bg-rose-950/70 text-rose-300" : "bg-black/50 text-slate-300"
              }`}
            >
              {error
                ? error
                : pending?.kind === "playCard"
                  ? "Choisissez une cible sur le plateau (à vous ou adverse)."
                  : pending?.kind === "break"
                    ? "Choisissez une cible pour l'effet de bris."
                    : "Choisissez une cible adverse, ou attaquez le Navire directement."}
            </p>
          )}
        </div>

        <div className="absolute flex flex-col items-center gap-2" style={{ left: 1473, top: 555, width: 182 }}>
          <PhaseActionButton
            isMyTurn={isViewerTurn}
            phase={state.phase}
            onAdvancePhase={() => runAction({ type: "advancePhase", playerId: activePlayerId })}
            onEndTurn={() => runAction({ type: "endTurn", playerId: activePlayerId })}
            size={90}
          />
          {pending && isViewerTurn && (
            <Button variant="secondary" onClick={clearSelection}>
              Annuler
            </Button>
          )}
        </div>

        {/* Ligne de plateau du viewer */}
        <div className="absolute" style={{ left: 0, top: 530, width: 230 }}>
          <ShipInstrumentCluster
            anchor={viewerPlayer.anchor}
            anchorMax={viewerShip.startingAnchor}
            reason={viewerPlayer.reason}
            reasonMax={viewerPlayer.reasonMax}
            width={230}
          />
        </div>
        <div
          onDragOver={handleOwnBoardDragOver}
          onDragLeave={handleOwnBoardDragLeave}
          onDrop={handleOwnBoardDrop}
          className={`absolute flex items-center justify-center gap-2 rounded-md p-1 transition-colors ${
            dragOverOwnBoard ? "bg-board-accent/10 ring-2 ring-board-accent/60" : ""
          }`}
          style={{ left: 235, top: 538, width: 1010, height: 205 }}
        >
          {viewerPlayer.board.map((unit) => (
            <div
              key={unit.instanceId}
              draggable={isViewerTurn}
              onDragStart={(e) => handleUnitDragStart(e, unit.instanceId)}
              onDragEnd={handleUnitDragEnd}
              onDragOver={(e) => handleBoardTileDragOver(e, unit.instanceId)}
              onDragLeave={() => setDragOverTargetId((id) => (id === unit.instanceId ? null : id))}
              onDrop={(e) => handleBoardTileDrop(e, unit.instanceId)}
              className={`${dragOverTargetId === unit.instanceId ? "rounded-md ring-2 ring-board-accent" : ""} ${
                draggingUnitId === unit.instanceId ? "opacity-40" : ""
              }`}
            >
              <HoverLiftTile
                instance={unit}
                tideState={state.environment.tideState}
                selected={selectedBoardId === unit.instanceId || pending?.kind === "attack"}
                onClick={() => handleAnyBoardCardClick(unit.instanceId, viewerPlayer.id)}
              />
            </div>
          ))}
          {Array.from({ length: ownEmptySlots }).map((_, i) => (
            <EmptySlot key={`own-empty-${i}`} />
          ))}
        </div>
        <div className="absolute" style={{ left: 1250, top: 550, width: 240 }}>
          <CargoCluster
            deckCount={viewerPlayer.deck.length}
            graveyardCount={viewerPlayer.graveyard.length}
            width={240}
            graveyardDropZone={{
              isOver: dragOverGraveyard,
              onDragOver: handleGraveyardDragOver,
              onDragLeave: handleGraveyardDragLeave,
              onDrop: handleGraveyardDrop,
            }}
            onOpenGraveyard={() => setGraveyardViewerPlayerId(viewerPlayer.id)}
          />
        </div>

        {selectedUnit && selectedDef && !pending && isViewerTurn && (
          <div
            className="absolute flex flex-wrap items-center justify-center gap-2 rounded-md border border-board-accent/40 bg-black/70 px-3 py-2"
            style={{ left: 336, top: 706, width: 1000 }}
          >
            <span className="text-xs text-slate-300">{selectedDef.name} :</span>
            {state.phase === "combatPhase" &&
              isUnitType(selectedDef.type) &&
              !selectedUnit.summoningSick &&
              !selectedUnit.hasAttackedThisTurn && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setPending({ kind: "attack", attackerId: selectedUnit.instanceId })}
                  >
                    Attaquer une cible
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      runAction({ type: "attack", playerId: activePlayerId, attackerInstanceId: selectedUnit.instanceId })
                    }
                  >
                    Attaquer le Navire adverse
                  </Button>
                </>
              )}
            {state.phase === "mainPhase" && (
              <>
                {selectedDef.type === "objet" && (
                  <Button variant="secondary" onClick={() => startBreak(selectedUnit)}>
                    Briser
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => runAction({ type: "saborder", playerId: activePlayerId, instanceId: selectedUnit.instanceId })}
                >
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

        {/* Main du viewer — centrée en bas de l'écran, en éventail */}
        <div className="absolute flex items-end justify-center" style={{ left: 0, top: 740, width: 1672, height: 195 }}>
          <HandFan
            cards={viewerPlayer.hand}
            tideState={state.environment.tideState}
            selectedInstanceId={pending?.kind === "playCard" ? pending.instanceId : undefined}
            disabled={!canPlayCards}
            draggable={canPlayCards}
            draggingId={draggingId}
            onDragStart={handleHandDragStart}
            onDragEnd={handleHandDragEnd}
            onClick={handleHandCardClick}
          />
          {viewerPlayer.hand.length === 0 && <p className="text-xs text-slate-600">Main vide.</p>}
        </div>

        {/* Info du viewer, en bas à droite */}
        <div
          className={`absolute truncate rounded-md border px-2 py-1 text-[11px] ${
            isViewerTurn ? "border-board-accent/50 bg-board-accent/10 text-slate-100" : "border-slate-700/70 bg-black/60 text-slate-200"
          }`}
          style={{ left: 1462, top: 906, width: 204 }}
        >
          Joueur {viewerPlayer.id === "p1" ? "1" : "2"} — {viewerShip.name}
          {isViewerTurn ? " (à vous)" : ""}
          <span className="ml-1 text-slate-500">· {viewerPlayer.hand.length} carte(s)</span>
        </div>
      </BoardStage>

      <PhaseBanner text={bannerText} bannerKey={bannerEvent?.id ?? null} />
      {graveyardViewerPlayerId && (
        <GraveyardViewer
          playerLabel={
            graveyardViewerPlayerId === botPlayerId
              ? "Bot"
              : graveyardViewerPlayerId === "p1"
                ? "Joueur 1"
                : "Joueur 2"
          }
          cards={state.players.find((p) => p.id === graveyardViewerPlayerId)!.graveyard}
          onClose={() => setGraveyardViewerPlayerId(null)}
        />
      )}
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
