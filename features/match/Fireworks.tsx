import type { CSSProperties } from "react";

interface FireworkBurstProps {
  top: string;
  left: string;
  color: string;
  /** Décalage (s) avant la première salve — évite que tous les tirs explosent en même temps. */
  delay: number;
  /** Durée totale d'un cycle tir+pause (s) — l'explosion elle-même ne dure qu'un tiers de ce temps, cf. `@keyframes firework-burst`. */
  cycle?: number;
  distance?: number;
  particleCount?: number;
}

/** Une salve : des particules disposées en cercle autour d'un point, cf. `@keyframes firework-burst` dans `app/globals.css`. */
function FireworkBurst({ top, left, color, delay, cycle = 4.5, distance = 70, particleCount = 14 }: FireworkBurstProps) {
  return (
    <div className="firework" style={{ top, left }}>
      {Array.from({ length: particleCount }).map((_, i) => (
        <span
          key={i}
          className="firework-particle"
          style={
            {
              "--angle": `${(360 / particleCount) * i}deg`,
              "--distance": `${distance}px`,
              "--color": color,
              "--delay": `${delay}s`,
              "--cycle": `${cycle}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Feux d'artifice décoratifs — arrière-plan de `VictoryScreen`. Rendus en
 * CSS pur (particules + `@keyframes`, `app/globals.css`) plutôt qu'en GIF :
 * plus léger, sans fichier à charger, couleurs alignées sur la palette
 * laiton/turquoise du cadre plutôt que sur celle d'un asset externe.
 * `filter: blur(...)` sur ce conteneur garde le cadre au premier plan net
 * — lui seul reste sans flou, posé par-dessus dans `VictoryScreen`.
 */
export function Fireworks() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ filter: "blur(2.5px)", opacity: 0.85 }} aria-hidden>
      <FireworkBurst top="22%" left="20%" color="#e7c877" delay={0} />
      <FireworkBurst top="16%" left="72%" color="#3f97a1" delay={1.1} cycle={5} distance={60} />
      <FireworkBurst top="38%" left="46%" color="#ffe9b8" delay={2.3} cycle={4} distance={55} particleCount={12} />
      <FireworkBurst top="12%" left="42%" color="#c9524f" delay={3.2} cycle={5.5} distance={65} />
      <FireworkBurst top="28%" left="86%" color="#e7c877" delay={0.6} cycle={4.8} distance={65} particleCount={12} />
      <FireworkBurst top="10%" left="10%" color="#3f97a1" delay={2.8} cycle={5.2} distance={58} particleCount={12} />
    </div>
  );
}
