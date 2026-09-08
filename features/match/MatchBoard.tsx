"use client";

import { useMemo, useState } from "react";
import {
  dispatch,
  getCardDefinition,
  getShipDefinition,
  getWaterDefinition,
  UNIT_CARD_TYPES,
  type CardInstance,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { Button } from "@/components/ui/Button";
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

function isUnitType(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

export function MatchBoard({ initialState, onExit }: MatchBoardProps) {
  const [state, setState] = useState<GameState>(initialState);
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activePlayerId = state.activePlayerId;
  const activePlayer = state.players.find((p) => p.id === activePlayerId)!;
  const opponent = state.players.find((p) => p.id !== activePlayerId)!;
  const ship = getShipDefinition(activePlayer.shipId);
  const opponentShip = getShipDefinition(opponent.shipId);
  const water = getWaterDefinition(state.environment.currentWaterId);

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
        {opponent.board.map((unit) => (
          <CardTile
            key={unit.instanceId}
            instance={unit}
            tideState={state.environment.tideState}
            selected={pending?.kind === "attack"}
            onClick={() => handleAnyBoardCardClick(unit.instanceId, opponent.id)}
          />
        ))}
        {opponent.board.length === 0 && <p className="text-xs text-slate-600">Plateau vide.</p>}
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
          <span>
            Eaux : <strong>{water.name}</strong> ({state.environment.waterRemainingTurns} tour(s))
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
      <div className="flex flex-wrap gap-2">
        {activePlayer.board.map((unit) => (
          <CardTile
            key={unit.instanceId}
            instance={unit}
            tideState={state.environment.tideState}
            selected={selectedBoardId === unit.instanceId || pending?.kind === "attack"}
            onClick={() => handleAnyBoardCardClick(unit.instanceId, activePlayer.id)}
          />
        ))}
        {activePlayer.board.length === 0 && <p className="text-xs text-slate-600">Plateau vide.</p>}
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
          <CardTile
            key={card.instanceId}
            instance={card}
            tideState={state.environment.tideState}
            selected={pending?.kind === "playCard" && pending.instanceId === card.instanceId}
            disabled={activePlayer.hasUsedMainActionThisTurn}
            onClick={() => handleHandCardClick(card.instanceId)}
          />
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
