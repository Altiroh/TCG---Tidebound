"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { dieFaceUrl, dieTextureFit, dieTextureUrl } from "@/features/match/dice/diceAssets";
import { eulerMatrix, multiply, placeFaces, restMatrix, rotate, slerp, toCss, type Mat4 } from "@/features/match/dice/polyhedra";
import { useDiceThrow, type DiceThrow } from "@/features/match/dice/useDiceThrow";
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
 * table en tournoyant sur lui-même (un vrai solide, en CSS 3D), rebondit et
 * se pose, la face obtenue tournée vers le joueur. Le résultat s'éclaire ; un jet fermé
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
      void loadImageStatus(dieTextureUrl(die));
      for (let value = 1; value <= die; value++) void loadImageStatus(dieFaceUrl(die, value));
    }
  }, []);
  if (!mounted || !current) return null;
  return createPortal(<DiceOnTable throwInfo={current} state={state} viewerId={viewerId} onAction={onAction} />, document.body);
}

function DiceOnTable({ throwInfo, state, viewerId, onAction }: { throwInfo: DiceThrow } & TableDiceProps) {
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const fromViewer = throwInfo.rollerId === viewerId;

  useLayoutEffect(() => {
    // Au CENTRE de l'écran, à peine décalé d'un jet à l'autre : c'est là que le regard est.
    const cx = window.innerWidth / 2 + (hash(throwInfo.key) - 0.5) * window.innerWidth * 0.06;
    const cy = window.innerHeight * 0.47;
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
        {!throwInfo.choice?.candidates && throwInfo.faces.length === 1 && issue && <strong className={styles.value}>{throwInfo.faces[0]} · </strong>}
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

/** Arête du solide, en fraction de la taille du dé à l'écran : un cube incliné paraît plus grand que son arête. */
const EDGE_RATIO: Record<DieSize, number> = { 4: 0.98, 6: 0.6, 8: 0.74 };
/**
 * Inclinaison au repos : la face obtenue reste face au joueur, on voit juste
 * le volume autour. Plus douce sur le D4 et le D8, dont les faces voisines
 * sont très pentues et voleraient la vedette à la face obtenue.
 */
const TILT: Record<DieSize, { x: number; y: number }> = { 4: { x: -10, y: 12 }, 6: { x: -16, y: 20 }, 8: { x: -8, y: 10 } };
/** D'où vient la lumière (haut gauche, devant) : chaque face s'éclaire selon sa pente. */
const LIGHT: readonly [number, number, number] = (() => {
  const v = [-0.35, -0.6, 0.72];
  const n = Math.hypot(...v);
  return [v[0]! / n, v[1]! / n, v[2]! / n];
})();
/** Durée du roulis vers une nouvelle face, quand un ajustement change le jet. */
const ROLL_MS = 450;

function dieSizePx(): number {
  return typeof window === "undefined" ? 96 : Math.round(Math.min(124, Math.max(72, window.innerWidth * 0.08)));
}

/** `cubic-bezier(x1, y1, x2, y2)` pour un avancement 0 → 1 (Newton, puis dichotomie). */
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, u: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  return (t) => {
    let lo = 0;
    let hi = 1;
    let u = t;
    for (let i = 0; i < 20; i++) {
      const x = at(x1, x2, u);
      if (Math.abs(x - t) < 1e-4) break;
      if (x < t) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return at(y1, y2, u);
  };
}

/** Amorti du tournoiement : encore vif à l'atterrissage, puis il se pose. */
const SPIN_EASING = bezier(0.3, 0.35, 0.45, 1);
const ROLL_EASING = bezier(0.3, 0.7, 0.3, 1);

/**
 * Un dé EN VOLUME : il vole jusqu'à sa place en tournoyant sur ses trois axes,
 * puis s'arrête la face obtenue tournée vers le joueur. Un ajustement du jet
 * (+1, Chaîne) fait rouler le dé jusqu'à la nouvelle face.
 *
 * Chaque tuile reçoit sa matrice FINALE (repos · roulis · face), recalculée à
 * chaque image : pas de `preserve-3d`, qui rendait les faces floues sur les
 * écrans denses. Le solide est convexe et ses faces de dos sont masquées
 * (`backface-visibility`) : les faces vues ne se chevauchent jamais, l'ordre
 * du DOM suffit.
 */
function ThrownDie({ throwKey, die, face, fromViewer, outcome, onPick }: ThrownDieProps) {
  const flightRef = useRef<HTMLDivElement | null>(null);
  const faceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [size] = useState(dieSizePx);
  const edge = Math.round(size * EDGE_RATIO[die]);
  const faces = useMemo(() => placeFaces(die, edge), [die, edge]);
  const tilt = useMemo(() => ({ x: TILT[die].x, y: (hash(`${throwKey}:y`) > 0.5 ? 1 : -1) * TILT[die].y }), [throwKey, die]);
  const rest = useMemo(() => restMatrix(die, face, tilt), [die, face, tilt]);
  /** Orientation affichée en ce moment (point de départ d'un roulis vers une nouvelle face). */
  const shownRef = useRef<Mat4>(rest);

  const draw = useCallback(
    (orientation: Mat4) => {
      shownRef.current = orientation;
      faces.forEach((placed, index) => {
        const el = faceRefs.current[index];
        if (!el) return;
        const n = rotate(orientation, placed.normal);
        const lumiere = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        el.style.transform = toCss(multiply(orientation, placed.matrix));
        // Éclairage par un voile (ombre ou reflet), jamais par `filter` : un
        // filtre sur une tuile transformée en 3D la rastérise à ×1, donc floue.
        const clarte = 0.55 + 0.55 * lumiere;
        const voile = el.lastElementChild as SVGElement | null;
        if (voile) voile.style.fill = clarte < 1 ? `rgba(8, 4, 2, ${(1 - clarte).toFixed(2)})` : `rgba(255, 244, 220, ${((clarte - 1) * 0.6).toFixed(2)})`;
      });
    },
    [faces]
  );

  // Le vol : parti du bord de celui qui lance, une courbe, deux rebonds — et le dé qui roule sur lui-même.
  useEffect(() => {
    const flight = flightRef.current;
    const final = restMatrix(die, face, tilt);
    if (!flight || prefersReducedMotion()) {
      draw(final);
      return;
    }
    const side = fromViewer ? 1 : -1;
    const startX = (hash(`${throwKey}:x`) - 0.5) * 320;
    const startY = side * window.innerHeight * 0.55;
    const vol = flight.animate(
      [
        { transform: `translate(${startX}px, ${startY}px) scale(1.6)`, opacity: 0, offset: 0 },
        { transform: `translate(${startX * 0.55}px, ${startY * 0.35 - 90 * side}px) scale(1.4)`, opacity: 1, offset: 0.35 },
        { transform: "translate(0px, 0px) scale(1)", offset: 0.68 },
        { transform: `translate(${-startX * 0.04}px, ${-22 * side}px) scale(1.05)`, offset: 0.8 },
        { transform: "translate(0px, 0px) scale(1)", offset: 0.9 },
        { transform: `translate(0px, ${-5 * side}px) scale(1.01)`, offset: 0.95 },
        { transform: "translate(0px, 0px) scale(1)", offset: 1 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.22, 0.7, 0.3, 1)", fill: "forwards" }
    );
    // Des tours entiers sur les trois axes, qui s'amortissent jusqu'à la face obtenue.
    const tour = (k: string) => (hash(`${throwKey}:${k}`) > 0.5 ? 1 : -1) * (2 + Math.floor(hash(`${throwKey}:${k}n`) * 2)) * 360;
    const [rx, ry, rz] = [tour("rx"), tour("ry"), tour("rz") / 2];
    const duree = FLIGHT_MS;
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duree);
      const reste = 1 - SPIN_EASING(k);
      draw(multiply(final, eulerMatrix(rx * reste, ry * reste, rz * reste)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    step(t0);
    const clac = window.setTimeout(playDiceLanded, FLIGHT_MS * 0.68);
    return () => {
      vol.cancel();
      cancelAnimationFrame(frame);
      window.clearTimeout(clac);
    };
    // Le vol ne se rejoue qu'à un NOUVEAU jet ; un ajustement de la face roule (effet suivant).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwKey, fromViewer, draw]);

  // Un ajustement change la face : le dé roule de son orientation actuelle vers la nouvelle.
  // On compare la VALEUR : un effet rejoué (mode strict) ne doit pas figer le
  // dé sur sa pose de repos pendant qu'il tournoie encore.
  const faceRef = useRef(face);
  useEffect(() => {
    if (faceRef.current === face) return;
    faceRef.current = face;
    const from = shownRef.current;
    if (prefersReducedMotion()) {
      draw(rest);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ROLL_MS);
      draw(slerp(from, rest, ROLL_EASING(k)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [face, rest, draw]);

  const content = (
    <div className={styles.die} data-die={die} data-outcome={outcome} style={{ "--die": `${size}px` } as CSSProperties}>
      <div className={styles.scene}>
        {faces.map((placed, index) => (
          <div
            key={placed.value}
            ref={(el) => {
              faceRefs.current[index] = el;
            }}
            className={styles.face}
            data-shape={placed.shape}
            data-result={placed.value === face ? "" : undefined}
            style={
              {
                width: placed.width,
                height: placed.height,
                transform: toCss(multiply(shownRef.current, placed.matrix)),
                backgroundImage: `url(${dieTextureUrl(die)})`,
                ...dieTextureFit(die, placed.width, placed.height),
              } as CSSProperties
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- points de la face, planche locale */}
            <img className={styles.pips} src={dieFaceUrl(die, placed.value)} alt="" draggable={false} />
            <svg className={styles.shade} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <polygon points={placed.shape === "triangle" ? "50,0 0,100 100,100" : "0,0 100,0 100,100 0,100"} />
            </svg>
          </div>
        ))}
      </div>
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
