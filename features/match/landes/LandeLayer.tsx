"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ActiveLande } from "@/game";
import { createLandeFx, type LandeFx, type LandeFxLayer, type LandeLayout, type LandeRect, type LandeSprites } from "@/features/match/landes/landeFx";
import { LandeProps } from "@/features/match/landes/LandeProps";
import { landeAsset, landeScene, type LandeLayer as SceneLayer } from "@/features/match/landes/landeScenes";
import styles from "@/features/match/landes/Landes.module.css";

/** Durée du fondu de sortie d'une Lande qui expire ou qu'une autre chasse. */
const LEAVE_MS = 1100;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

interface LandeLayerProps {
  lande: ActiveLande | undefined;
  /**
   * La Lande vient d'être jouée sous les yeux du joueur : sa scène attend
   * que la carte se soit dissoute (`LandeArrival`) pour apparaître. Faux au
   * chargement d'une partie en cours : la scène est là d'emblée.
   */
  entering: boolean;
  /** Délai d'apparition pendant une arrivée — la fin de la dissolution. */
  enterDelayMs: number;
}

/**
 * ENVIRONNEMENT d'une Lande : teinte, effet animé et calques illustrés,
 * posés SOUS les cartes (entre la mer et le plateau, comme la pluie de
 * Marée). Une Lande qui part s'efface en fondu ; la suivante apparaît
 * par-dessus.
 */
export function LandeLayer({ lande, entering, enterDelayMs }: LandeLayerProps) {
  const [leaving, setLeaving] = useState<ActiveLande[]>([]);
  const previous = useRef<ActiveLande | undefined>(lande);

  useEffect(() => {
    const before = previous.current;
    previous.current = lande;
    if (!before || before.instanceId === lande?.instanceId) return;
    setLeaving((list) => [...list, before]);
    const timer = window.setTimeout(() => setLeaving((list) => list.filter((l) => l.instanceId !== before.instanceId)), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [lande]);

  return (
    <>
      <div aria-hidden className={styles.landeHost}>
        {leaving.map((old) => (
          <LandeScene key={old.instanceId} lande={old} state="leaving" delayMs={0} layer="back" />
        ))}
        {lande && <LandeScene key={lande.instanceId} lande={lande} state={entering ? "entering" : "shown"} delayMs={entering ? enterDelayMs : 0} layer="back" />}
      </div>
      {/* Devant les rangées : ce qui PERCE le plateau (bords des cadres seulement). */}
      <div aria-hidden className={styles.landeFrontHost}>
        {leaving
          .filter((old) => landeScene(old.cardId).frontFx)
          .map((old) => (
            <LandeScene key={old.instanceId} lande={old} state="leaving" delayMs={0} layer="front" />
          ))}
        {lande && landeScene(lande.cardId).frontFx && (
          <LandeScene key={lande.instanceId} lande={lande} state={entering ? "entering" : "shown"} delayMs={entering ? enterDelayMs : 0} layer="front" />
        )}
      </div>
    </>
  );
}

function LandeScene({ lande, state, delayMs, layer }: { lande: ActiveLande; state: "entering" | "shown" | "leaving"; delayMs: number; layer: LandeFxLayer }) {
  const scene = landeScene(lande.cardId);
  // L'entrée se décide une fois, au montage : la fin de l'arrivée ne doit
  // pas relancer le fondu d'une scène déjà installée.
  const [entry] = useState({ state, delayMs });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<LandeFx | null>(null);
  const spritesRef = useRef<LandeSprites>({ pieces: [], debris: [], anchors: [] });
  const [pulse, setPulse] = useState(0);
  const runFx = Boolean(scene.fx);
  const sprites = useLandeSprites(lande.cardId);

  // Les pièces arrivent après l'effet : il les reprend dès qu'elles sont là.
  useEffect(() => {
    spritesRef.current = sprites;
    fxRef.current?.setSprites(sprites);
  }, [sprites]);

  // Effet animé : un canvas à la densité de l'écran (plafonnée à 2), une
  // boucle d'images qui s'arrête d'elle-même quand l'onglet est caché.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!runFx || !canvas || !scene.fx) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fx = createLandeFx(scene.fx, ctx, scene.rgb, scene.rgbHot, layer);
    fx.setSprites(spritesRef.current);
    fxRef.current = fx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      fx.resize(canvas.width, canvas.height);
      fx.setLayout?.(boardLayout(canvas, dpr));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    // Les rangées se posent après la scène (polices, images) : on relit leur place un peu plus tard.
    const relire = window.setTimeout(() => fx.setLayout?.(boardLayout(canvas, dpr)), 600);

    if (prefersReducedMotion()) {
      // Une image posée, sans mouvement : la scène se reconnaît quand même.
      for (let i = 0; i < 90; i++) fx.step(1 / 30);
      return () => {
        observer.disconnect();
        window.clearTimeout(relire);
      };
    }
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      fx.step(Math.min(0.05, (now - last) / 1000));
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearTimeout(relire);
      fxRef.current = null;
    };
  }, [runFx, scene, layer]);

  // Un tour de table de la Lande qui s'achève : temps fort (fissures,
  // cadenas, averse). Le décompte retombe alors sur un nombre pair.
  const remaining = useRef(lande.remainingPlayerTurns);
  useEffect(() => {
    const before = remaining.current;
    remaining.current = lande.remainingPlayerTurns;
    if (lande.remainingPlayerTurns < before && lande.remainingPlayerTurns % 2 === 0) {
      fxRef.current?.pulse();
      setPulse((n) => n + 1);
    }
  }, [lande.remainingPlayerTurns]);

  return (
    <div
      className={styles.landeScene}
      data-state={state === "leaving" ? "leaving" : entry.state}
      style={{ "--lande-delay": `${entry.delayMs}ms`, "--lande-rgb": scene.rgb } as CSSProperties}
    >
      {layer === "back" && <div className={styles.landeTint} style={{ background: scene.tint }} />}
      {scene.props && <LandeProps cardId={lande.cardId} props={scene.props} layer={layer} />}
      {scene.fx && <canvas ref={canvasRef} className={styles.landeCanvas} data-off={runFx ? undefined : ""} />}
      {layer === "back" &&
        (scene.layers ?? []).map((edge) => <SceneLayerImage key={edge.file} cardId={lande.cardId} layer={edge} />)}
      {layer === "back" && scene.pulseLayer && pulse > 0 && (
        // eslint-disable-next-line @next/next/no-img-element -- calque local optionnel
        <img
          key={pulse}
          src={landeAsset(lande.cardId, scene.pulseLayer)}
          alt=""
          className={styles.landePulse}
          onError={(event) => (event.currentTarget.style.display = "none")}
        />
      )}
    </div>
  );
}

/**
 * Place des rangées du plateau, en pixels du canvas : les pics de verre ne
 * poussent que là où il y a un sol (bande de mer, bureau, rebord adverse).
 */
function boardLayout(canvas: HTMLCanvasElement, dpr: number): LandeLayout {
  const host = canvas.getBoundingClientRect();
  const rect = (zone: string): LandeRect | undefined => {
    const el = canvas.ownerDocument.querySelector(`[data-zone="${zone}"]`);
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return undefined;
    return { left: (r.left - host.left) * dpr, top: (r.top - host.top) * dpr, right: (r.right - host.left) * dpr, bottom: (r.bottom - host.top) * dpr };
  };
  return { opponent: rect("OpponentZone"), center: rect("CenterZone"), player: rect("PlayerZone") };
}

/**
 * Charge les pièces illustrées de la Lande (`sprites`, `debris`, `anchors`).
 * Un fichier absent est ignoré sans bruit : l'effet dessine les siennes.
 */
function useLandeSprites(cardId: string): LandeSprites {
  const [sprites, setSprites] = useState<LandeSprites>({ pieces: [], debris: [], anchors: [] });
  useEffect(() => {
    const scene = landeScene(cardId);
    let alive = true;
    const load = (file: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = landeAsset(cardId, file);
      });
    const present = (list: (HTMLImageElement | null)[]) => list.filter((img): img is HTMLImageElement => img !== null);
    void Promise.all([
      Promise.all((scene.sprites ?? []).map(load)),
      Promise.all((scene.debris ?? []).map(load)),
      Promise.all((scene.anchors ?? []).map(load)),
    ]).then(([pieces, debris, anchors]) => {
      if (!alive) return;
      setSprites({ pieces: present(pieces), debris: present(debris), anchors: present(anchors) });
    });
    return () => {
      alive = false;
    };
  }, [cardId]);
  return sprites;
}

/** Calque illustré d'un bord : invisible tant qu'il n'a pas chargé, absent s'il n'existe pas. */
function SceneLayerImage({ cardId, layer }: { cardId: string; layer: SceneLayer }) {
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  if (state === "missing") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- calque local optionnel
    <img
      src={landeAsset(cardId, layer.file)}
      alt=""
      draggable={false}
      className={styles.landeEdge}
      data-edge={layer.edge}
      data-sway={layer.sway ? "" : undefined}
      data-ready={state === "ok" ? "" : undefined}
      style={{ "--edge-size": `${layer.size ?? 30}%`, "--edge-opacity": layer.opacity ?? 1 } as CSSProperties}
      onLoad={() => setState("ok")}
      onError={() => setState("missing")}
    />
  );
}
