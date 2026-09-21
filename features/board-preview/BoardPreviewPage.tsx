"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { advanceTideState, naturalOrientationFor, type TideOrientation } from "@/game";
import { playCardDraw, playAttackImpact } from "@/lib/sound";
import { animateAttacker, ATTACK_IMPACT_AT_MS, ATTACK_TOTAL_MS, shake } from "@/features/board-preview/attackMotion";
import { BackgroundLayer } from "@/features/match/table/BackgroundLayer";
import { CardZoom } from "@/features/board-preview/CardZoom";
import { CenterZone } from "@/features/match/table/CenterZone";
import { DebugOverlay } from "@/features/board-preview/DebugOverlay";
import { DecorLayer } from "@/features/match/table/DecorLayer";
import { DragLayer, type AimTone } from "@/features/match/table/DragLayer";
import { EquipLinks } from "@/features/match/table/EquipLinks";
import { EffectsLayer } from "@/features/board-preview/EffectsLayer";
import { GameStage } from "@/features/match/table/GameStage";
import { GameViewport } from "@/features/match/table/GameViewport";
import { MotionLayer, type ImpactFx } from "@/features/match/table/MotionLayer";
import { shipAbilityArtUrl } from "@/features/ships/shipFrame";
import { OpponentZone } from "@/features/match/table/OpponentZone";
import { PlayerZone } from "@/features/match/table/PlayerZone";
import { PreviewGameCard } from "@/features/board-preview/PreviewGameCard";
import { TableHand } from "@/features/match/table/TableHand";
import { PhaseButton, TableHud } from "@/features/match/table/TableHud";
import { TableOpponentHand } from "@/features/match/table/TableOpponentHand";
import styles from "@/features/match/table/Table.module.css";
import { BOARD_CAPACITY, PREVIEW_FIXTURES } from "@/features/board-preview/previewFixtures";
import { boxOf, DRAW_STAGGER_MS, reducedMotion, useCardMotion } from "@/features/match/table/useCardMotion";
import {
  canAttack,
  HAND_LIMIT,
  playTargetsFor,
  unitStats,
  usePreviewTable,
  type PreviewTargetId,
} from "@/features/board-preview/usePreviewTable";
import { useTableGestures } from "@/features/match/table/useTableGestures";
import { useTableMetrics, type BoardPreviewBreakpoint } from "@/features/match/table/useTableMetrics";

/**
 * BOARD PREVIEW — laboratoire de layout, écran temporaire.
 * ========================================================
 *
 * Ce qu'il est : un bac à sable pour régler la composition du plateau
 * (proportions, espacements, zones, responsive) sur toutes les résolutions
 * cibles, du 2560×1440 au 740×360 en paysage, puis ses GESTES — poser une
 * carte, équiper, cibler avec une unité, saborder (`useTableGestures`) — et
 * ses MOUVEMENTS — distribution, pioche, pose, défausse, attaque
 * (`useCardMotion`, `attackMotion`) — sur un état de table local et
 * simplifié (`usePreviewTable`).
 *
 * Ce qu'il n'est PAS, et ne doit jamais devenir :
 *   - il ne crée aucune partie (`createLocalMatch` & co ne sont pas importés) ;
 *   - il n'appelle aucun matchmaking, aucun backend, aucune Server Action ;
 *   - il n'enregistre aucune progression, ne consomme aucune ressource ;
 *   - il ne lit ni ne modifie aucun deck ;
 *   - il n'a besoin d'aucun adversaire, ni d'aucun compte.
 * Seule exception assumée : les CARTES. Pour construire le board avec les
 * vrais éléments, `PreviewGameCard` rend le `CardTile` du jeu, qui lit le
 * catalogue (`getCardDefinition`, calcul des stats affichées) — lecture
 * seule, fonctions pures. Restent interdits dans `features/board-preview/` :
 * le moteur (`dispatch`, `createGameState`, `createLocalMatch`, bot),
 * `@/lib/supabase` et toute Server Action. (Les sons de pioche et d'impact
 * viennent de `@/lib/sound`, sans état ni réseau.)
 *
 * Il ne remplace pas non plus le board réel (`features/match/MatchBoard.tsx`,
 * `features/match/BoardStage.tsx`), qui reste strictement inchangé. Une
 * fois la composition validée ici, elle sera réinjectée progressivement
 * là-bas — d'où le soin mis à ne coupler la disposition à AUCUN rendu de
 * carte (cf. les props `renderCard` de `TableRow`/`TableHand`).
 */
const BADGE_SIZE: Record<BoardPreviewBreakpoint, number> = {
  "mobile-landscape": 20,
  laptop: 30,
  "desktop-large": 38,
};

export function BoardPreviewPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const metrics = useTableMetrics(stageRef);
  const [zonesVisible, setZonesVisible] = useState(false);
  const [debugCollapsed, setDebugCollapsed] = useState(false);

  const { opponent, player, turn, phaseLabel } = PREVIEW_FIXTURES;
  // État de Marée piloté depuis la barre de debug : fond, piste et stats des cartes suivent.
  // Progression réelle de la Marée (`advanceTideState` / `naturalOrientationFor`, fonctions pures du moteur) :
  // l'orientation s'inverse d'elle-même aux bornes, et la tuile de sens pivote avec elle.
  const [tideIndex, setTideIndex] = useState(PREVIEW_FIXTURES.tide.current);
  const [orientation, setOrientation] = useState<TideOrientation>("montante");
  const tide = { ...PREVIEW_FIXTURES.tide, current: tideIndex, orientation: orientation === "montante" ? ("rising" as const) : ("falling" as const) };
  const tideState = tide.states[tideIndex]?.id ?? "calme";
  const router = useRouter();

  function nextTide() {
    const nextState = advanceTideState(tideState, orientation);
    setTideIndex(tide.states.findIndex((s) => s.id === nextState));
    setOrientation(naturalOrientationFor(nextState, orientation));
  }
  // Badges de statut à l'échelle des cartes (38 px = cartes de plateau de l'ancien board).
  const badgeSize = BADGE_SIZE[metrics.breakpoint];

  const table = usePreviewTable();
  const {
    hand,
    playerBoard,
    opponentBoard,
    playerDeck,
    playerGraveyard,
    opponentDeck,
    opponentHand,
    opponentGraveyard,
    hull,
    damage,
    attachments,
    journal,
  } = table.state;
  const boardHasRoom = playerBoard.length < BOARD_CAPACITY;

  // Les minuteries (distribution, attaque) lisent l'état COURANT, pas celui de leur création.
  const stateRef = useRef(table.state);
  stateRef.current = table.state;

  const motion = useCardMotion();
  const [fx, setFx] = useState<ImpactFx[]>([]);
  const fxId = useRef(0);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  function addFx(item: Omit<ImpactFx, "id">) {
    const id = fxId.current++;
    setFx((current) => [...current, { ...item, id }]);
    later(() => setFx((current) => current.filter((f) => f.id !== id)), 1000);
  }

  /** Carte affichée en grand (lecture au doigt / clic droit). */
  const [inspectId, setInspectId] = useState<string | null>(null);
  /**
   * Panneau de capacité de Navire (Le Goliath — Canon de proue), montré ici
   * pour que sa position, sa taille et l'écartement des planches se règlent
   * à l'œil avant qu'un asset définitif existe. Cliquer bascule ouvert/fermé :
   * le laboratoire ne connaît aucune règle, il montre les deux états.
   */
  const [cannonArmed, setCannonArmed] = useState(false);
  const closeZoom = useCallback(() => setInspectId(null), []);
  /** À la souris, le clic droit fait ce que fait l'appui long au doigt. */
  const inspectOnContextMenu = (cardId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setInspectId(cardId);
  };
  const inspected = inspectId ? [...hand, ...playerBoard, ...opponentBoard].find((c) => c.id === inspectId) ?? null : null;

  // ── Pioche ─────────────────────────────────────────────────────────
  const drawPlayer = useCallback(() => {
    const current = stateRef.current;
    const card = current.playerDeck[0];
    if (!card || current.hand.length >= HAND_LIMIT) return;
    motion.flyDraw('[data-deck="player"]', `[data-card-id="${card.id}"]`, card.id);
    playCardDraw();
    table.draw("player");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `table.draw` et `motion.flyDraw` sont stables à l'usage (dispatch / useCallback).
  }, []);

  const drawOpponent = useCallback(() => {
    const current = stateRef.current;
    if (current.opponentDeck <= 0 || current.opponentHand >= HAND_LIMIT) return;
    const index = current.opponentHand;
    motion.flyDraw('[data-deck="opponent"]', `[data-opp-hand-index="${index}"]`, `opp-hand-${index}`);
    table.draw("opponent");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idem.
  }, []);

  /** Main de départ : chaque carte part de sa pioche, l'une après l'autre (comme `useCardFlights`). */
  const deal = useCallback(() => {
    for (let i = 0; i < PREVIEW_FIXTURES.playerHand.length; i++) later(drawPlayer, 250 + i * DRAW_STAGGER_MS);
    for (let i = 0; i < PREVIEW_FIXTURES.opponentHandCount; i++) later(drawOpponent, 380 + i * DRAW_STAGGER_MS);
  }, [later, drawPlayer, drawOpponent]);

  useEffect(() => {
    deal();
    return clearTimers;
  }, [deal, clearTimers]);

  // ── Attaque ────────────────────────────────────────────────────────
  /** Unités détruites (Résistance à 0) → elles volent jusqu'à la défausse de leur camp, puis quittent le plateau. */
  function sweepDestroyed() {
    const current = stateRef.current;
    const dead = [
      ...current.opponentBoard.map((card) => ({ card, side: "opponent" as const })),
      ...current.playerBoard.map((card) => ({ card, side: "player" as const })),
    ].filter(({ card }) => {
      const stats = unitStats(card, current, tideState);
      return stats.hasHealth && stats.remaining <= 0;
    });
    if (dead.length === 0) return;
    dead.forEach(({ card, side }) =>
      motion.flyToGraveyard(
        card.id,
        <PreviewGameCard card={card} tideState={tideState} showStatusBadges={false} damage={current.damage[card.id] ?? 0} />,
        `[data-graveyard="${side}"]`
      )
    );
    table.destroy(dead.map(({ card }) => card.id));
  }

  function attack(sourceId: string, target: PreviewTargetId) {
    const current = stateRef.current;
    const source = current.playerBoard.find((c) => c.id === sourceId);
    if (!source) return;
    const defender = target.kind === "unit" ? current.opponentBoard.find((c) => c.id === target.id) : undefined;
    // Combat simplifié du labo : Puissance contre Puissance (cf. `usePreviewTable`).
    const amount = Math.max(0, unitStats(source, current, tideState).attack);
    const retaliation = defender ? Math.max(0, unitStats(defender, current, tideState).attack) : 0;

    const attackerEl = document.querySelector<HTMLElement>(`[data-card-id="${sourceId}"]`);
    const targetEl =
      target.kind === "ship"
        ? document.querySelector<HTMLElement>('[data-drop="ship"]')
        : document.querySelector<HTMLElement>(`[data-card-id="${target.id}"]`);

    if (!attackerEl || !targetEl || reducedMotion()) {
      table.strike(sourceId, target, amount, retaliation);
      later(sweepDestroyed, 0);
      return;
    }

    const attackerBox = attackerEl.getBoundingClientRect();
    animateAttacker(attackerEl, targetEl);
    later(() => {
      const targetBox = targetEl.getBoundingClientRect();
      const size = targetBox.height;
      const point = { x: targetBox.left + targetBox.width / 2, y: targetBox.top + targetBox.height / 2 };
      table.strike(sourceId, target, amount, retaliation);
      playAttackImpact();
      // Une carte qui encaisse des dégâts joue déjà son propre impact (`CardTile`) : on tremble le Navire, ou un coup à 0.
      if (target.kind === "ship" || amount === 0) shake(targetEl);
      addFx({ kind: "flash", ...point, size });
      if (amount > 0) addFx({ kind: "damage", ...point, amount, size });
      if (retaliation > 0) {
        addFx({
          kind: "damage",
          x: attackerBox.left + attackerBox.width / 2,
          y: attackerBox.top + attackerBox.height / 2,
          amount: retaliation,
          size: attackerBox.height,
        });
      }
    }, ATTACK_IMPACT_AT_MS);
    // Une carte détruite encaisse d'abord le coup, puis part à la défausse une fois l'attaquant revenu.
    later(sweepDestroyed, ATTACK_TOTAL_MS + 60);
  }

  /** Porteurs possibles de chaque carte de main (`null` = se pose sans cible). */
  const handTargets = new Map(hand.map((card) => [card.id, playTargetsFor(card, table.state)] as const));

  /*
   * Zones de dépôt (`data-drop`) :
   *   board        — plateau du joueur (pose)
   *   own:<id>     — une carte du joueur (porteur d'un Équipement)
   *   unit:<id>    — une carte adverse (cible d'attaque)
   *   ship         — le Navire adverse (cible d'attaque)
   *   graveyard    — le crâne du joueur (Sabordage)
   * Toute la table des dépôts autorisés du labo tient dans `isValidDrop`.
   */
  const { gesture, hover, startGesture, cancel } = useTableGestures({
    isValidDrop: (kind, sourceId, drop) => {
      if (kind === "place") return (drop === "board" || drop.startsWith("board:")) && boardHasRoom;
      if (kind === "cast") {
        return boardHasRoom && drop.startsWith("own:") && (handTargets.get(sourceId)?.includes(drop.slice(4)) ?? false);
      }
      const source = playerBoard.find((c) => c.id === sourceId);
      if (!source) return false;
      if (drop === "graveyard") return true;
      return canAttack(source) && (drop === "ship" || drop.startsWith("unit:"));
    },
    onDrop: (kind, sourceId, drop, point) => {
      const handEl = document.querySelector<HTMLElement>(`[data-card-id="${sourceId}"]`);
      if (kind === "place") {
        // La carte repart de là où le fantôme a été lâché (même taille, légèrement agrandie).
        const width = (handEl?.offsetWidth ?? 0) * 1.08;
        motion.slideFrom(sourceId, handEl ? { x: point.x - width / 2, y: point.y - (width * 1.4) / 2, width, height: width * 1.4 } : null);
        table.place(sourceId);
      } else if (kind === "cast") {
        motion.slideFrom(sourceId, boxOf(handEl));
        table.place(sourceId, drop.slice(4));
      } else if (drop === "graveyard") {
        const card = stateRef.current.playerBoard.find((c) => c.id === sourceId);
        if (card) {
          motion.flyToGraveyard(
            card.id,
            <PreviewGameCard card={card} tideState={tideState} showStatusBadges={false} damage={stateRef.current.damage[card.id] ?? 0} />,
            '[data-graveyard="player"]'
          );
        }
        table.sabotage(sourceId);
      } else {
        attack(sourceId, drop === "ship" ? { kind: "ship" } : { kind: "unit", id: drop.slice(5) });
      }
    },
    canArm: (sourceId) => {
      const source = playerBoard.find((c) => c.id === sourceId);
      return source ? canAttack(source) : false;
    },
    onInspect: setInspectId,
  });

  const placing = gesture?.kind === "place" ? gesture : null;
  const casting = gesture?.kind === "cast" ? gesture : null;
  const aiming = gesture?.kind === "aim" ? gesture : null;
  const aimSource = aiming ? playerBoard.find((c) => c.id === aiming.sourceId) : undefined;
  const aimingAttacker = aimSource ? canAttack(aimSource) : false;
  const castTargets = casting ? (handTargets.get(casting.sourceId) ?? []) : [];

  function reset() {
    cancel();
    clearTimers();
    setFx([]);
    table.reset();
    deal();
  }

  const tone: AimTone = casting ? "effect" : hover === "graveyard" ? "sabotage" : "attack";

  return (
    <GameViewport debugZones={zonesVisible}>
      <BackgroundLayer tideState={tideState} />
      <DecorLayer />

      <GameStage ref={stageRef} className={gesture ? styles.gesturing : undefined}>
        {/* Cadres des deux rangées de plateau, derrière les zones. La bande de Marée n'en a pas : on y voit le décor. */}
        <div aria-hidden className={`${styles.lane} ${styles.laneOpponent}`} />
        <div aria-hidden className={`${styles.lane} ${styles.lanePlayer}`} />

        <TableOpponentHand count={opponentHand} hidden={motion.hidden} />
        <OpponentZone
          ship={{ name: opponent.shipName, illustration: opponent.illustration, hull: hull.opponent, maxHull: opponent.maxHull, reason: opponent.reason, maxReason: opponent.maxReason }}
          board={opponentBoard}
          deck={opponentDeck}
          graveyard={opponentGraveyard}
          renderCard={(card) => {
            const drop = `unit:${card.id}`;
            return (
              <div
                data-card-id={card.id}
                data-drop={drop}
                // Carte adverse : jamais prise, seulement lisible (appui long / toucher / clic droit).
                onPointerDown={startGesture("inspect", card.id)}
                onContextMenu={inspectOnContextMenu(card.id)}
                className={`${styles.tableCard} ${styles.boardHoverable} ${aimingAttacker ? styles.targetable : ""} ${hover === drop ? styles.targetHover : ""}`}
              >
                <PreviewGameCard card={card} tideState={tideState} badgeSize={badgeSize} damage={damage[card.id]} />
              </div>
            );
          }}
          wrapShip={(ship) => (
            <div
              data-drop="ship"
              className={`${styles.shipTarget} ${aimingAttacker ? styles.targetable : ""} ${hover === "ship" ? styles.targetHover : ""}`}
            >
              {ship}
            </div>
          )}
        />
        <CenterZone tide={tide} />
        <PlayerZone
          ship={{
            name: player.shipName,
            illustration: player.illustration,
            hull: hull.player,
            maxHull: player.maxHull,
            reason: player.reason,
            maxReason: player.maxReason,
            ability: {
              name: "Canon de proue",
              text: "Aperçu du panneau de capacité — cliquez pour ouvrir ou refermer les planches.",
              artUrl: shipAbilityArtUrl("goliath.webp"),
              armed: cannonArmed,
              actionable: true,
              onClick: () => setCannonArmed((armed) => !armed),
            },
          }}
          board={playerBoard}
          deck={playerDeck.length}
          onDraw={drawPlayer}
          graveyard={playerGraveyard}
          // Le crâne ne s'annonce que pendant un vrai glisser (pas pour une unité armée au toucher).
          graveyardDropState={aiming && !aiming.armed ? (hover === "graveyard" ? "over" : "ready") : "idle"}
          // Plateau plein : il ne s'allume pas, la carte relâchée retourne en main.
          dropState={placing && boardHasRoom ? (hover === "board" ? "over" : "ready") : "idle"}
          renderCard={(card) => {
            const attacker = canAttack(card);
            const drop = `own:${card.id}`;
            const castable = castTargets.includes(card.id);
            return (
              <div
                data-card-id={card.id}
                data-drop={drop}
                data-armable={attacker ? "" : undefined}
                onPointerDown={startGesture("aim", card.id)}
                onContextMenu={inspectOnContextMenu(card.id)}
                className={[
                  styles.tableCard,
                  styles.boardHoverable,
                  styles.boardGrab,
                  attacker && !gesture ? styles.attacker : "",
                  aiming?.sourceId === card.id ? styles.aimSource : "",
                  castable ? `${styles.targetable} ${styles.effectTone}` : "",
                  castable && hover === drop ? styles.targetHover : "",
                ].join(" ")}
                title={
                  attacker
                    ? "Glisser vers une cible ou sur le crâne — ou toucher, puis toucher la cible. Clic droit : agrandir."
                    : "Glisser sur le crâne pour saborder. Clic droit : agrandir."
                }
              >
                <PreviewGameCard card={card} tideState={tideState} badgeSize={badgeSize} damage={damage[card.id]} />
              </div>
            );
          }}
        />
        <TableHand
          cards={hand}
          dragging={placing !== null || casting !== null}
          renderCard={(card) => {
            const needsTarget = handTargets.get(card.id) != null;
            const isSource = placing?.sourceId === card.id || casting?.sourceId === card.id;
            return (
              <div
                data-card-id={card.id}
                onPointerDown={startGesture(needsTarget ? "cast" : "place", card.id)}
                onContextMenu={inspectOnContextMenu(card.id)}
                className={[
                  styles.tableCard,
                  styles.boardHoverable,
                  styles.handGrab,
                  isSource ? (casting ? styles.castSource : styles.dragSource) : "",
                  // Piochée mais encore en vol depuis la pioche.
                  motion.hidden.has(card.id) ? styles.motionHidden : "",
                ].join(" ")}
              >
                <PreviewGameCard card={card} tideState={tideState} showStatusBadges={false} />
              </div>
            );
          }}
        />

        <TableHud
          turn={turn}
          turnOwner="À vous"
          viewerTurn
          onMenu={() => router.push("/")}
          journal={
            <ul className={styles.journalList}>
              {journal.map((entry, index) => (
                <li key={index} className={styles.journalEntry}>
                  {entry}
                </li>
              ))}
            </ul>
          }
          phaseButton={<PhaseButton label={phaseLabel} phaseLabel="Phase principale" icon="/assets/board/phase-buttons/icon-end-turn.webp" />}
        />

        <EffectsLayer />
      </GameStage>

      <EquipLinks attachments={attachments} layoutKey={playerBoard.map((c) => c.id).join("|")} />

      <MotionLayer flights={motion.flights} fx={fx} />

      <DragLayer
        gesture={gesture}
        onTarget={hover !== null}
        tone={tone}
        renderGhost={(id) => {
          const card = hand.find((c) => c.id === id);
          return card ? <PreviewGameCard card={card} tideState={tideState} showStatusBadges={false} /> : null;
        }}
      />

      <CardZoom card={inspected} tideState={tideState} damage={inspected ? damage[inspected.id] : 0} onClose={closeZoom} />

      <DebugOverlay
        metrics={metrics}
        zonesVisible={zonesVisible}
        onToggleZones={() => setZonesVisible((visible) => !visible)}
        collapsed={debugCollapsed}
        onToggleCollapsed={() => setDebugCollapsed((collapsed) => !collapsed)}
        onReset={reset}
        onNextTide={nextTide}
        tideLabel={tide.states[tideIndex]?.label ?? ""}
      />
    </GameViewport>
  );
}
