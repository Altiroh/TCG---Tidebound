"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useImageOk } from "@/features/match/useImageOk";
import { useLandeTuning } from "@/features/match/landes/landeTuning";
import styles from "@/features/match/table/Table.module.css";

/**
 * TABLE CLASSIQUE (maquette du 06/10/2026) : une table de bois, un tapis de
 * parchemin où se pose le plateau, et dans les coins pièces, dés, pipe,
 * cartes et boussole — tout est peint dans le fond (1672 × 941).
 */
const TABLE_SRC = "/assets/board/table-classique/fond.webp";

/** La bougie posée dans le coin haut gauche, au-dessus du fond : sa flamme vacille. */
const BOUGIE_SRC = "/assets/board/table-classique/bougie.webp";

/** Sol d'une Lande et ses murs (`LandeScene.floor` / `.frame`), prêts à poser. */
export interface LandeFloorProps {
  src: string;
  /** Change avec la Lande : un nouveau sol rejoue son entrée. */
  key: string;
  /** Attente avant l'entrée : la fin de l'arrivée de la carte. */
  delayMs: number;
  /** Murs qui encadrent le sol, en fractions du fond. */
  frame: { src: string; box: readonly [number, number, number, number] }[];
}

/**
 * Décor de la scène : la table classique, ou le sol d'une Lande qui la
 * remplace (Le Donjon de Ladalle : des pavés entre quatre murs).
 *
 * Tout est posé dans un même CADRE au format du fond (`.coverBox`), recadré
 * comme un `object-fit: cover` calé à 50 % / 70 % : la bougie et les murs
 * restent sur le fond, quel que soit le format d'écran — SANS jamais déplacer
 * le gameplay, qui vit dans un calque séparé au-dessus.
 *
 * De vraies balises `<img>` plutôt qu'un `background-image` : même raison
 * que `BoardBackdrop` (repaint peu fiable d'un fond CSS chargé tard).
 */
export function BackgroundLayer({ floor = null }: { floor?: LandeFloorProps | null }) {
  return (
    <div aria-hidden className={styles.background}>
      <div className={styles.coverBox}>
        {/* eslint-disable-next-line @next/next/no-img-element -- décor plein écran, jamais responsive au sens Next/Image */}
        <img src={TABLE_SRC} alt="" draggable={false} decoding="async" fetchPriority="high" className={styles.coverImage} />
        <LandeFloor floor={floor} />
        <Bougie />
      </div>
    </div>
  );
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
function LandeFloor({ floor }: { floor: LandeFloorProps | null }) {
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
      {leaving && <FloorScene key={`out-${leaving.key}`} floor={leaving} className={styles.landeFloorOut} />}
      {shown && <FloorScene key={shown.key} floor={shown} className={styles.landeFloor} />}
    </div>
  );
}

function FloorScene({ floor, className }: { floor: LandeFloorProps; className?: string }) {
  return (
    <div className={`${styles.landeFloorScene} ${className ?? ""}`} style={{ animationDelay: `${floor.delayMs}ms` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- décor plein écran */}
      <img src={floor.src} alt="" draggable={false} className={styles.coverImage} />
      {floor.frame.map((wall, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- décor local
        <img
          key={wall.src}
          src={wall.src}
          alt=""
          draggable={false}
          className={styles.landeWall}
          style={
            {
              left: `${wall.box[0] * 100}%`,
              top: `${wall.box[1] * 100}%`,
              width: `${wall.box[2] * 100}%`,
              height: `${wall.box[3] * 100}%`,
              animationDelay: `${floor.delayMs + WALLS_AFTER_MS + i * WALL_STAGGER_MS}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
