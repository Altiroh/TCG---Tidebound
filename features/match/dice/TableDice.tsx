"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  dieOutcomeOf,
  dieRollOptions,
  getCardDefinition,
  handBreakCost,
  type DieOutcome,
  type DieSize,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import { DIE_FACE_PLACEMENT, dieBodyUrl, dieFaceUrl } from "@/features/match/dice/diceAssets";
import { useDiceThrow, type DiceThrow } from "@/features/match/dice/useDiceThrow";
import { useImageOk } from "@/features/match/useImageOk";
import { loadImageStatus } from "@/features/match/imageStatusCache";
import { playButtonClick, playDiceLanded } from "@/lib/sound";
import styles from "@/features/match/dice/TableDice.module.css";

interface TableDiceProps {
  state: GameState;
  viewerId: PlayerId;
  /** `resolveChoice` (garder, relancer, ajuster, valider) ou `breakObject` (une carte Chaîne). */
  onAction: (action: PlayerAction) => void;
}

const ISSUES: Record<DieOutcome, string> = {
  criticalSuccess: "Réussite critique",
  success: "Réussite",
  failure: "Échec",
  criticalFailure: "Échec critique",
};

/** Durée du vol, de la main au tapis. */
const FLIGHT_MS = 950;
/** Les faces défilent pendant le vol : une toutes les… */
const TUMBLE_TICK_MS = 70;

function signe(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

/** Petit hachage stable : l'endroit où le dé tombe varie d'un jet à l'autre, sans hasard au rendu. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * LES DÉS SUR LA TABLE (Lot 17) — sans fenêtre.
 *
 * Quand un jet a lieu, un dé part du côté de celui qui le lance, traverse la
 * table en tournoyant (les faces défilent, déformées comme un objet qui
 * roule), rebondit et se pose. Le résultat s'éclaire sous lui ; un jet fermé
 * s'efface au bout de quelques secondes.
 *
 * Tant que le jet est OUVERT (la Chaîne), le dé reste posé et les gestes
 * encore possibles s'alignent en pastilles sous lui — relancer, +1/−1,
 * Briser un Objet « Chaîne », valider. Rien ne recouvre la partie : le
 * plateau reste visible et jouable du regard.
 */
export function TableDice({ state, viewerId, onAction }: TableDiceProps) {
  const current = useDiceThrow(state);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Planches chargées dès l'arrivée à table : sans cela, le PREMIER lancer
  // partait avec le dé de repli, le temps que les images arrivent.
  useEffect(() => {
    for (const die of [4, 6, 8] as const) {
      void loadImageStatus(dieBodyUrl(die));
      for (let value = 1; value <= die; value++) void loadImageStatus(dieFaceUrl(die, value));
    }
  }, []);
  if (!mounted || !current) return null;
  return createPortal(<DiceOnTable throwInfo={current} state={state} viewerId={viewerId} onAction={onAction} />, document.body);
}

function DiceOnTable({ throwInfo, state, viewerId, onAction }: { throwInfo: DiceThrow } & TableDiceProps) {
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const fromViewer = throwInfo.rollerId === viewerId;

  // Point de chute : le milieu de la table (la piste de Marée), décalé d'un jet à l'autre.
  useLayoutEffect(() => {
    const zone = document.querySelector('[data-zone="CenterZone"]')?.getBoundingClientRect();
    const width = zone?.width ?? window.innerWidth * 0.6;
    const cx = (zone ? zone.left + zone.width / 2 : window.innerWidth / 2) + (hash(throwInfo.key) - 0.5) * width * 0.3;
    const cy = zone ? zone.top + zone.height / 2 : window.innerHeight / 2;
    setSpot({ x: cx, y: cy });
  }, [throwInfo.key]);

  if (!spot) return null;
  const mine = fromViewer && throwInfo.open && throwInfo.choice;
  const issue = throwInfo.outcome ?? (throwInfo.choice && throwInfo.choice.value !== undefined ? dieOutcomeOf(throwInfo.choice, throwInfo.choice.value) : undefined);
  const source = throwInfo.cardId ? getCardDefinition(throwInfo.cardId).name.split(",")[0] : null;

  return (
    <div className={styles.spot} style={{ left: spot.x, top: spot.y }} aria-live="polite">
      <div className={styles.dice}>
        {throwInfo.faces.map((face, index) => (
          <ThrownDie
            key={`${throwInfo.key}:${index}`}
            throwKey={`${throwInfo.key}:${index}`}
            die={throwInfo.die}
            face={face}
            fromViewer={fromViewer}
            outcome={throwInfo.open ? undefined : throwInfo.outcome}
            onPick={
              mine && throwInfo.choice?.candidates
                ? () => {
                    playButtonClick();
                    onAction({ type: "resolveChoice", playerId: viewerId, choice: { dieKeep: index } });
                  }
                : undefined
            }
          />
        ))}
      </div>

      <p className={styles.caption} data-outcome={throwInfo.open ? undefined : throwInfo.outcome}>
        {source && <span className={styles.source}>{source} · </span>}
        {throwInfo.choice?.candidates
          ? fromViewer
            ? "Deux dés : touche celui que tu gardes."
            : "L'adversaire choisit un dé."
          : throwInfo.open
            ? issue
              ? `${ISSUES[issue]}${fromViewer ? "" : " — le jet peut encore changer"}`
              : null
            : issue
              ? ISSUES[issue]
              : null}
      </p>

      {mine && !throwInfo.choice!.candidates && <DieControls state={state} throwInfo={throwInfo} viewerId={viewerId} onAction={onAction} />}
    </div>
  );
}

/** Les gestes encore possibles sur le jet ouvert, en pastilles sous le dé. */
function DieControls({ state, throwInfo, viewerId, onAction }: { throwInfo: DiceThrow } & TableDiceProps) {
  const choice = throwInfo.choice!;
  const options = dieRollOptions(state, choice);
  const raison = state.players.find((p) => p.id === viewerId)?.reason ?? 0;
  const repondre = (reponse: Extract<PlayerAction, { type: "resolveChoice" }>["choice"]) => {
    playButtonClick();
    onAction({ type: "resolveChoice", playerId: viewerId, choice: reponse });
  };

  return (
    <div className={styles.controls}>
      {options.reroll && (
        <button type="button" className={styles.chip} onClick={() => repondre({ dieReroll: true })}>
          Relancer
        </button>
      )}
      {options.adjusters.flatMap((unit) => {
        const nom = getCardDefinition(unit.cardId).name.split(",")[0];
        return [1, -1].map((delta) => (
          <button
            key={`${unit.instanceId}:${delta}`}
            type="button"
            className={styles.chip}
            onClick={() => repondre({ dieAdjust: { sourceInstanceId: unit.instanceId, delta } })}
          >
            {signe(delta)} <span className={styles.chipNote}>{nom}</span>
          </button>
        ));
      })}
      {options.chain.flatMap(({ card, fromHand }) => {
        const def = getCardDefinition(card.cardId);
        const cout = fromHand ? handBreakCost(def) : 0;
        const deltas = def.onBreakEffects?.find((e) => e.dieDeltas)?.dieDeltas;
        const briser = (dieDelta?: number) => {
          playButtonClick();
          onAction({
            type: "breakObject",
            playerId: viewerId,
            instanceId: card.instanceId,
            ...(fromHand ? { fromHand: true } : {}),
            ...(dieDelta !== undefined ? { dieDelta } : {}),
          });
        };
        const note = `${def.name}${cout > 0 ? ` · ${cout} R` : ""}`;
        return (deltas?.length ? deltas : [undefined]).map((delta) => (
          <button
            key={`${card.instanceId}:${delta ?? "x"}`}
            type="button"
            className={styles.chip}
            data-chain=""
            disabled={cout > raison}
            onClick={() => briser(delta)}
          >
            {delta !== undefined ? `${signe(delta)} ` : "Briser "}
            <span className={styles.chipNote}>{note}</span>
          </button>
        ));
      })}
      <button type="button" className={styles.chip} data-primary="" onClick={() => repondre({ dieResolve: true })}>
        Valider
      </button>
    </div>
  );
}

interface ThrownDieProps {
  throwKey: string;
  die: DieSize;
  face: number;
  fromViewer: boolean;
  outcome?: DieOutcome;
  onPick?: () => void;
}

/** Un dé : il vole jusqu'à sa place en tournoyant, puis montre sa face. */
function ThrownDie({ throwKey, die, face, fromViewer, outcome, onPick }: ThrownDieProps) {
  const flightRef = useRef<HTMLDivElement | null>(null);
  const [tumbling, setTumbling] = useState(!prefersReducedMotion());
  const [tick, setTick] = useState(0);
  const bodyOk = useImageOk(dieBodyUrl(die));
  const shownFace = tumbling ? 1 + Math.floor(hash(`${throwKey}:${tick}`) * die) : face;
  const faceOk = useImageOk(dieFaceUrl(die, shownFace));

  // Le vol : parti du bord de celui qui lance, une courbe, deux rebonds.
  useEffect(() => {
    const element = flightRef.current;
    if (!element || prefersReducedMotion()) return;
    const side = fromViewer ? 1 : -1;
    const startX = (hash(`${throwKey}:x`) - 0.5) * 320;
    const startY = side * window.innerHeight * 0.55;
    // Des tours COMPLETS : le dé se pose presque droit (planches vues de trois quarts), à ±15° près.
    const spin = (hash(`${throwKey}:r`) > 0.5 ? 1 : -1) * (hash(`${throwKey}:s`) > 0.5 ? 1080 : 720);
    const rest = (hash(`${throwKey}:t`) - 0.5) * 30;
    const animation = element.animate(
      [
        { transform: `translate(${startX}px, ${startY}px) scale(1.7) rotate(0deg)`, opacity: 0, offset: 0 },
        { transform: `translate(${startX * 0.55}px, ${startY * 0.35 - 90 * side}px) scale(1.45) rotate(${spin * 0.45}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(0px, 0px) scale(1) rotate(${spin * 0.85}deg)`, offset: 0.68 },
        { transform: `translate(${-startX * 0.04}px, ${-22 * side}px) scale(1.06) rotate(${spin * 0.95}deg)`, offset: 0.8 },
        { transform: `translate(0px, 0px) scale(1) rotate(${spin + rest}deg)`, offset: 0.9 },
        { transform: `translate(0px, ${-5 * side}px) scale(1.01) rotate(${spin + rest}deg)`, offset: 0.95 },
        { transform: `translate(0px, 0px) scale(1) rotate(${spin + rest}deg)`, offset: 1 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.22, 0.7, 0.3, 1)", fill: "forwards" }
    );
    return () => animation.cancel();
  }, [throwKey, fromViewer]);

  // Les faces défilent pendant le vol, puis la vraie se pose — avec le bruit du dé sur le bois.
  useEffect(() => {
    if (!tumbling) return;
    const interval = window.setInterval(() => setTick((t) => t + 1), TUMBLE_TICK_MS);
    const landing = window.setTimeout(() => {
      window.clearInterval(interval);
      setTumbling(false);
      playDiceLanded();
    }, FLIGHT_MS * 0.7);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(landing);
    };
  }, [tumbling]);

  // En vol, la face se couche et se tord à chaque tic : le dé roule sur lui-même.
  const wobble = tumbling
    ? `rotate(${(hash(`${throwKey}:w${tick}`) - 0.5) * 70}deg) scale(${0.78 + hash(`${throwKey}:a${tick}`) * 0.3}, ${0.7 + hash(`${throwKey}:b${tick}`) * 0.35}) skew(${(hash(`${throwKey}:k${tick}`) - 0.5) * 24}deg)`
    : undefined;
  const placement = DIE_FACE_PLACEMENT[die];

  const content = (
    <div className={styles.die} data-die={die} data-outcome={outcome} style={{ transform: wobble } as CSSProperties}>
      {bodyOk ? (
        // eslint-disable-next-line @next/next/no-img-element -- planche locale du dé
        <img className={styles.body} src={dieBodyUrl(die)} alt="" draggable={false} />
      ) : (
        <span className={styles.fallbackBody} data-die={die} aria-hidden />
      )}
      {bodyOk && faceOk ? (
        // eslint-disable-next-line @next/next/no-img-element -- points de la face, déformés sur le corps
        <img
          key={shownFace}
          className={`${styles.face} ${tumbling ? "" : styles.faceSettle}`}
          src={dieFaceUrl(die, shownFace)}
          alt=""
          draggable={false}
          style={{
            left: `${placement.left}%`,
            top: `${placement.top}%`,
            width: `${placement.width}%`,
            height: `${placement.height}%`,
            transform: placement.transform,
          }}
        />
      ) : bodyOk && tumbling ? null : (
        // Planche absente (ou face pas encore chargée une fois posé) : le chiffre.
        <span key={shownFace} className={`${styles.fallbackFace} ${tumbling ? "" : styles.faceSettle}`}>
          {shownFace}
        </span>
      )}
    </div>
  );

  return (
    <div className={styles.flight} ref={flightRef}>
      <span className={styles.shadow} aria-hidden />
      {onPick ? (
        <button type="button" className={styles.pick} onClick={onPick} aria-label={`Garder ${face}`}>
          {content}
        </button>
      ) : (
        <div className={styles.holder} role="img" aria-label={`D${die} : ${face}`}>
          {content}
        </div>
      )}
    </div>
  );
}
