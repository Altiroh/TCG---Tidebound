"use client";

import { memo, useMemo, type CSSProperties } from "react";
import styles from "@/features/boosters/opening/BoosterOpening.module.css";

export type BoosterParticlesVariant = "ambient" | "tear" | "rare" | "abyssal";

interface BoosterParticlesProps {
  variant: BoosterParticlesVariant;
}

/** PRNG à graine (mulberry32) : même disposition à chaque rendu, aucune variation entre deux montages. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type ParticleStyle = CSSProperties & Record<`--${string}`, string>;

interface Particle {
  className: string;
  style: ParticleStyle;
}

const u = (value: number) => `calc(var(--u) * ${value.toFixed(2)})`;
const ms = (value: number) => `${Math.round(value)}ms`;

function ambientParticles(): Particle[] {
  const rand = seeded(7);
  return Array.from({ length: 16 }, () => ({
    className: styles.mote!,
    style: {
      left: `${(rand() * 100).toFixed(1)}%`,
      top: `${(40 + rand() * 60).toFixed(1)}%`,
      "--size": u(0.25 + rand() * 0.4),
      "--rise": u(18 + rand() * 30),
      "--drift": u(-4 + rand() * 8),
      "--peak": (0.14 + rand() * 0.3).toFixed(2),
      "--dur": ms(8000 + rand() * 7000),
      "--delay": ms(-rand() * 12000),
    },
  }));
}

/**
 * Particules de la déchirure. Les éclats de feuille naissent au passage du
 * point de déchirure (`--frac` = position le long du bord, de gauche à
 * droite) ; les gouttelettes jaillissent quand la bande cède.
 */
function tearParticles(): Particle[] {
  const rand = seeded(31);
  const flecks = Array.from({ length: 16 }, (_, index) => {
    const frac = (index + rand() * 0.8) / 16;
    return {
      className: styles.fleck!,
      style: {
        left: `${(6 + frac * 86).toFixed(1)}%`,
        top: `${(11 + frac * 4 + rand() * 2).toFixed(1)}%`,
        "--frac": frac.toFixed(3),
        "--size": u(0.16 + rand() * 0.22),
        "--dx": u(-2 + rand() * 5),
        "--dy": u(-(3 + rand() * 6)),
        "--fall": u(4 + rand() * 6),
        "--dur": ms(700 + rand() * 500),
        "--delay": ms(rand() * 60),
      },
    };
  });
  const droplets = Array.from({ length: 14 }, () => {
    const spread = rand() * 2 - 1;
    return {
      className: styles.droplet!,
      style: {
        left: `${(58 + spread * 32).toFixed(1)}%`,
        top: `${(12 + rand() * 4).toFixed(1)}%`,
        "--size": u(0.3 + rand() * 0.45),
        "--dx": u(3 + spread * 8 + rand() * 6),
        "--dy": u(-(5 + rand() * 11)),
        "--fall": u(7 + rand() * 9),
        "--dur": ms(620 + rand() * 380),
        "--delay": ms(rand() * 90),
      },
    };
  });
  return [...flecks, ...droplets];
}

/** Poussière lumineuse autour d'une carte révélée. Plus nombreuse, plus lente et plus froide pour une Abyssale. */
function revealParticles(variant: "rare" | "abyssal"): Particle[] {
  const abyssal = variant === "abyssal";
  const rand = seeded(abyssal ? 97 : 53);
  const count = abyssal ? 12 : 8;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + rand() * 0.6;
    const distance = (abyssal ? 13 : 10) + rand() * 6;
    return {
      className: abyssal ? styles.revealMoteAbyssal! : styles.revealMote!,
      style: {
        "--size": u(0.28 + rand() * 0.34),
        "--dx": u(Math.cos(angle) * distance * 0.8),
        "--dy": u(Math.sin(angle) * distance - 3),
        "--dur": ms((abyssal ? 1300 : 900) + rand() * 500),
        "--delay": ms(rand() * 140),
      },
    };
  });
}

/**
 * Particules de la scène. Tout est en CSS (transform + opacity) : aucune
 * boucle JS, aucune mesure DOM. Chaque variante est montée pile au moment
 * où elle doit jouer et se démonte avec son parent.
 */
export const BoosterParticles = memo(function BoosterParticles({ variant }: BoosterParticlesProps) {
  const particles = useMemo(() => {
    switch (variant) {
      case "ambient":
        return ambientParticles();
      case "tear":
        return tearParticles();
      default:
        return revealParticles(variant);
    }
  }, [variant]);

  return (
    <span className={variant === "ambient" ? styles.ambientLayer : styles.particleLayer} aria-hidden>
      {particles.map((particle, index) => (
        <span key={index} className={particle.className} style={particle.style} />
      ))}
    </span>
  );
});
