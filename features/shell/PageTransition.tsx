"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import styles from "@/features/shell/PageTransition.module.css";
import { registerPageTransition } from "@/features/shell/pageTransitionBus";
import { waitForPageReady } from "@/features/shell/pageReady";
import { playTransitionSwoosh, preloadInterfaceSounds } from "@/lib/sound";

type Phase = "idle" | "covering" | "covered" | "revealing";
type Direction = "ltr" | "rtl";

/** Au-delà, on découvre quand même : une navigation qui n'aboutit pas ne doit jamais laisser l'écran noyé. */
const COVER_TIMEOUT_MS = 5000;
/**
 * Attente maximale d'un écran PRÊT (`waitForPageReady`) une fois la page
 * changée, puis à l'ouverture du site : au-delà, on découvre quand même.
 */
const READY_MAX_MS = 3500;
const BOOT_READY_MAX_MS = 4500;
/** Onglets d'un même écran (sans ombre) : le contenu reste masqué jusqu'à ce délai au plus. */
const TAB_READY_MAX_MS = 2500;
/**
 * L'écran d'ouverture reste AU MOINS ce temps (29/09/2026) : le temps de
 * poser les images et les polices de la première page, et assez pour qu'il
 * se lise comme un écran de chargement plutôt que comme un clignotement.
 */
const BOOT_MIN_MS = 1000;
/** Les polices comptent dans l'attente d'ouverture, mais jamais plus que ça. */
const BOOT_FONTS_MAX_MS = 2500;

/**
 * Durées des deux courses — les MÊMES que `PageTransition.module.css`.
 * Servent au filet de sécurité : un onglet en arrière-plan ne fait pas
 * avancer les animations, et `animationend` n'y arrive jamais ; sans ce
 * filet, la navigation attendrait indéfiniment.
 */
// Un peu plus longues, et sans accélération finale (27/09/2026) : la
// découverte finissait en ease-in, l'ombre « tombait » hors de l'écran.
const COVER_MS = 360;
const REVEAL_MS = 460;
const ANIMATION_SLACK_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomDirection(): Direction {
  return Math.random() < 0.5 ? "ltr" : "rtl";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Écrans qui regroupent plusieurs adresses. L'ombre marque un changement
 * d'ÉCRAN, pas un changement d'onglet ni de contenu à l'intérieur d'un
 * écran : passer de Cartes à Decks (onglets du bandeau), ouvrir un deck ou
 * aller de la connexion à l'inscription se fait sans elle.
 *
 * Premier segment de l'adresse → écran. Hors de cette table, un segment est
 * un écran à lui seul (`/market`, `/partie`, `/profil`…).
 */
const SCREEN_OF_SEGMENT: Record<string, string> = {
  // Les onglets du bandeau (`ScreenHeader`) et ce qui s'ouvre dedans.
  collection: "collection",
  collectables: "collection",
  decks: "collection",
  boosters: "collection",
  navires: "collection",
  connexion: "auth",
  inscription: "auth",
  "reinitialiser-mot-de-passe": "auth",
  auth: "auth",
};

function screenOf(pathname: string): string {
  const segment = pathname.split("/")[1] ?? "";
  return SCREEN_OF_SEGMENT[segment] ?? segment;
}

/** Même écran : la navigation se fait sans ombre. */
function sameScreen(fromPathname: string, toHref: string): boolean {
  return screenOf(fromPathname) === screenOf(toHref.split(/[?#]/)[0]!);
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
 * ÉCRAN PRÊT (28/09/2026) : l'ombre ne découvre plus dès que l'adresse
 * change, mais quand le nouvel écran est prêt (`waitForPageReady` : plus
 * d'écran « Chargement… », images visibles téléchargées et décodées). Même
 * chose à l'ouverture du site : la page arrive couverte (`covered` dès le
 * rendu serveur) et se découvre une fois prête. Entre onglets d'un même
 * écran, sans ombre, le contenu sous le bandeau reste masqué
 * (`html[data-page-pending]`) le temps d'être prêt.
 *
 * `prefers-reduced-motion` : rien, la navigation reste immédiate.
 */
export function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  // Couvert dès le rendu serveur : le site s'ouvre sur un écran déjà prêt.
  const [phase, setPhase] = useState<Phase>("covered");
  const [direction, setDirection] = useState<Direction>("ltr");
  /** Ouverture du site : l'écran de chargement (logo et jauge) est posé sur l'ombre. */
  const [booting, setBooting] = useState(true);
  /** Jauge de l'écran d'ouverture, de 0 à 1 : la part du temps minimal écoulée et celle des images décodées. */
  const [bootProgress, setBootProgress] = useState(0);
  const phaseRef = useRef<Phase>("covered");
  /** Jeton de la dernière attente d'écran prêt : une navigation plus récente annule les précédentes. */
  const readyToken = useRef(0);
  const pendingHref = useRef<string | null>(null);
  const timeout = useRef<number | null>(null);
  const previousPathname = useRef(pathname);

  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  /** Découvre l'écran quand il est prêt — sauf si une autre navigation est passée entre-temps. */
  const revealWhenReady = (maxMs: number) => {
    const token = ++readyToken.current;
    void waitForPageReady(maxMs).then(() => {
      if (token === readyToken.current && phaseRef.current === "covered") go("revealing");
    });
  };

  // Ouverture du site : couvert au rendu serveur, découvert une fois prêt —
  // images visibles décodées, polices chargées, et au moins `BOOT_MIN_MS`.
  useEffect(() => {
    if (prefersReducedMotion()) {
      go("idle");
      setBooting(false);
      return;
    }
    const token = ++readyToken.current;
    const started = performance.now();
    let images = 0;
    const tick = window.setInterval(() => {
      const time = Math.min(1, (performance.now() - started) / BOOT_MIN_MS);
      // La jauge avance avec le temps ET les images : elle ne se fige jamais, et n'arrive au bout qu'une fois tout posé.
      setBootProgress(Math.min(0.96, 0.5 * time + 0.5 * images));
    }, 90);
    const fonts = document.fonts?.ready ?? Promise.resolve();
    void Promise.all([
      waitForPageReady(BOOT_READY_MAX_MS, (done, total) => {
        images = total === 0 ? 1 : done / total;
      }),
      sleep(BOOT_MIN_MS),
      Promise.race([fonts, sleep(BOOT_FONTS_MAX_MS)]),
    ]).then(() => {
      window.clearInterval(tick);
      setBootProgress(1);
      if (token === readyToken.current && phaseRef.current === "covered") go("revealing");
    });
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, au montage
  }, []);

  // Sons d'interface décodés une fois la page AU REPOS (audit du 24/09) :
  // ~350 Ko de MP3 à télécharger et décoder se disputaient sinon le réseau
  // et le processeur avec le premier affichage de chaque visite.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => preloadInterfaceSounds(), { timeout: 5000 });
    return () => cancel(id);
  }, []);

  useEffect(() => {
    /**
     * Lance l'ombre vers `href` ; `false` = pas de transition, l'appelant
     * navigue normalement. Partagé entre les liens (clic intercepté) et les
     * boutons (`navigateWithTransition`).
     */
    function start(href: string): boolean {
      if (prefersReducedMotion()) return false;
      if (sameScreen(window.location.pathname, href)) return false;
      // L'ombre se retire déjà : cette navigation part sans transition plutôt que d'attendre.
      if (phaseRef.current === "revealing" || phaseRef.current === "covered") return false;
      pendingHref.current = href;
      // Déjà en train de couvrir : même course, seule la destination change.
      if (phaseRef.current === "covering") return true;
      router.prefetch(href);
      setDirection(randomDirection());
      playTransitionSwoosh();
      go("covering");
      return true;
    }

    function onClick(event: MouseEvent) {
      const href = internalNavigationTarget(event);
      if (href && start(href)) event.preventDefault();
    }
    window.addEventListener("click", onClick, true);
    const unregister = registerPageTransition(start);
    return () => {
      window.removeEventListener("click", onClick, true);
      unregister();
    };
  }, [router]);

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    const changedScreen = !sameScreen(previousPathname.current, pathname);
    previousPathname.current = pathname;
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    timeout.current = null;
    if (phaseRef.current === "covered") {
      revealWhenReady(READY_MAX_MS);
    } else if (phaseRef.current === "idle" && changedScreen && !prefersReducedMotion()) {
      setDirection(randomDirection());
      playTransitionSwoosh();
      go("covered");
      revealWhenReady(READY_MAX_MS);
    } else if (phaseRef.current === "idle" && !changedScreen) {
      // Onglet du même écran : pas d'ombre, mais rien ne se construit à vue.
      const token = ++readyToken.current;
      document.documentElement.dataset.pagePending = "";
      void waitForPageReady(TAB_READY_MAX_MS).then(() => {
        if (token === readyToken.current) delete document.documentElement.dataset.pagePending;
      });
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
      setBooting(false);
    }
  }

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  return (
    <div className={styles.layer} data-phase={phase} data-direction={direction} aria-hidden="true">
      <div className={styles.strip} onAnimationEnd={(event) => event.target === event.currentTarget && advanceRef.current()}>
        <div className={`${styles.edge} ${styles.trailing}`} />
        <div className={styles.body}>
          {/* L'écran d'ouverture voyage AVEC l'ombre : il s'en va quand elle découvre la page. */}
          {booting && (
            <div className={styles.splash} style={{ "--boot-progress": bootProgress } as CSSProperties}>
              <Image src="/assets/menu/logo/tidebound-logo.webp" alt="" width={1600} height={631} sizes="(max-height: 560px) 40vw, 26vw" priority draggable={false} className={styles.splashLogo} />
              <span className={styles.splashTrack}>
                <span className={styles.splashFill} />
              </span>
              <span className={styles.splashLabel}>Chargement…</span>
            </div>
          )}
        </div>
        <div className={styles.edge} />
      </div>
    </div>
  );
}
