"use client";

import { useEffect, useState } from "react";
import {
  dispatch,
  eligibleCandidatesFor,
  getCardDefinition,
  getShipDefinition,
  isVisibleDuringTide,
  stepBotTurn,
  STATUS_SILENCE,
  UNIT_CARD_TYPES,
  type BotDifficulty,
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

/** Pause entre deux actions du bot (`stepBotTurn`) — assez long pour voir chaque pioche/pose/Sabordage se jouer (animation de vol ~650ms) avant l'action suivante, sans donner l'impression d'attendre. */
const BOT_ACTION_DELAY_MS = 1100;

/** Centres approximatifs (repère `BoardStage`, 1672×941) des zones pioche/main/cimetière de chaque côté — repris des coordonnées déjà posées pour `CargoCluster`/les mains/le plateau, pour l'animation `CardFlightLayer`. */
const OWN_DECK_POS = { x: 1310, y: 640 };
const OWN_GRAVEYARD_POS = { x: 1430, y: 640 };
const OWN_HAND_POS = { x: 836, y: 872 };
const OWN_BOARD_POS = { x: 740, y: 640 };
const OPPONENT_DECK_POS = { x: 1310, y: 233 };
const OPPONENT_GRAVEYARD_POS = { x: 1430, y: 233 };
const OPPONENT_HAND_POS = { x: 836, y: 40 };
const OPPONENT_BOARD_POS = { x: 740, y: 233 };

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
  | { kind: "break"; instanceId: string; needsTarget: boolean }
  | { kind: "reaction"; sourceInstanceId: string; abilityIndex: number; needsTarget: boolean };

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
  /** Origine (viewport) du glisser-déposer en cours (main ou unité de plateau) — alimente `DragTargetingTrail`. */
  const [dragAnchor, setDragAnchor] = useState<{ x: number; y: number } | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [dragOverOtherBoard, setDragOverOtherBoard] = useState(false);
  const [dragOverGraveyard, setDragOverGraveyard] = useState(false);
  const [graveyardViewerPlayerId, setGraveyardViewerPlayerId] = useState<PlayerId | null>(null);
  const [detailInstance, setDetailInstance] = useState<CardInstance | null>(null);

  const activePlayerId = state.activePlayerId;
  const humanPlayerId = botPlayerId ? state.players.find((p) => p.id !== botPlayerId)!.id : null;
  // En hot-seat pur (pas de bot), l'écran suit qui doit agir MAINTENANT —
  // le joueur actif normalement, mais celui attendu par une fenêtre de
  // réaction si elle diffère (l'adversaire vient de jouer une carte
  // ouvrant une réaction pour l'autre joueur). Contre un bot, le joueur
  // humain reste toujours en bas, dans les deux cas.
  const respondingPlayerId = state.pendingReaction?.awaitingPlayerId ?? activePlayerId;
  const viewerPlayerId = humanPlayerId ?? respondingPlayerId;
  const viewerPlayer = state.players.find((p) => p.id === viewerPlayerId)!;
  const otherPlayer = state.players.find((p) => p.id !== viewerPlayerId)!;
  const viewerShip = getShipDefinition(viewerPlayer.shipId);
  const otherShip = getShipDefinition(otherPlayer.shipId);
  const isViewerTurn = activePlayerId === viewerPlayerId;
  const canPlayCards = isViewerTurn && state.phase === "mainPhase" && !state.pendingReaction;
  const myReactionCandidates = state.pendingReaction?.awaitingPlayerId === viewerPlayerId
    ? eligibleCandidatesFor(state, state.pendingReaction.events, viewerPlayerId, state.pendingReaction.turnNumber, state.pendingReaction.usedCandidateKeys)
    : [];

  const bannerEvent = usePhaseBannerEvent(state);
  const actionToasts = useActionToasts(state);
  const cardFlights = useCardFlights(state);

  function getFlightCoords(flight: CardFlight) {
    const isViewer = flight.playerId === viewerPlayerId;
    if (flight.kind === "draw") {
      return isViewer ? { from: OWN_DECK_POS, to: OWN_HAND_POS } : { from: OPPONENT_DECK_POS, to: OPPONENT_HAND_POS };
    }
    if (flight.kind === "play") {
      return isViewer ? { from: OWN_HAND_POS, to: OWN_BOARD_POS } : { from: OPPONENT_HAND_POS, to: OPPONENT_BOARD_POS };
    }
    return isViewer
      ? { from: OWN_BOARD_POS, to: OWN_GRAVEYARD_POS }
      : { from: OPPONENT_BOARD_POS, to: OPPONENT_GRAVEYARD_POS };
  }

  function playerLabel(id: PlayerId): string {
    if (id === botPlayerId) return "du Bot";
    return id === "p1" ? "du Joueur 1" : "du Joueur 2";
  }
  const bannerText = bannerEvent
    ? bannerEvent.kind === "combatPhase"
      ? "Phase de combat"
      : `Tour ${playerLabel(bannerEvent.playerId)}`
    : null;

  // Joue automatiquement le tour du bot dès qu'il devient actif, ET
  // chaque fois qu'une fenêtre de réaction l'attend — même hors de son
  // propre tour (l'humain vient de jouer une carte à laquelle le bot a
  // une réaction facultative éligible). UNE action à la fois
  // (`stepBotTurn`, pas `runBotTurn`), avec un délai entre chaque : le
  // tour entier appliqué d'un coup faisait "téléporter" les cartes du
  // bot directement à leur état final (une seule transition React, donc
  // aucune animation de pioche/pose/Sabordage n'avait de tour à jouer).
  const botAwaitingReaction = state.pendingReaction?.awaitingPlayerId === botPlayerId;
  useEffect(() => {
    if (state.status !== "active" || !botDifficulty) return;
    if (activePlayerId !== botPlayerId && !botAwaitingReaction) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    function tick(current: GameState) {
      if (cancelled) return;
      if (current.status !== "active" || !botPlayerId) return;
      const ownTurn = current.activePlayerId === botPlayerId;
      const ownReaction = current.pendingReaction?.awaitingPlayerId === botPlayerId;
      if (!ownTurn && !ownReaction) return;

      const step = stepBotTurn(current, botPlayerId, botDifficulty!);
      setState(step.state);
      setPending(null);
      setSelectedBoardId(null);
      setError(null);
      if (!step.done) {
        timer = setTimeout(() => tick(step.state), BOT_ACTION_DELAY_MS);
      }
    }

    timer = setTimeout(() => tick(state), BOT_ACTION_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `state` volontairement absent : ne doit réagir qu'aux transitions "c'est au bot d'agir", pas à chaque changement d'état (sinon la boucle se relancerait en double à chaque `setState` qu'elle déclenche elle-même) — `tick` capture l'état voulu via son propre paramètre plutôt que via la closure.
  }, [activePlayerId, botAwaitingReaction, state.status, botPlayerId, botDifficulty]);

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

  /**
   * Pendant une fenêtre de réaction, celui qui doit répondre n'est pas
   * forcément le joueur actif (`isViewerTurn`) — jamais garder ce garde-
   * fou ici : l'UI n'affiche les boutons Activer/Passer que si
   * `state.pendingReaction?.awaitingPlayerId === viewerPlayerId` de
   * toute façon.
   */
  function runReactionAction(action: PlayerAction) {
    const result = dispatch(state, action);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setState(result.state);
    clearSelection();
  }

  function activateMyReaction(sourceInstanceId: string, abilityIndex: number, needsTarget: boolean) {
    if (needsTarget) {
      setPending({ kind: "reaction", sourceInstanceId, abilityIndex, needsTarget: true });
    } else {
      runReactionAction({ type: "activateReaction", playerId: viewerPlayerId, sourceInstanceId, abilityIndex });
    }
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
    if (pending?.kind === "reaction" && pending.needsTarget) {
      runReactionAction({
        type: "activateReaction",
        playerId: viewerPlayerId,
        sourceInstanceId: pending.sourceInstanceId,
        abilityIndex: pending.abilityIndex,
        targetInstanceId: instanceId,
      });
      return;
    }
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
    // Le suivi pointillé n'a de sens que pour CHOISIR une cible (effet ciblé) — une simple pose sur le
    // plateau n'a pas de cible, la carte tombe sur le premier Slot libre quel que soit l'endroit du dépôt.
    const card = viewerPlayer.hand.find((c) => c.instanceId === instanceId);
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
    const rect = e.currentTarget.getBoundingClientRect();
    setDragAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }
  function handleUnitDragEnd() {
    setDraggingUnitId(null);
    setDragOverTargetId(null);
    setDragOverOtherBoard(false);
    setDragOverGraveyard(false);
    setDragAnchor(null);
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

        {/* Main adverse — arc inversé, remontée pour ne pas cacher son plateau. `pointer-events-none` : purement
            décorative (dos de carte, jamais interactive), et sans ça ce conteneur pleine-largeur peut intercepter
            des glisser-déposer destinés au plateau juste en-dessous. */}
        <div
          className="pointer-events-none absolute flex items-start justify-center"
          style={{ left: 0, top: -70, width: 1672, height: 220 }}
        >
          <OpponentHandFan cards={otherPlayer.hand} />
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
              <BoardCardTile
                instance={unit}
                tideState={state.environment.tideState}
                selected={pending?.kind === "attack"}
                onClick={() => handleAnyBoardCardClick(unit.instanceId, otherPlayer.id)}
                onShowDetail={() => setDetailInstance(unit)}
                hiddenFromViewer={!isVisibleDuringTide(getCardDefinition(unit.cardId), state.environment.tideState)}
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

        {/* Bande centrale : tuile de sens de Marée (gauche), progression de la Marée (centre), interaction (droite) */}
        <div className="absolute" style={{ left: 40, top: 350, width: 150, height: 170 }}>
          <TideOrientationTile orientation={state.environment.tideOrientation} />
        </div>

        {/* Fenêtre de réaction ouverte, en attente du viewer — priorité
            d'affichage sur tout le reste tant qu'elle reste ouverte
            (Notion "Moteur de partie" : aucune action normale possible
            tant qu'une réaction est en attente). */}
        {state.pendingReaction?.awaitingPlayerId === viewerPlayerId && (
          <div
            className="absolute z-20 flex flex-col items-center gap-2 rounded-lg border-2 border-amber-400/80 bg-black/90 px-4 py-3 shadow-[0_0_25px_rgba(251,191,36,0.35)]"
            style={{ left: 336, top: 300, width: 1000 }}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              Une carte peut réagir
            </span>
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
              <Button variant="secondary" onClick={() => runReactionAction({ type: "passReaction", playerId: viewerPlayerId })}>
                Passer
              </Button>
            </div>
            {pending?.kind === "reaction" && pending.needsTarget && (
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
            size={120}
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
          onDrop={handleOwnBoardDrop}
          className="absolute flex items-center justify-center gap-2 rounded-md p-1"
          style={{ left: 235, top: 538, width: 1010, height: 205 }}
        >
          {viewerPlayer.board.map((unit) => (
            <div
              key={unit.instanceId}
              // Seuls Marins/Créatures peuvent attaquer (et donc être "glissés" en Phase de combat) —
              // Structure/Objet/Équipement se Sabordent via le bouton dédié, pas le glisser-déposer.
              // Une unité Engourdie (maladie d'invocation) ne peut pas encore attaquer, et une unité
              // Silencée ne peut pas utiliser d'effet (y compris Sabordage) — ni l'une ni l'autre n'a
              // donc de raison d'être glissée.
              draggable={
                isViewerTurn &&
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
                selected={selectedBoardId === unit.instanceId || pending?.kind === "attack"}
                onClick={() => handleAnyBoardCardClick(unit.instanceId, viewerPlayer.id)}
                onShowDetail={() => setDetailInstance(unit)}
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

        {/* Main du viewer — centrée en bas de l'écran, en éventail. `pointer-events-none` sur ce conteneur
            pleine-largeur (chaque carte se réactive individuellement, `HandFan`) : sinon la zone vide entre les
            cartes peut intercepter des glisser-déposer destinés au plateau juste au-dessus. */}
        <div className="pointer-events-none absolute flex items-end justify-center" style={{ left: 0, top: 775, width: 1672, height: 195 }}>
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
          className={`absolute truncate rounded-md border px-2.5 py-1 text-xs ${
            isViewerTurn ? "border-board-accent/50 bg-board-accent/10 text-slate-100" : "border-slate-700/70 bg-black/60 text-slate-200"
          }`}
          style={{ left: 1462, top: 906, width: 204 }}
        >
          Joueur {viewerPlayer.id === "p1" ? "1" : "2"} — {viewerShip.name}
          {isViewerTurn ? " (à vous)" : ""}
          <span className="ml-1 text-slate-500">· {viewerPlayer.hand.length} carte(s)</span>
        </div>
        <CardFlightLayer flights={cardFlights} getCoords={getFlightCoords} />
      </BoardStage>

      <DragTargetingTrail anchor={dragAnchor} />
      <ActionToastStack toasts={actionToasts} />
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
