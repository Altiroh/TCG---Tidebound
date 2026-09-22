"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Gestes de table du laboratoire, sur Pointer Events.
 *
 * Pointer Events plutôt que le glisser-déposer HTML natif de `MatchBoard` :
 * le natif ne fonctionne pas au doigt (le mobile paysage est une cible du
 * board), impose son image fantôme et ne se stylise pas. Ici un seul code
 * sert la souris, le stylet et le tactile.
 *
 * Trois gestes, selon ce qu'on attrape :
 *   - `place` : une carte de main sans cible → la carte suit le pointeur ;
 *   - `cast`  : une carte de main qui demande une cible (Équipement) → trait ;
 *   - `aim`   : une carte du plateau → trait. C'est la zone relâchée qui
 *     décide : cible adverse = attaque, crâne = Sabordage (comme l'ancien
 *     board, un seul geste « prendre la carte »).
 *
 * Une carte du plateau peut aussi s'ARMER d'un toucher (si `canArm`), puis
 * désigner sa cible d'un second toucher — le ciblage ne dépend donc pas
 * d'un glisser précis. Toucher ailleurs ou Échap désarme.
 *
 * Lire une carte (`onInspect`) :
 *   - appui long (souris comme doigt) sur n'importe quelle carte — il ne se
 *     déclenche que si le pointeur n'a pas bougé : un glisser l'annule ;
 *   - au doigt, un simple toucher qu'aucun autre usage ne réclame.
 *
 * Un toucher peut aussi être réclamé par la page (`onTap`, ex. choisir la
 * cible d'un effet en attente, jouer une carte d'un clic) : il passe avant
 * l'armement et la lecture.
 *
 * Ce hook ne connaît AUCUNE règle : il lit les zones de dépôt du DOM
 * (`data-drop`), demande à la page si elles sont valides (`isValidDrop`) et
 * lui rend la main au relâché (`onDrop`). La couche de glisser (`DragLayer`)
 * doit rester en `pointer-events: none` : le test lit ce qu'il y a SOUS le
 * pointeur.
 */

/** Distance (px) en deçà de laquelle un appui reste un toucher, pas un glisser. */
const DRAG_THRESHOLD = 6;

/** Durée (ms) d'un appui long. */
const LONG_PRESS_MS = 450;

/** `inspect` : carte qu'on ne prend pas (adverse) — seulement lisible au doigt. */
export type GestureKind = "place" | "cast" | "aim" | "inspect";

export interface GestureOrigin {
  /** Centre de la carte source, coordonnées viewport. */
  x: number;
  y: number;
  /** Largeur de mise en page (hors rotation de l'éventail) — taille du fantôme. */
  width: number;
}

export interface Gesture {
  kind: GestureKind;
  sourceId: string;
  origin: GestureOrigin;
  pointer: { x: number; y: number };
  /** Armée d'un toucher (et non en cours de glisser). */
  armed: boolean;
}

interface Pending {
  kind: GestureKind;
  sourceId: string;
  origin: GestureOrigin;
  startX: number;
  startY: number;
  started: boolean;
  /** Tactile ou stylet : l'appui long et le toucher-pour-lire s'appliquent. */
  touch: boolean;
}

interface Options {
  isValidDrop: (kind: GestureKind, sourceId: string, drop: string) => boolean;
  /** `point` : où le pointeur a été relâché (sert à faire partir la carte posée de là). */
  onDrop: (kind: GestureKind, sourceId: string, drop: string, point: { x: number; y: number }) => void;
  /** Un toucher sur cette carte l'arme-t-il ? (unités capables d'attaquer) */
  canArm: (sourceId: string) => boolean;
  /** Poser la carte en grand par-dessus le plateau (appui long, ou toucher sans autre effet). */
  onInspect: (sourceId: string) => void;
  /** Toucher / clic simple : `true` = la page l'a traité, rien d'autre ne se passe. */
  onTap?: (kind: GestureKind, sourceId: string) => boolean;
}

/** Toutes les zones `data-drop` sous le point, de la plus proche à la plus englobante. */
function dropsAt(x: number, y: number): string[] {
  const drops: string[] = [];
  for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
    const drop = el.getAttribute("data-drop");
    if (drop) drops.push(drop);
  }
  return drops;
}

export function useTableGestures({ isValidDrop, onDrop, canArm, onInspect, onTap }: Options) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  /** Zone `data-drop` survolée ET valide pour le geste en cours. */
  const [hover, setHover] = useState<string | null>(null);

  const pending = useRef<Pending | null>(null);
  const longPress = useRef<number | null>(null);
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;
  const optionsRef = useRef({ isValidDrop, onDrop, canArm, onInspect, onTap });
  optionsRef.current = { isValidDrop, onDrop, canArm, onInspect, onTap };

  const clearLongPress = useCallback(() => {
    if (longPress.current !== null) window.clearTimeout(longPress.current);
    longPress.current = null;
  }, []);

  const end = useCallback(() => {
    clearLongPress();
    pending.current = null;
    setGesture(null);
    setHover(null);
  }, [clearLongPress]);

  useEffect(() => {
    /** Zone valide la plus proche sous le point — une carte posée sur le plateau n'empêche pas de viser le plateau. */
    function validDropAt(kind: GestureKind, sourceId: string, x: number, y: number): string | null {
      return dropsAt(x, y).find((drop) => optionsRef.current.isValidDrop(kind, sourceId, drop)) ?? null;
    }

    function onMove(e: PointerEvent) {
      const p = pending.current;
      if (p && p.kind !== "inspect" && !p.started && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > DRAG_THRESHOLD) {
        clearLongPress();
        p.started = true;
        setGesture({ kind: p.kind, sourceId: p.sourceId, origin: p.origin, pointer: { x: e.clientX, y: e.clientY }, armed: false });
      }
      const active = p?.started ? p : gestureRef.current?.armed ? gestureRef.current : null;
      if (!active) return;
      const next = validDropAt(active.kind, active.sourceId, e.clientX, e.clientY);
      setHover((current) => (current === next ? current : next));
    }

    function onUp(e: PointerEvent) {
      const p = pending.current;
      clearLongPress();
      if (!p) return;
      pending.current = null;

      if (!p.started) {
        // Simple toucher : la page d'abord, puis une unité s'arme (ou se
        // désarme si elle l'était) ; au doigt, toute autre carte s'affiche en grand.
        if (optionsRef.current.onTap?.(p.kind, p.sourceId)) return;
        const arms = p.kind === "aim" && optionsRef.current.canArm(p.sourceId);
        if (!arms) {
          if (p.touch) optionsRef.current.onInspect(p.sourceId);
          return;
        }
        const g = gestureRef.current;
        if (g?.armed && g.sourceId === p.sourceId) end();
        else setGesture({ kind: "aim", sourceId: p.sourceId, origin: p.origin, pointer: { x: e.clientX, y: e.clientY }, armed: true });
        return;
      }

      const drop = validDropAt(p.kind, p.sourceId, e.clientX, e.clientY);
      if (drop) optionsRef.current.onDrop(p.kind, p.sourceId, drop, { x: e.clientX, y: e.clientY });
      end();
    }

    /** Unité armée : le prochain appui choisit la cible, ou désarme. */
    function onDownCapture(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g?.armed) return;
      const drop = validDropAt(g.kind, g.sourceId, e.clientX, e.clientY);
      if (drop) {
        e.stopPropagation();
        optionsRef.current.onDrop(g.kind, g.sourceId, drop, { x: e.clientX, y: e.clientY });
        end();
        return;
      }
      // Appui sur une carte du plateau : son propre gestionnaire ré-arme ou désarme.
      if ((e.target as Element | null)?.closest("[data-armable]")) return;
      end();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") end();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", end);
    window.addEventListener("pointerdown", onDownCapture, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("pointerdown", onDownCapture, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [end, clearLongPress]);

  /** À poser sur l'élément source : `onPointerDown={startGesture("place", card.id)}`. */
  const startGesture = useCallback(
    (kind: GestureKind, sourceId: string) => (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const touch = e.pointerType === "touch" || e.pointerType === "pen";
      pending.current = {
        kind,
        sourceId,
        origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: el.offsetWidth },
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        touch,
      };
      clearLongPress();
      longPress.current = window.setTimeout(() => {
        longPress.current = null;
        const p = pending.current;
        if (!p || p.started || p.sourceId !== sourceId) return;
        // Le relâché qui suivra ne doit rien déclencher d'autre.
        pending.current = null;
        optionsRef.current.onInspect(sourceId);
      }, LONG_PRESS_MS);
    },
    [clearLongPress]
  );

  return { gesture, hover, startGesture, cancel: end };
}
