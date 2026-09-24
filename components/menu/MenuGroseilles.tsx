"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "@/components/menu/MenuCarte.module.css";

/**
 * LES GROSEILLES à côté de la tarte — un jouet du menu.
 *
 * Trois groseilles posées sur la table, à l'échelle de celles que la tarte
 * a répandues (`left-asset.webp`). Un clic les fait ÉCLATER : la groseille
 * crevée gicle (sa planche, plus des gouttes qui volent), puis il ne reste
 * qu'une flaque. Elles restent écrasées tant qu'on reste sur la page ; elles
 * reviennent si on la quitte (autre écran, rechargement) ou si on change
 * d'onglet du navigateur.
 *
 * Planches : `public/assets/menu/carte/groseille-*.webp`, découpées d'une
 * même planche — même échelle, d'où les largeurs relatives ci-dessous
 * (largeur de la planche ÷ largeur d'une groseille intacte).
 */

type Etat = "intacte" | "eclate" | "flaque";

interface Groseille {
  /** Centre, en pourcentages de la scène (le fond). */
  x: string;
  y: string;
  intacte: string;
  eclat: { src: string; ratio: number };
  flaque: { src: string; ratio: number; rotate: number };
  /** Légère inclinaison de la groseille posée. */
  rotate: number;
}

const GROSEILLES: Groseille[] = [
  {
    x: "12.1%",
    y: "65.2%",
    intacte: "/assets/menu/carte/groseille-1.webp",
    eclat: { src: "/assets/menu/carte/groseille-eclat-1.webp", ratio: 481 / 297 },
    flaque: { src: "/assets/menu/carte/groseille-flaque-1.webp", ratio: 616 / 297, rotate: -8 },
    rotate: -12,
  },
  {
    x: "13.6%",
    y: "67.6%",
    intacte: "/assets/menu/carte/groseille-2.webp",
    eclat: { src: "/assets/menu/carte/groseille-eclat-2.webp", ratio: 434 / 291 },
    flaque: { src: "/assets/menu/carte/groseille-flaque-2.webp", ratio: 546 / 291, rotate: 14 },
    rotate: 18,
  },
  {
    x: "11.4%",
    y: "69.9%",
    intacte: "/assets/menu/carte/groseille-3.webp",
    eclat: { src: "/assets/menu/carte/groseille-eclat-3.webp", ratio: 463 / 299 },
    // Deux flaques pour trois groseilles : la troisième reprend la première, retournée.
    flaque: { src: "/assets/menu/carte/groseille-flaque-1.webp", ratio: 616 / 297, rotate: 172 },
    rotate: 4,
  },
];

/** Temps de l'éclatement avant que la flaque ne prenne sa place. */
const ECLAT_MS = 420;

/** Gouttes qui volent à l'éclatement : direction (degrés) et portée (en largeurs de groseille). */
const GOUTTES = [
  { angle: -150, portee: 1.6, taille: 0.22 },
  { angle: -100, portee: 2.1, taille: 0.16 },
  { angle: -60, portee: 1.8, taille: 0.2 },
  { angle: -20, portee: 1.5, taille: 0.14 },
  { angle: 25, portee: 1.3, taille: 0.18 },
  { angle: 160, portee: 1.4, taille: 0.15 },
  { angle: -175, portee: 1.9, taille: 0.12 },
];

export function MenuGroseilles() {
  const [etats, setEtats] = useState<Etat[]>(() => GROSEILLES.map(() => "intacte"));

  // Changer d'onglet et revenir : la table est remise en ordre.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setEtats(GROSEILLES.map(() => "intacte"));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function ecraser(index: number) {
    setEtats((current) => current.map((etat, i) => (i === index && etat === "intacte" ? "eclate" : etat)));
    window.setTimeout(() => setEtats((current) => current.map((etat, i) => (i === index && etat === "eclate" ? "flaque" : etat))), ECLAT_MS);
  }

  return (
    <>
      {GROSEILLES.map((groseille, index) => {
        const etat = etats[index]!;
        const place = { left: groseille.x, top: groseille.y } as CSSProperties;
        if (etat === "intacte") {
          return (
            <button
              key={index}
              type="button"
              aria-label="Une groseille"
              className={styles.groseille}
              style={{ ...place, rotate: `${groseille.rotate}deg` }}
              onClick={() => ecraser(index)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- décor minuscule, déjà à sa taille */}
              <img src={groseille.intacte} alt="" draggable={false} />
            </button>
          );
        }
        if (etat === "eclate") {
          return (
            <span key={index} aria-hidden className={styles.groseilleEclat} style={{ ...place, "--ratio": groseille.eclat.ratio } as CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element -- planche d'éclatement */}
              <img src={groseille.eclat.src} alt="" draggable={false} />
              {GOUTTES.map((goutte, g) => (
                <span
                  key={g}
                  className={styles.groseilleGoutte}
                  style={
                    {
                      // En largeurs de groseille : la boîte de chaque goutte a la taille de la groseille.
                      "--dx": Math.cos((goutte.angle * Math.PI) / 180) * goutte.portee,
                      "--dy": Math.sin((goutte.angle * Math.PI) / 180) * goutte.portee,
                      "--taille": `${goutte.taille * 100}%`,
                    } as CSSProperties
                  }
                />
              ))}
            </span>
          );
        }
        return (
          <span
            key={index}
            aria-hidden
            className={styles.groseilleFlaque}
            style={{ ...place, "--ratio": groseille.flaque.ratio, rotate: `${groseille.flaque.rotate}deg` } as CSSProperties}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- flaque posée sur la table */}
            <img src={groseille.flaque.src} alt="" draggable={false} />
          </span>
        );
      })}
    </>
  );
}
