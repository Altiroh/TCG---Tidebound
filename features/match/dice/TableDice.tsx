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
import { axisAngle, eulerMatrix, multiply, placeFaces, restMatrix, rollPath, rotate, slerp, toCss, type Mat4 } from "@/features/match/dice/polyhedra";
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

  // La légende suit le dé : au premier lancer, quand il est posé ; après un
  // ajustement, quand il est retombé sur sa nouvelle face.
  const valeurInitiale = useRef<{ key: string; faces: string } | null>(null);
  const faces = throwInfo.faces.join(",");
  if (valeurInitiale.current?.key !== throwInfo.key) valeurInitiale.current = { key: throwInfo.key, faces };
  const ajuste = valeurInitiale.current.faces !== faces;

  if (!spot) return null;
  const mine = fromViewer && throwInfo.open && throwInfo.choice;
  const issue = throwInfo.outcome ?? (throwInfo.choice && throwInfo.choice.value !== undefined ? dieOutcomeOf(throwInfo.choice, throwInfo.choice.value) : undefined);
  const source = throwInfo.cardId ? getCardDefinition(throwInfo.cardId).name.split(",")[0] : null;

  return (
    <div className={styles.spot} style={{ left: spot.x, top: spot.y, "--settle": `${settleMs(throwInfo.die)}ms` } as CSSProperties} aria-live="polite">
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

      <p
        key={`${throwInfo.key}:${faces}`}
        className={styles.caption}
        data-outcome={throwInfo.open ? undefined : throwInfo.outcome}
        style={ajuste ? { animationDelay: `${Math.round(ADJUST_MS * 0.9)}ms` } : undefined}
      >
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

  // Le temps écoulé, le jet est VALIDÉ tel quel — jamais une partie bloquée
  // sur une décision facultative. Le compte repart à chaque changement du jet
  // (+1, Chaîne, relance), et attend que le dé soit posé.
  const etat = `${throwInfo.key}:${choice.value ?? ""}:${throwInfo.faces.join(",")}`;
  const delai = settleMs(throwInfo.die);
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  useEffect(() => {
    const timer = window.setTimeout(
      () => actionRef.current({ type: "resolveChoice", playerId: viewerId, choice: { dieResolve: true } }),
      delai + DIE_DECISION_MS
    );
    return () => window.clearTimeout(timer);
  }, [etat, delai, viewerId]);

  return (
    <div className={styles.controls}>
      <div className={styles.controlsRow}>
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
      <div className={styles.countdown} aria-hidden>
        <div
          key={etat}
          className={`reaction-countdown-fill ${styles.countdownFill}`}
          style={{ animationDuration: `${DIE_DECISION_MS}ms`, animationDelay: `${delai}ms` }}
        />
      </div>
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
/** Changement de valeur (+1, Chaîne) : le dé se lève, tremble, change de face, se repose. */
const ADJUST_MS = 820;
/** Temps laissé pour ajuster le jet (relancer, ±1, Chaîne) avant qu'il soit validé tel quel. */
const DIE_DECISION_MS = 15_000;
/** Hauteur (px) à laquelle le dé se lève pour changer de face. */
const ADJUST_LIFT = 46;

/** Temps que met un dé lancé à se poser : la légende et les gestes attendent qu'il soit immobile. */
function settleMs(die: DieSize): number {
  const geste = LANCER[die];
  return geste.airMs + geste.rollMs.slice(0, geste.rolls).reduce((a, b) => a + b, 0) + geste.wobbleMs;
}

function dieSizePx(): number {
  return typeof window === "undefined" ? 96 : Math.round(Math.min(124, Math.max(72, window.innerWidth * 0.08)));
}

/** `cubic-bezier(x1, y1, x2, y2)` pour un avancement 0 → 1 (par dichotomie). */
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

const ROLL_EASING = bezier(0.3, 0.7, 0.3, 1);

/**
 * LA MANIÈRE DE CHAQUE SOLIDE, une fois sur la table.
 *  - D6 : un quart de tour par bascule ; il rebondit franchement et roule
 *    deux ou trois fois, puis se cale d'un léger balancement.
 *  - D4 : pointu et lourd, il se PLANTE : un petit rebond, une seule bascule
 *    (109,5°, lourde), et il oscille sur sa base avant de s'immobiliser.
 *  - D8 : presque rond, il ROULE loin, en petites bascules de 70,5° de plus
 *    en plus lentes, sans presque rebondir.
 * `pivot` : de combien son centre se soulève en passant par-dessus l'arête.
 */
const LANCER: Record<DieSize, { airMs: number; spinTurns: number; rolls: number; rollMs: number[]; hops: number[]; pivot: number; wobbleDeg: number; wobbleMs: number }> = {
  6: { airMs: 520, spinTurns: 1.25, rolls: 3, rollMs: [200, 240, 330], hops: [34, 10, 0], pivot: 0.2, wobbleDeg: 3, wobbleMs: 280 },
  4: { airMs: 480, spinTurns: 0.85, rolls: 1, rollMs: [330], hops: [12], pivot: 0.1, wobbleDeg: 8, wobbleMs: 460 },
  8: { airMs: 520, spinTurns: 1.25, rolls: 5, rollMs: [140, 155, 175, 210, 290], hops: [20, 6, 0, 0, 0], pivot: 0.1, wobbleDeg: 2, wobbleMs: 220 },
};

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
  const liftRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLSpanElement | null>(null);
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

  // Le lancer : le dé tombe sur la table en tournoyant, touche, puis BASCULE
  // d'arête en arête (`rollPath`) jusqu'à la face obtenue — à la manière de
  // son solide (`LANCER`). Calculé à rebours : il finit exactement au repos.
  useEffect(() => {
    const flight = flightRef.current;
    const lift = liftRef.current;
    const shadow = shadowRef.current;
    const final = restMatrix(die, face, tilt);
    if (!flight || !lift || !shadow || prefersReducedMotion()) {
      draw(final);
      return;
    }
    const geste = LANCER[die];
    const side = fromViewer ? 1 : -1;
    let tirage = 0;
    const random = () => hash(`${throwKey}:r${tirage++}`);
    const lateral = (random() - 0.5) * 0.7;
    const throwDir: [number, number] = [lateral / Math.hypot(lateral, 1), -side / Math.hypot(lateral, 1)];
    const path = rollPath(die, face, tilt, geste.rolls, throwDir, random);

    // Positions au sol, à rebours depuis le point de chute final (0, 0).
    const points: [number, number][] = [[0, 0]];
    for (let k = path.steps.length - 1; k >= 0; k--) {
      const step = path.steps[k]!;
      const [x, y] = points[0]!;
      points.unshift([x - step.dir[0] * step.distance * edge, y - step.dir[1] * step.distance * edge]);
    }

    type Pose = { o: Mat4; x: number; y: number; h: number; opacity?: number };
    const segments: { ms: number; at: (t: number) => Pose }[] = [];
    // 1. La chute : il arrive de chez celui qui lance, haut, et tournoie autour
    //    de l'axe de sa première bascule — l'élan passe tel quel dans le roulement.
    const first = path.steps[0];
    const spinAxis = first?.axis ?? ([1, 0, 0] as const);
    const spinSign = first ? Math.sign(first.angle) : 1;
    const [x0, y0] = points[0]!;
    const fromX = x0 - throwDir[0] * window.innerHeight * 0.5;
    const fromY = y0 - throwDir[1] * window.innerHeight * 0.5;
    segments.push({
      ms: geste.airMs,
      at: (t) => ({
        o: multiply(path.orientations[0]!, axisAngle(spinAxis, -spinSign * geste.spinTurns * 2 * Math.PI * (1 - t))),
        x: fromX + (x0 - fromX) * (1 - (1 - t) ** 1.6),
        y: fromY + (y0 - fromY) * (1 - (1 - t) ** 1.6),
        h: 150 * (1 - t * t),
        opacity: Math.min(1, t * 4),
      }),
    });
    // 2. Les bascules, chacune autour de l'arête commune, avec le rebond qui s'éteint.
    path.steps.forEach((step, k) => {
      const [ax, ay] = points[k]!;
      const [bx, by] = points[k + 1]!;
      const hop = geste.hops[k] ?? 0;
      segments.push({
        ms: geste.rollMs[k] ?? geste.rollMs[geste.rollMs.length - 1]!,
        at: (t) => {
          const e = k === path.steps.length - 1 ? 1 - (1 - t) ** 2 : t;
          return {
            o: multiply(path.orientations[k]!, axisAngle(step.axis, step.angle * e)),
            x: ax + (bx - ax) * e,
            y: ay + (by - ay) * e,
            h: hop * Math.sin(Math.PI * t) + edge * geste.pivot * Math.sin(Math.PI * e),
          };
        },
      });
    });
    // 3. Il se cale : un balancement sur sa dernière arête, qui s'amortit.
    const last = path.steps[path.steps.length - 1];
    segments.push({
      ms: geste.wobbleMs,
      at: (t) => ({
        o: last ? multiply(final, axisAngle(last.axis, -Math.sign(last.angle) * ((geste.wobbleDeg * Math.PI) / 180) * Math.sin(Math.PI * 2 * 1.5 * t) * (1 - t))) : final,
        x: 0,
        y: 0,
        h: 0,
      }),
    });

    const apply = (pose: Pose) => {
      draw(pose.o);
      flight.style.transform = `translate(${pose.x.toFixed(1)}px, ${pose.y.toFixed(1)}px)`;
      flight.style.opacity = `${pose.opacity ?? 1}`;
      lift.style.transform = `translate(0px, ${(-pose.h * 0.55).toFixed(1)}px) scale(${(1 + pose.h / 420).toFixed(3)})`;
      shadow.style.transform = `translate(${(pose.h * 0.25).toFixed(1)}px, ${(pose.h * 0.35).toFixed(1)}px) scale(${Math.max(0.45, 1 - pose.h / 260).toFixed(3)})`;
      shadow.style.opacity = `${Math.max(0.15, 1 - pose.h / 170).toFixed(2)}`;
    };
    const total = segments.reduce((sum, seg) => sum + seg.ms, 0);
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      let elapsed = Math.min(total, now - t0);
      for (const seg of segments) {
        if (elapsed <= seg.ms || seg === segments[segments.length - 1]) {
          apply(seg.at(Math.min(1, elapsed / seg.ms)));
          break;
        }
        elapsed -= seg.ms;
      }
      if (now - t0 < total) frame = requestAnimationFrame(step);
    };
    step(t0);
    const clac = window.setTimeout(playDiceLanded, geste.airMs);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(clac);
      flight.style.transform = "";
      flight.style.opacity = "";
      lift.style.transform = "";
      shadow.style.transform = "";
      shadow.style.opacity = "";
    };
    // Le lancer ne se rejoue qu'à un NOUVEAU jet ; un ajustement de la face roule (effet suivant).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwKey, fromViewer, draw]);

  // Un ajustement change la valeur (+1, Chaîne) : le dé SE LÈVE, tremble dans
  // la main invisible, présente la nouvelle face en l'air, puis se repose.
  // On compare la VALEUR : un effet rejoué (mode strict) ne doit pas figer le
  // dé sur sa pose de repos pendant qu'il roule encore.
  const faceRef = useRef(face);
  useEffect(() => {
    if (faceRef.current === face) return;
    faceRef.current = face;
    const from = shownRef.current;
    const lift = liftRef.current;
    const shadow = shadowRef.current;
    if (prefersReducedMotion() || !lift || !shadow) {
      draw(rest);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ADJUST_MS);
      // Hauteur : monte (0 → 25 %), reste en l'air, redescend (75 → 100 %) avec un petit rebond.
      const h = k < 0.25 ? ADJUST_LIFT * ROLL_EASING(k / 0.25) : k < 0.75 ? ADJUST_LIFT : k < 0.92 ? ADJUST_LIFT * (1 - ((k - 0.75) / 0.17) ** 2) : ADJUST_LIFT * 0.12 * Math.sin((Math.PI * (k - 0.92)) / 0.08);
      // Tremblement : vif en l'air, éteint à l'atterrissage.
      const force = k < 0.8 ? Math.sin(Math.PI * Math.min(1, k / 0.8)) : 0;
      const shake = eulerMatrix(Math.sin(now / 23) * 11 * force, Math.sin(now / 31 + 1) * 9 * force, Math.sin(now / 19 + 2) * 7 * force);
      // La nouvelle face se présente pendant qu'il est en l'air.
      const turn = ROLL_EASING(Math.min(1, Math.max(0, (k - 0.2) / 0.45)));
      draw(multiply(shake, slerp(from, rest, turn)));
      lift.style.transform = `translate(0px, ${(-h * 0.55).toFixed(1)}px) scale(${(1 + h / 420).toFixed(3)})`;
      shadow.style.transform = `translate(${(h * 0.25).toFixed(1)}px, ${(h * 0.35).toFixed(1)}px) scale(${Math.max(0.45, 1 - h / 260).toFixed(3)})`;
      shadow.style.opacity = `${Math.max(0.15, 1 - h / 170).toFixed(2)}`;
      if (k < 1) frame = requestAnimationFrame(step);
      else draw(rest);
    };
    frame = requestAnimationFrame(step);
    const clac = window.setTimeout(playDiceLanded, ADJUST_MS * 0.9);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(clac);
      draw(rest);
      lift.style.transform = "";
      shadow.style.transform = "";
      shadow.style.opacity = "";
    };
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
      <span className={styles.shadow} ref={shadowRef} aria-hidden />
      <div className={styles.lift} ref={liftRef}>
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
    </div>
  );
}
