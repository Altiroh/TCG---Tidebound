"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [dragOverOwnBoard, setDragOverOwnBoard] = useState(false);
  const [dragOverOtherBoard, setDragOverOtherBoard] = useState(false);
  const [dragOverGraveyard, setDragOverGraveyard] = useState(false);

  const activePlayerId = state.activePlayerId;
  const humanPlayerId = botPlayerId ? state.players.find((p) => p.id !== botPlayerId)!.id : null;
  const viewerPlayerId = humanPlayerId ?? activePlayerId;
  const viewerPlayer = state.players.find((p) => p.id === viewerPlayerId)!;
  const otherPlayer = state.players.find((p) => p.id !== viewerPlayerId)!;
  const viewerShip = getShipDefinition(viewerPlayer.shipId);
  const otherShip = getShipDefinition(otherPlayer.shipId);
  const isViewerTurn = activePlayerId === viewerPlayerId;
  const canPlayCards = isViewerTurn && state.phase === "mainPhase" && !viewerPlayer.hasUsedMainActionThisTurn;

  const recentEvents = useMemo(() => state.eventLog.slice(-10).reverse(), [state.eventLog]);
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

  function showPreview(e: React.MouseEvent, cardId: string) {
    setHoverPreview({ cardId, rect: e.currentTarget.getBoundingClientRect() });
  }
  function hidePreview() {
    setHoverPreview(null);
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
    hidePreview();
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

  return (
    <>
      <BoardBackdrop />
      <PhaseBanner text={bannerText} bannerKey={bannerEvent?.id ?? null} />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4">
        {/* Adversaire (bot ou autre joueur en hot-seat) */}
        <PlayerSummary
          label={
            otherPlayer.id === botPlayerId
              ? `Bot — ${otherShip.name}`
              : `Joueur ${otherPlayer.id === "p1" ? "1" : "2"} — ${otherShip.name}`
          }
          handCount={otherPlayer.hand.length}
        />
        <div className="flex flex-wrap gap-2">
          {otherPlayer.hand.map((card) => (
            <CardBack key={card.instanceId} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ShipInstrumentCluster
            anchor={otherPlayer.anchor}
            anchorMax={otherShip.startingAnchor}
            reason={otherPlayer.reason}
            reasonMax={otherPlayer.reasonMax}
          />
          <div
            onDragOver={handleOtherBoardDragOver}
            onDragLeave={handleOtherBoardDragLeave}
            onDrop={handleOtherBoardDrop}
            className={`flex flex-1 flex-wrap gap-2 rounded-md p-1 transition-colors ${
              dragOverOtherBoard ? "bg-rose-500/10 ring-2 ring-rose-500/60" : ""
            }`}
          >
            {otherPlayer.board.map((unit) => (
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
                  selected={pending?.kind === "attack"}
                  onClick={() => handleAnyBoardCardClick(unit.instanceId, otherPlayer.id)}
                />
              </div>
            ))}
            {Array.from({ length: otherEmptySlots }).map((_, i) => (
              <EmptySlot key={`other-empty-${i}`} />
            ))}
          </div>
          <CargoCluster deckCount={otherPlayer.deck.length} graveyardCount={otherPlayer.graveyard.length} />
        </div>

        {/* Environnement */}
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
            {pending && isViewerTurn && (
              <Button variant="secondary" onClick={clearSelection}>
                Annuler
              </Button>
            )}
            <PhaseActionButton
              isMyTurn={isViewerTurn}
              phase={state.phase}
              onAdvancePhase={() => runAction({ type: "advancePhase", playerId: activePlayerId })}
              onEndTurn={() => runAction({ type: "endTurn", playerId: activePlayerId })}
              size={56}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-rose-800 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}
        {pending?.kind === "playCard" && (
          <p className="text-xs text-slate-400">Choisissez une cible sur le plateau (à vous ou adverse).</p>
        )}
        {pending?.kind === "break" && (
          <p className="text-xs text-slate-400">Choisissez une cible pour l&apos;effet de bris.</p>
        )}
        {pending?.kind === "attack" && (
          <p className="text-xs text-slate-400">Choisissez une cible adverse, ou attaquez le Navire directement.</p>
        )}

        {/* Mon plateau */}
        <div className="flex items-center gap-2">
          <ShipInstrumentCluster
            anchor={viewerPlayer.anchor}
            anchorMax={viewerShip.startingAnchor}
            reason={viewerPlayer.reason}
            reasonMax={viewerPlayer.reasonMax}
          />
          <div
            onDragOver={handleOwnBoardDragOver}
            onDragLeave={handleOwnBoardDragLeave}
            onDrop={handleOwnBoardDrop}
            className={`flex flex-1 flex-wrap gap-2 rounded-md p-1 transition-colors ${
              dragOverOwnBoard ? "bg-board-accent/10 ring-2 ring-board-accent/60" : ""
            }`}
          >
            {viewerPlayer.board.map((unit) => (
              <div
                key={unit.instanceId}
                draggable={isViewerTurn}
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
                  selected={selectedBoardId === unit.instanceId || pending?.kind === "attack"}
                  onClick={() => handleAnyBoardCardClick(unit.instanceId, viewerPlayer.id)}
                />
              </div>
            ))}
            {Array.from({ length: ownEmptySlots }).map((_, i) => (
              <EmptySlot key={`own-empty-${i}`} />
            ))}
          </div>
          <CargoCluster
            deckCount={viewerPlayer.deck.length}
            graveyardCount={viewerPlayer.graveyard.length}
            graveyardDropZone={{
              isOver: dragOverGraveyard,
              onDragOver: handleGraveyardDragOver,
              onDragLeave: handleGraveyardDragLeave,
              onDrop: handleGraveyardDrop,
            }}
          />
        </div>

        {selectedUnit && selectedDef && !pending && isViewerTurn && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-board-accent/40 bg-board-accent/5 px-3 py-2">
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
            {state.phase === "mainPhase" && !viewerPlayer.hasUsedMainActionThisTurn && (
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
            {!(
              (state.phase === "combatPhase" &&
                isUnitType(selectedDef.type) &&
                !selectedUnit.summoningSick &&
                !selectedUnit.hasAttackedThisTurn) ||
              (state.phase === "mainPhase" && !viewerPlayer.hasUsedMainActionThisTurn)
            ) && (
              <span className="text-xs text-slate-500">
                {state.phase === "combatPhase"
                  ? "Aucune action disponible en Phase de combat pour cette carte."
                  : "Action principale déjà utilisée ce tour-ci."}
              </span>
            )}
          </div>
        )}

        <PlayerSummary
          label={`Joueur ${viewerPlayer.id === "p1" ? "1" : "2"} — ${viewerShip.name}${
            isViewerTurn ? " (à vous de jouer)" : ""
          }`}
          handCount={viewerPlayer.hand.length}
          highlighted
        />
        <div className="flex flex-wrap gap-2">
          {viewerPlayer.hand.map((card) => (
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
                selected={pending?.kind === "playCard" && pending.instanceId === card.instanceId}
                disabled={!canPlayCards}
                onClick={() => handleHandCardClick(card.instanceId)}
              />
            </div>
          ))}
          {viewerPlayer.hand.length === 0 && <p className="text-xs text-slate-600">Main vide.</p>}
        </div>

        {/* Journal */}
        <details className="rounded-md border border-slate-800 bg-board-surface/50 px-3 py-2 text-xs text-slate-400">
          <summary className="cursor-pointer select-none text-slate-300">Journal de la partie</summary>
          <ul className="mt-2 space-y-1">
            {recentEvents.map((event, i) => (
              <li key={i}>{formatEvent(state, event)}</li>
            ))}
          </ul>
        </details>

        <Button variant="secondary" className="self-start" onClick={onExit}>
          Abandonner la partie
        </Button>

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
