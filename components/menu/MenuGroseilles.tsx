"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "@/components/menu/MenuCarte.module.css";

/**
 * LES GROSEILLES de la tarte — un jouet du menu.
 *
 * Des groseilles de tailles variées, posées au pied de l'assiette et parmi
 * celles que la tarte a répandues (`left-asset.webp`), à la même échelle.
 * Un clic l'ÉCRASE : le jus gicle d'abord (la flaque s'étale depuis
 * dessous, des gouttes volent), puis il reste la groseille écrasée sur sa
 * tache de jus. Elles restent écrasées tant qu'on reste sur la page ; elles
 * reviennent si on la quitte (autre écran, rechargement) ou si on change
 * d'onglet du navigateur.
 *
 * Planches : `public/assets/menu/carte/groseille-*.webp`, découpées d'une
 * même planche — même échelle, d'où les largeurs relatives ci-dessous
 * (largeur de la planche ÷ largeur d'une groseille intacte).
 */

/** Les trois variantes de la planche : intacte, écrasée, et le jus qui va avec. */
const VARIANTES = [
  {
    intacte: "/assets/menu/carte/groseille-1.webp",
    ecrasee: { src: "/assets/menu/carte/groseille-eclat-1.webp", ratio: 481 / 297 },
    jus: { src: "/assets/menu/carte/groseille-flaque-1.webp", ratio: 616 / 297 },
  },
  {
    intacte: "/assets/menu/carte/groseille-2.webp",
    ecrasee: { src: "/assets/menu/carte/groseille-eclat-2.webp", ratio: 434 / 291 },
    jus: { src: "/assets/menu/carte/groseille-flaque-2.webp", ratio: 546 / 291 },
  },
  {
    intacte: "/assets/menu/carte/groseille-3.webp",
    ecrasee: { src: "/assets/menu/carte/groseille-eclat-3.webp", ratio: 463 / 299 },
    // Deux flaques pour trois groseilles : la troisième reprend la première.
    jus: { src: "/assets/menu/carte/groseille-flaque-1.webp", ratio: 616 / 297 },
  },
] as const;

interface Groseille {
  /** Centre, en pourcentages de la scène (le fond). */
  x: string;
  y: string;
  /** Taille, en multiple de `--groseille`. */
  taille: number;
  variante: 0 | 1 | 2;
  /** Inclinaison de la groseille posée, et de sa tache de jus. */
  rotate: number;
  rotateJus: number;
}

/**
 * Au pied de l'assiette et parmi les fruits renversés (mesuré sur la
 * transparence de `left-asset.webp`), à gauche du parchemin Collection —
 * qui commence à 14,8 % : aucune ne doit passer dessous.
 */
const GROSEILLES: Groseille[] = [
  { x: "12.6%", y: "52.6%", taille: 1, variante: 1, rotate: 18, rotateJus: 14 },
  { x: "13.9%", y: "55.8%", taille: 0.8, variante: 0, rotate: -12, rotateJus: -8 },
  { x: "11.2%", y: "57.4%", taille: 1.15, variante: 2, rotate: 4, rotateJus: 172 },
  { x: "13%", y: "60.6%", taille: 0.7, variante: 1, rotate: -30, rotateJus: 200 },
  { x: "12.1%", y: "65.2%", taille: 1, variante: 0, rotate: -12, rotateJus: -8 },
  { x: "13.8%", y: "67.6%", taille: 0.85, variante: 1, rotate: 18, rotateJus: 40 },
  { x: "11.2%", y: "70.2%", taille: 1.1, variante: 2, rotate: 4, rotateJus: 150 },
];

/** Gouttes qui volent quand le jus gicle : direction (degrés) et portée (en largeurs de groseille). */
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
  const [ecrasees, setEcrasees] = useState<ReadonlySet<number>>(new Set());

  // Changer d'onglet et revenir : la table est remise en ordre.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setEcrasees(new Set());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <>
      {GROSEILLES.map((groseille, index) => {
        const variante = VARIANTES[groseille.variante];
        const place = { left: groseille.x, top: groseille.y, "--taille-groseille": groseille.taille } as CSSProperties;

        if (!ecrasees.has(index)) {
          return (
            <button
              key={index}
              type="button"
              aria-label="Une groseille"
              className={styles.groseille}
              style={{ ...place, rotate: `${groseille.rotate}deg` } as CSSProperties}
              onClick={() => setEcrasees((current) => new Set(current).add(index))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- décor minuscule, déjà à sa taille */}
              <img src={variante.intacte} alt="" draggable={false} />
            </button>
          );
        }

        // Écrasée : le jus d'abord (il gicle de dessous), puis la groseille
        // écrasée qui reste. Les animations ne jouent qu'au montage : une
        // fois écrasée, elle ne bouge plus.
        return (
          <span key={index} aria-hidden className={styles.groseilleEcrasee} style={place}>
            {/* eslint-disable-next-line @next/next/no-img-element -- le jus, sous la groseille */}
            <img
              src={variante.jus.src}
              alt=""
              draggable={false}
              className={styles.groseilleJus}
              style={{ "--ratio": variante.jus.ratio, rotate: `${groseille.rotateJus}deg` } as CSSProperties}
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- ce qu'il reste de la groseille */}
            <img
              src={variante.ecrasee.src}
              alt=""
              draggable={false}
              className={styles.groseilleEcraseeImg}
              style={{ "--ratio": variante.ecrasee.ratio, rotate: `${groseille.rotate}deg` } as CSSProperties}
            />
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
      })}
    </>
  );
}
