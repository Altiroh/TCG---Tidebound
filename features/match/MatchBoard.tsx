"use client";

import { useMemo, useState } from "react";
import {
  dispatch,
  getCardDefinition,
  getShipDefinition,
  UNIT_CARD_TYPES,
  type CardInstance,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { Button } from "@/components/ui/Button";
import { CardBack } from "@/features/match/CardBack";
import { CardHoverPreview } from "@/features/match/CardHoverPreview";
import { CardTile } from "@/features/match/CardTile";
import { TIDE_STATE_COLORS, TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { formatEvent } from "@/features/match/formatEvent";

interface MatchBoardProps {
  initialState: GameState;
  onExit: () => void;
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

/** Instance en cours de glissement depuis la main, décodée depuis `DataTransfer` au drop. */
const DRAG_MIME = "application/x-tidebound-card-instance";

export function MatchBoard({ initialState, onExit }: MatchBoardProps) {
  const [state, setState] = useState<GameState>(initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [dragOverOwnBoard, setDragOverOwnBoard] = useState(false);

  const activePlayerId = state.activePlayerId;
  const activePlayer = state.players.find((p) => p.id === activePlayerId)!;
  const opponent = state.players.find((p) => p.id !== activePlayerId)!;
  const ship = getShipDefinition(activePlayer.shipId);
  const opponentShip = getShipDefinition(opponent.shipId);

  const recentEvents = useMemo(() => state.eventLog.slice(-10).reverse(), [state.eventLog]);

  function clearSelection() {
    setPending(null);
    setSelectedBoardId(null);
  }

  function runAction(action: PlayerAction) {
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
    const card = activePlayer.hand.find((c) => c.instanceId === instanceId);
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
      if (ownerId === activePlayerId) return; // géré par handleOwnBoardCardClick
      runAction({
        type: "attack",
        playerId: activePlayerId,
        attackerInstanceId: pending.attackerId,
        defenderInstanceId: instanceId,
      });
      return;
    }
    if (ownerId === activePlayerId) handleOwnBoardCardClick(instanceId);
  }

  function startBreak(unit: CardInstance) {
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
    e.dataTransfer.setData(DRAG_MIME, instanceId);
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
    const instanceId = e.dataTransfer.getData(DRAG_MIME);
    setDraggingId(null);
    if (instanceId) handleHandCardClick(instanceId);
  }
  /** Déposer directement SUR un permanent (à soi ou adverse) résout la cible en un seul geste, sans étape intermédiaire. */
  function handleBoardTileDragOver(e: React.DragEvent, targetInstanceId: string) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTargetId(targetInstanceId);
  }
  function handleBoardTileDrop(e: React.DragEvent, targetInstanceId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTargetId(null);
    setDragOverOwnBoard(false);
    const instanceId = e.dataTransfer.getData(DRAG_MIME);
    setDraggingId(null);
    if (!instanceId) return;
    const card = activePlayer.hand.find((c) => c.instanceId === instanceId);
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-3xl font-bold">
          {state.winnerId ? `${state.winnerId === "p1" ? "Joueur 1" : "Joueur 2"} l'emporte` : "Match nul"}
        </h1>
        <p className="text-slate-400">La mer a tranché.</p>
        <Button onClick={onExit}>Nouvelle partie</Button>
      </div>
    );
  }

  const selectedUnit = selectedBoardId ? activePlayer.board.find((u) => u.instanceId === selectedBoardId) : undefined;
  const selectedDef = selectedUnit ? getCardDefinition(selectedUnit.cardId) : undefined;
  const ownEmptySlots = Math.max(0, ship.slotCount - activePlayer.board.length);
  const opponentEmptySlots = Math.max(0, opponentShip.slotCount - opponent.board.length);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4">
      {/* Adversaire (inactif) */}
      <PlayerSummary
        label={`Joueur ${opponent.id === "p1" ? "1" : "2"} — ${getShipDefinition(opponent.shipId).name}`}
        anchor={opponent.anchor}
        anchorMax={opponentShip.startingAnchor}
        reason={opponent.reason}
        reasonMax={opponent.reasonMax}
        handCount={opponent.hand.length}
      />
      <div className="flex flex-wrap gap-2">
        {opponent.hand.map((card) => (
          <CardBack key={card.instanceId} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
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
              selected={pending?.kind === "attack"}
              onClick={() => handleAnyBoardCardClick(unit.instanceId, opponent.id)}
            />
          </div>
        ))}
        {Array.from({ length: opponentEmptySlots }).map((_, i) => (
          <EmptySlot key={`opp-empty-${i}`} />
        ))}
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
        <div className="flex items-center gap-2">
          {pending && (
            <Button variant="secondary" onClick={clearSelection}>
              Annuler
            </Button>
          )}
          <Button onClick={() => runAction({ type: "endTurn", playerId: activePlayerId })}>Fin de tour</Button>
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

      {/* Joueur actif */}
      <div
        onDragOver={handleOwnBoardDragOver}
        onDragLeave={handleOwnBoardDragLeave}
        onDrop={handleOwnBoardDrop}
        className={`flex flex-wrap gap-2 rounded-md p-1 transition-colors ${
          dragOverOwnBoard ? "bg-board-accent/10 ring-2 ring-board-accent/60" : ""
        }`}
      >
        {activePlayer.board.map((unit) => (
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
              selected={selectedBoardId === unit.instanceId || pending?.kind === "attack"}
              onClick={() => handleAnyBoardCardClick(unit.instanceId, activePlayer.id)}
            />
          </div>
        ))}
        {Array.from({ length: ownEmptySlots }).map((_, i) => (
          <EmptySlot key={`own-empty-${i}`} />
        ))}
      </div>

      {selectedUnit && selectedDef && !pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-board-accent/40 bg-board-accent/5 px-3 py-2">
          <span className="text-xs text-slate-300">{selectedDef.name} :</span>
          {isUnitType(selectedDef.type) && !selectedUnit.summoningSick && !selectedUnit.hasAttackedThisTurn && (
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
          {selectedDef.type === "objet" && !activePlayer.hasUsedMainActionThisTurn && (
            <Button variant="secondary" onClick={() => startBreak(selectedUnit)}>
              Briser
            </Button>
          )}
          {!activePlayer.hasUsedMainActionThisTurn && (
            <Button
              variant="secondary"
              onClick={() => runAction({ type: "saborder", playerId: activePlayerId, instanceId: selectedUnit.instanceId })}
            >
              Saborder
            </Button>
          )}
        </div>
      )}

      <PlayerSummary
        label={`Joueur ${activePlayer.id === "p1" ? "1" : "2"} — ${ship.name} (à vous de jouer)`}
        anchor={activePlayer.anchor}
        anchorMax={ship.startingAnchor}
        reason={activePlayer.reason}
        reasonMax={activePlayer.reasonMax}
        handCount={activePlayer.hand.length}
        highlighted
      />
      <div className="flex flex-wrap gap-2">
        {activePlayer.hand.map((card) => (
          <div
            key={card.instanceId}
            draggable={!activePlayer.hasUsedMainActionThisTurn}
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
              disabled={activePlayer.hasUsedMainActionThisTurn}
              onClick={() => handleHandCardClick(card.instanceId)}
            />
          </div>
        ))}
        {activePlayer.hand.length === 0 && <p className="text-xs text-slate-600">Main vide.</p>}
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

interface PlayerSummaryProps {
  label: string;
  anchor: number;
  anchorMax: number;
  reason: number;
  reasonMax: number;
  handCount: number;
  highlighted?: boolean;
}

function PlayerSummary({ label, anchor, anchorMax, reason, reasonMax, handCount, highlighted }: PlayerSummaryProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2 text-sm ${
        highlighted ? "border-board-accent/50 bg-board-accent/5" : "border-slate-800 bg-board-surface"
      }`}
    >
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-4">
        <StatBar label="Ancrage" value={anchor} max={anchorMax} colorClass="bg-sky-500" />
        <StatBar label="Raison" value={reason} max={reasonMax} colorClass="bg-violet-500" />
        <span className="text-xs text-slate-500">{handCount} carte(s) en main</span>
      </div>
    </div>
  );
}

function StatBar({ label, value, max, colorClass }: { label: string; value: number; max: number; colorClass: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {label}
      <span className="h-2 w-16 overflow-hidden rounded-full bg-slate-800">
        <span className={`block h-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-slate-300">
        {value}/{max}
      </span>
    </span>
  );
}
