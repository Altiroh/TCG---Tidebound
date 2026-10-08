"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useImageOk } from "@/features/match/useImageOk";
import { fitBackground, unionRect, type FitTarget, type Rect } from "@/features/match/table/backgroundFit";
import { useLandeTuning } from "@/features/match/landes/landeTuning";
import styles from "@/features/match/table/Table.module.css";

/**
 * TABLE CLASSIQUE (fond du 07/10/2026) : un tapis de parchemin où se pose le
 * plateau, serti dans un cadre de planches bleu-vert cloutées et de
 * cordages — tout est peint dans le fond (1672 × 941).
 */
const TABLE_SRC = "/assets/board/table-classique/playground.webp";

/** La bougie posée dans le coin haut gauche, au-dessus du fond : sa flamme vacille. */
const BOUGIE_SRC = "/assets/board/table-classique/bougie.webp";

/**
 * Le tapis de parchemin dans le fond (mesuré : x 75 → 1598, y 112 → 825),
 * pris un peu en retrait de ses bords déchirés en hauteur : le plateau se
 * pose dedans. En largeur, la cible est le fond presque entier : les rangées
 * vont d'un bord à l'autre de l'écran, et les faire tenir dans le seul
 * parchemin zoomait le fond au point de le flouter et de couper le cadre ;
 * elles passent donc sur les planches de côté.
 */
const TABLE_FIT: FitTarget = [12 / 1672, 125 / 941, 1660 / 1672, 812 / 941];

/**
 * Une TABLE de partie : son fond (1672 × 941), la zone faite pour le plateau
 * et, pour la table classique, la bougie du coin. Par défaut, la table
 * classique ; les laboratoires en essaient d'autres (`TABLE_PONT`).
 */
export interface TableDecor {
  src: string;
  fit: FitTarget;
  bougie?: boolean;
}

export const TABLE_CLASSIQUE: TableDecor = { src: TABLE_SRC, fit: TABLE_FIT, bougie: true };

/**
 * LE PONT DU CAPITAINE (essai du 07/10/2026) : un pont de navire vu de haut,
 * bastingage, cordages et lanternes tout autour, la mer au couchant derrière.
 * Les planches (mesurées : x ≈ 160 → 1560 en bas, 290 → 1440 en haut, y ≈ 95
 * → 840) reçoivent le plateau. Y faire tenir toute l'interface zoomait le
 * fond au point de chasser le bastingage de l'écran : la cible est le fond
 * presque entier, et navires, piles et colonne de tour débordent sur le
 * pourtour, comme sur la maquette.
 */
export const TABLE_PONT: TableDecor = {
  src: "/assets/board/pont/pont-fond.webp",
  fit: [30 / 1672, 70 / 941, 1642 / 1672, 885 / 941],
};

/** Zones d'interface que le fond doit englober (les mains en restent dehors, comme sur la maquette). */
const UI_ZONES = '[data-zone="OpponentZone"], [data-zone="CenterZone"], [data-zone="PlayerZone"], [data-zone="SideRail"]';

/** Sol d'une Lande et ses murs (`LandeScene.floor` / `.frame`), prêts à poser. */
export interface LandeFloorProps {
  src: string;
  /** Change avec la Lande : un nouveau sol rejoue son entrée. */
  key: string;
  /** Attente avant l'entrée : la fin de l'arrivée de la carte. */
  delayMs: number;
  /**
   * Murs et pièces qui habillent le sol, en fractions du fond (une boîte peut
   * déborder du fond : la pièce est alors coupée par le bord de l'écran).
   * `flip` : la pièce en miroir, tournée vers l'autre côté. `fx` : la pièce
   * se clique, et joue son effet (`fumeeVerte` : des volutes vertes et
   * puantes s'en échappent).
   */
  frame: { src: string; box: readonly [number, number, number, number]; flip?: boolean; fx?: "fumeeVerte"; label?: string }[];
  /** Flammes du décor peint (bougies, torches) : une lueur chaude vacille sur chacune. [x, y, taille], en fractions du fond. */
  glows?: readonly (readonly [number, number, number])[];
  /** Zone du sol faite pour le plateau (`LandeScene.fit`) ; à défaut, celle de la table. */
  fit?: FitTarget;
  /**
   * D'où le sol surgit, en fractions du fond (défaut : le centre). Donné, une
   * onde de choc lumineuse part aussi de ce point — la carte de la Lande.
   */
  origin?: readonly [number, number];
}

/**
 * Décor de la scène : la table classique, ou le sol d'une Lande qui la
 * remplace (Le Donjon de Ladalle : des pavés entre quatre murs).
 *
 * Chaque fond est posé dans un CADRE à son format (`.coverBox`), avec ce
 * qu'on pose dessus (bougie, murs). Le cadre est zoomé et décalé pour que la
 * zone du fond faite pour le plateau — le tapis, l'enclos de murs — englobe
 * les zones d'interface MESURÉES (`backgroundFit.ts`), quel que soit le
 * format d'écran. Le gameplay, lui, ne bouge jamais. Avant la première
 * mesure, le cadre se comporte comme un `object-fit: cover`.
 *
 * De vraies balises `<img>` plutôt qu'un `background-image` : même raison
 * que `BoardBackdrop` (repaint peu fiable d'un fond CSS chargé tard).
 */
export function BackgroundLayer({ floor = null, table = TABLE_CLASSIQUE }: { floor?: LandeFloorProps | null; table?: TableDecor }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layout = useUiLayout(hostRef);
  const boxFor = (target: FitTarget): CSSProperties | undefined => {
    if (!layout) return undefined;
    const box = fitBackground(layout.view, layout.ui, target, layout.margin);
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  };
  return (
    <div ref={hostRef} aria-hidden className={styles.background}>
      <div className={styles.coverBox} style={boxFor(table.fit)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor plein écran, jamais responsive au sens Next/Image */}
        <img src={table.src} alt="" draggable={false} decoding="async" fetchPriority="high" className={styles.coverImage} />
        {table.bougie && <Bougie />}
      </div>
      <LandeFloor floor={floor} boxFor={boxFor} tableFit={table.fit} />
    </div>
  );
}

/**
 * Où sont les zones d'interface, dans le repère du fond : relu à chaque
 * changement de taille de la vue ou d'une zone (format d'écran, rangées qui
 * changent de mode).
 */
function useUiLayout(hostRef: RefObject<HTMLDivElement | null>) {
  const [layout, setLayout] = useState<{ view: { width: number; height: number }; ui: Rect; margin: number } | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    const scene = host?.parentElement;
    if (!host || !scene) return;
    const read = () => {
      const origin = host.getBoundingClientRect();
      const ui = unionRect(
        [...scene.querySelectorAll(UI_ZONES)].map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top };
        })
      );
      if (!ui || origin.width === 0 || origin.height === 0) return setLayout(null);
      setLayout({ view: { width: origin.width, height: origin.height }, ui, margin: Math.max(6, origin.height * 0.012) });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(host);
    scene.querySelectorAll(UI_ZONES).forEach((el) => observer.observe(el));
    // Les rangées se posent après le fond : on relit leur place un peu plus tard.
    const later = window.setTimeout(() => {
      read();
      scene.querySelectorAll(UI_ZONES).forEach((el) => observer.observe(el));
    }, 600);
    return () => {
      observer.disconnect();
      window.clearTimeout(later);
    };
  }, [hostRef]);
  return layout;
}

/**
 * La bougie du coin : une image posée sur le fond, une lueur chaude qui
 * vacille sur la table autour d'elle, et un halo serré sur la flamme.
 */
function Bougie() {
  return (
    <div className={styles.bougie}>
      <span className={styles.bougieLueur} />
      {/* eslint-disable-next-line @next/next/no-img-element -- décor fixe */}
      <img src={BOUGIE_SRC} alt="" draggable={false} decoding="async" className={styles.bougieImage} />
      <span className={styles.bougieFlamme} />
    </div>
  );
}

/** Durée du fondu de sortie d'un sol, quand sa Lande part. */
const FLOOR_LEAVE_MS = 1200;

/** Après l'onde du sol, les murs sortent l'un après l'autre. */
const WALLS_AFTER_MS = 900;
const WALL_STAGGER_MS = 160;

/**
 * Le SOL d'une Lande, par-dessus la table : il surgit du centre en une
 * onde, la table tremble, puis ses murs se dressent tout autour, et il tient
 * tant que la Lande est là. Absent (fichier pas encore livré) : rien ne
 * change, la table reste.
 */
function LandeFloor({ floor, boxFor, tableFit }: { floor: LandeFloorProps | null; boxFor: (target: FitTarget) => CSSProperties | undefined; tableFit: FitTarget }) {
  const ok = useImageOk(floor?.src ?? null);
  const { floorBrightness } = useLandeTuning();
  const [leaving, setLeaving] = useState<LandeFloorProps | null>(null);
  const [shown, setShown] = useState<LandeFloorProps | null>(null);
  useEffect(() => {
    if (floor && ok) {
      setShown(floor);
      return;
    }
    if (!floor && shown) {
      setLeaving(shown);
      setShown(null);
      const timer = window.setTimeout(() => setLeaving(null), FLOOR_LEAVE_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor?.key, ok]);
  // La luminosité vit sur un calque autour du sol : l'animation d'entrée,
  // qui joue elle-même sur `filter`, l'écraserait sur l'image.
  return (
    <div className={styles.landeFloorLayer} style={{ filter: floorBrightness === 1 ? undefined : `brightness(${floorBrightness})` }}>
      {leaving && <FloorScene key={`out-${leaving.key}`} floor={leaving} box={boxFor(leaving.fit ?? tableFit)} className={styles.landeFloorOut} />}
      {shown && <FloorScene key={shown.key} floor={shown} box={boxFor(shown.fit ?? tableFit)} className={styles.landeFloor} />}
      {/* L'onde de choc, hors du sol (qu'elle borde : le sol est découpé en cercle). */}
      {shown?.origin && (
        <div key={`onde-${shown.key}`} className={styles.coverBox} style={{ ...boxFor(shown.fit ?? tableFit), pointerEvents: "none" }} aria-hidden>
          <span
            className={styles.landeShockwave}
            style={{ left: `${shown.origin[0] * 100}%`, top: `${shown.origin[1] * 100}%`, animationDelay: `${shown.delayMs}ms` }}
          />
        </div>
      )}
    </div>
  );
}


/** Durée d'une bouffée de fumée (`landeFumee`), avant qu'elle ne soit retirée. */
const FUMEE_MS = 3200;

/** Une bouffée : sa place À L'ÉCRAN (px), relevée sur la pièce au moment du clic. */
interface Puff {
  id: number;
  x: number;
  y: number;
  size: number;
}

function FloorScene({ floor, box, className }: { floor: LandeFloorProps; box: CSSProperties | undefined; className?: string }) {
  // Bouffées en cours : chaque clic sur une pièce à effet en relance une.
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const nextPuff = useRef(0);
  function puff(target: HTMLElement) {
    const r = target.getBoundingClientRect();
    const id = nextPuff.current++;
    setPuffs((list) => [...list, { id, x: r.left + r.width / 2, y: r.top + r.height * 0.3, size: r.width * 2.2 }]);
    window.setTimeout(() => setPuffs((list) => list.filter((p) => p.id !== id)), FUMEE_MS);
  }
  return (
    <div
      className={`${styles.coverBox} ${className ?? ""}`}
      style={
        {
          ...box,
          animationDelay: `${floor.delayMs}ms`,
          "--lande-ox": floor.origin ? `${floor.origin[0] * 100}%` : undefined,
          "--lande-oy": floor.origin ? `${floor.origin[1] * 100}%` : undefined,
        } as CSSProperties
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- décor plein écran */}
      <img src={floor.src} alt="" draggable={false} className={styles.coverImage} />
      {floor.glows?.map(([x, y, size], i) => (
        <span
          key={`lueur-${i}`}
          className={styles.landeGlow}
          style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${size * 100}%`, animationDelay: `${-i * 0.7}s` }}
        />
      ))}
      {floor.frame.map((wall, i) => {
        const style = {
          left: `${wall.box[0] * 100}%`,
          top: `${wall.box[1] * 100}%`,
          width: `${wall.box[2] * 100}%`,
          height: `${wall.box[3] * 100}%`,
          // `scale` et non `transform` : l'animation d'entrée joue sur `transform`.
          scale: wall.flip ? "-1 1" : undefined,
          animationDelay: `${floor.delayMs + WALLS_AFTER_MS + i * WALL_STAGGER_MS}ms`,
        } as CSSProperties;
        return wall.fx ? (
          <button
            key={wall.src}
            type="button"
            className={`${styles.landeWall} ${styles.landeProp}`}
            style={style}
            onClick={(event) => puff(event.currentTarget)}
            aria-label={wall.label}
            title={wall.label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
            <img src={wall.src} alt="" draggable={false} />
          </button>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- décor local
          <img key={wall.src} src={wall.src} alt="" draggable={false} className={styles.landeWall} style={style} />
        );
      })}
      {/* La fumée passe DEVANT le plateau : rendue hors de la scène, au-dessus de tout. */}
      {puffs.length > 0 &&
        createPortal(
          puffs.map(({ id, x, y, size }) => (
            <span key={id} className={styles.landeFumee} aria-hidden style={{ left: x, top: y, width: size }}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={styles.landeFumeePuff} style={{ "--n": n } as CSSProperties} />
              ))}
            </span>
          )),
          document.body
        )}
    </div>
  );
}
