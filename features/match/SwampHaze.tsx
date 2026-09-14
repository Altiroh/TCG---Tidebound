import type { CSSProperties } from "react";

interface HazePlumeProps {
  left: string;
  /** Largeur de la volute, en % de l'écran — les plus larges montent plus lentement. */
  width: number;
  delay: number;
  duration: number;
  opacity: number;
}

/** Une volute : une nappe verdâtre qui s'élève en ondulant, cf. `@keyframes swamp-plume` dans `app/globals.css`. */
function HazePlume({ left, width, delay, duration, opacity }: HazePlumeProps) {
  return (
    <span
      className="swamp-plume"
      style={
        {
          left,
          "--width": `${width}vw`,
          "--delay": `${delay}s`,
          "--duration": `${duration}s`,
          "--peak-opacity": opacity,
        } as CSSProperties
      }
    />
  );
}

interface BubbleProps {
  left: string;
  size: number;
  delay: number;
  duration: number;
}

/** Une bulle qui remonte et crève en surface (`@keyframes swamp-bubble`). */
function Bubble({ left, size, delay, duration }: BubbleProps) {
  return (
    <span
      className="swamp-bubble"
      style={
        {
          left,
          "--size": `${size}px`,
          "--delay": `${delay}s`,
          "--duration": `${duration}s`,
        } as CSSProperties
      }
    />
  );
}

/**
 * Ambiance de marécage — arrière-plan de l'écran de DÉFAITE, exactement là
 * où la victoire met ses feux d'artifice. Même parti pris technique
 * (particules CSS, aucun fichier à charger), sentiment inverse : au lieu de
 * gerbes qui éclatent vers le haut, des volutes vertes qui s'élèvent
 * lentement et de grosses bulles qui crèvent — le navire a sombré, l'eau
 * stagne.
 *
 * `filter: blur(...)` garde le cadre du premier plan net, comme pour
 * `Fireworks`.
 */
export function SwampHaze() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ filter: "blur(3px)", opacity: 0.9 }}
      aria-hidden
    >
      <HazePlume left="8%" width={26} delay={0.2} duration={11} opacity={0.5} />
      <HazePlume left="34%" width={34} delay={2.4} duration={14} opacity={0.42} />
      <HazePlume left="62%" width={22} delay={1.1} duration={9.5} opacity={0.55} />
      <HazePlume left="80%" width={30} delay={3.6} duration={12.5} opacity={0.38} />
      <HazePlume left="48%" width={18} delay={5.2} duration={10} opacity={0.45} />

      <Bubble left="18%" size={14} delay={0.8} duration={5.2} />
      <Bubble left="27%" size={9} delay={2.1} duration={4.4} />
      <Bubble left="55%" size={18} delay={1.5} duration={6} />
      <Bubble left="68%" size={11} delay={3.4} duration={4.8} />
      <Bubble left="88%" size={16} delay={2.7} duration={5.6} />
      <Bubble left="41%" size={8} delay={4.3} duration={4.2} />
      <Bubble left="74%" size={13} delay={5.1} duration={5.4} />
    </div>
  );
}
