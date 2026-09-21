"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "@/features/shell/PageTransition.module.css";

type Phase = "idle" | "covering" | "covered" | "revealing";
type Direction = "ltr" | "rtl";

/** Au-delà, on découvre quand même : une navigation qui n'aboutit pas ne doit jamais laisser l'écran noyé. */
const COVER_TIMEOUT_MS = 5000;

/**
 * Durées des deux courses — les MÊMES que `PageTransition.module.css`.
 * Servent au filet de sécurité : un onglet en arrière-plan ne fait pas
 * avancer les animations, et `animationend` n'y arrive jamais ; sans ce
 * filet, la navigation attendrait indéfiniment.
 */
const COVER_MS = 620;
const REVEAL_MS = 720;
const ANIMATION_SLACK_MS = 250;

function randomDirection(): Direction {
  return Math.random() < 0.5 ? "ltr" : "rtl";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Lien interne vers une AUTRE page, cliqué sans modificateur : c'est le seul
 * cas qu'on retient. Nouvel onglet, téléchargement, lien externe, simple
 * ancre ou `data-no-transition` suivent leur chemin habituel.
 */
function internalNavigationTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download") || anchor.hasAttribute("data-no-transition")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * Transition de changement de page : une ombre (`ui/transitions/ombre-portee`)
 * balaie l'écran, depuis la gauche ou la droite au hasard.
 *
 * Deux temps. Au clic sur un lien interne, l'ombre ENTRE et couvre l'écran
 * (`covering`) ; la navigation ne part qu'une fois l'écran couvert, pour que
 * l'ancienne page ne soit jamais coupée à vue. Quand la nouvelle page est là
 * (`usePathname` change), l'ombre poursuit sa course et la DÉCOUVRE
 * (`revealing`).
 *
 * Le clic est intercepté en capture sur `window` avec `preventDefault()` :
 * le `onClick` du `<Link>` (le son du bouton) s'exécute toujours, puis
 * `next/link` voit `defaultPrevented` et nous laisse la navigation.
 *
 * Une navigation qui ne vient pas d'un lien (`router.push`, retour arrière)
 * n'a que la seconde moitié : l'ombre est posée avant la première peinture
 * de la nouvelle page (`useLayoutEffect`), puis se retire.
 *
 * `prefers-reduced-motion` : rien, la navigation reste immédiate.
 */
export function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const [direction, setDirection] = useState<Direction>("ltr");
  const phaseRef = useRef<Phase>("idle");
  const pendingHref = useRef<string | null>(null);
  const timeout = useRef<number | null>(null);
  const previousPathname = useRef(pathname);

  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const href = internalNavigationTarget(event);
      if (!href || prefersReducedMotion()) return;
      // L'ombre se retire déjà : ce lien-là part sans transition plutôt que d'attendre.
      if (phaseRef.current === "revealing" || phaseRef.current === "covered") return;
      event.preventDefault();
      pendingHref.current = href;
      // Déjà en train de couvrir : même course, seule la destination change.
      if (phaseRef.current === "covering") return;
      router.prefetch(href);
      setDirection(randomDirection());
      go("covering");
    }
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [router]);

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    timeout.current = null;
    if (phaseRef.current === "covered") {
      go("revealing");
    } else if (phaseRef.current === "idle" && !prefersReducedMotion()) {
      setDirection(randomDirection());
      go("revealing");
    }
    // `covering` : la page a changé avant que l'ombre ne couvre (navigation
    // partie d'ailleurs) — la fin de course enchaînera sur la découverte.
  }, [pathname]);

  useEffect(() => {
    if (phase !== "covering" && phase !== "revealing") return;
    const duration = (phase === "covering" ? COVER_MS : REVEAL_MS) + ANIMATION_SLACK_MS;
    const id = window.setTimeout(() => advanceRef.current(), duration);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(
    () => () => {
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    },
    []
  );

  /** Fin d'une course (`animationend`, ou le filet de sécurité s'il ne vient pas). Sans effet hors course. */
  function advance() {
    if (phaseRef.current === "covering") {
      const href = pendingHref.current;
      pendingHref.current = null;
      if (!href || href.split(/[?#]/)[0] === previousPathname.current) {
        go("revealing");
        return;
      }
      go("covered");
      router.push(href);
      timeout.current = window.setTimeout(() => {
        timeout.current = null;
        if (phaseRef.current === "covered") go("revealing");
      }, COVER_TIMEOUT_MS);
    } else if (phaseRef.current === "revealing") {
      go("idle");
    }
  }

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  return (
    <div className={styles.layer} data-phase={phase} data-direction={direction} aria-hidden="true">
      <div className={styles.strip} onAnimationEnd={() => advanceRef.current()}>
        <div className={`${styles.edge} ${styles.trailing}`} />
        <div className={styles.body} />
        <div className={styles.edge} />
      </div>
    </div>
  );
}
