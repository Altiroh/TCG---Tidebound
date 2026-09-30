"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useFullscreen } from "@/features/shell/useFullscreen";
import styles from "@/components/InstallPrompt.module.css";

/**
 * INSTALLER TIDEBOUND / JOUER EN PLEIN ÉCRAN — l'invitation du menu.
 *
 * Dans un onglet de navigateur, la barre d'adresse mange une bonne part d'un
 * écran de téléphone en paysage, et le verrou d'orientation est refusé.
 * Installée (écran d'accueil), l'app s'ouvre en plein cadre et en paysage
 * (`public/manifest.webmanifest`). On le propose donc, discrètement, sur
 * l'accueil :
 *  - Android / Chrome : « Installer Tidebound » (l'invite native, captée via
 *    `beforeinstallprompt`) et « Plein écran » en attendant ;
 *  - iOS : pas d'invite programmable — un encart qui dit où toucher
 *    (Partager › Sur l'écran d'accueil) ;
 *  - rien du tout déjà installé (`display-mode: standalone`) ni sur un poste
 *    à souris (`pointer: fine`).
 *
 * Fermé, l'encart ne revient pas (mémorisé sur l'appareil). Le bouton
 * « Plein écran » reste seul, en pastille, tant qu'on n'y est pas : le plein
 * écran se perd à chaque rechargement de l'onglet.
 */

/** L'événement `beforeinstallprompt` (Chromium) — absent des types DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "tidebound:installation:fermee";

/*
 * L'événement n'est émis qu'UNE fois par chargement, souvent avant que
 * l'accueil ne soit monté (arrivée directe sur /collection, puis navigation
 * côté client). Il est donc capté par `InstallPromptCapture`, monté dans le
 * gabarit racine, et gardé ici jusqu'à ce que l'accueil le propose.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let captureStarted = false;

function setDeferredPrompt(next: BeforeInstallPromptEvent | null) {
  deferredPrompt = next;
  listeners.forEach((listener) => listener());
}

function startCapture() {
  if (captureStarted || typeof window === "undefined") return;
  captureStarted = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Sans `preventDefault`, Chrome afficherait sa propre mini-barre, au
    // moment qu'il choisit — éventuellement en pleine partie.
    event.preventDefault();
    setDeferredPrompt(event as BeforeInstallPromptEvent);
  });
  window.addEventListener("appinstalled", () => setDeferredPrompt(null));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** À monter UNE fois dans `app/layout.tsx` : capte l'invite d'installation dès le chargement. */
export function InstallPromptCapture() {
  useEffect(startCapture, []);
  return null;
}

type InstallContext = "none" | "android" | "ios";

/** Lu après montage seulement (le serveur ne connaît ni l'écran ni le mode d'affichage). */
function detectContext(): InstallContext {
  const media = (query: string) => window.matchMedia?.(query).matches ?? false;
  const standalone =
    media("(display-mode: standalone)") ||
    media("(display-mode: fullscreen)") ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "none";
  // Souris : un ordinateur, où l'onglet ne gêne pas. Rien à proposer.
  if (!media("(pointer: coarse)")) return "none";
  // iPadOS se présente comme un Mac : on le reconnaît à son écran tactile.
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "android";
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Stockage indisponible : l'encart reviendra au prochain passage, sans plus.
  }
}

export function InstallPrompt() {
  const [context, setContext] = useState<InstallContext>("none");
  const [dismissed, setDismissed] = useState(true);
  const installEvent = useSyncExternalStore(
    subscribe,
    () => deferredPrompt,
    () => null
  );
  const fullscreen = useFullscreen();

  useEffect(() => {
    startCapture();
    setContext(detectContext());
    setDismissed(readDismissed());
  }, []);

  if (context === "none") return null;

  function dismiss() {
    writeDismissed();
    setDismissed(true);
  }

  async function install() {
    const event = installEvent;
    if (!event) return;
    // Une invite ne sert qu'une fois, acceptée ou non.
    setDeferredPrompt(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") dismiss();
    } catch {
      // Invite déjà consommée ou refusée par le navigateur : rien à signaler.
    }
  }

  const offerFullscreen = context === "android" && fullscreen.supported && !fullscreen.active;
  const fullscreenButton = offerFullscreen ? (
    <button type="button" className={styles.secondary} onClick={() => void fullscreen.enter()}>
      Plein écran
    </button>
  ) : null;

  if (dismissed) {
    return offerFullscreen ? <div className={styles.anchor}>{fullscreenButton}</div> : null;
  }

  if (context === "ios") {
    return (
      <div className={styles.anchor} role="note">
        <div className={styles.card}>
          <p className={styles.text}>
            Jouez en plein écran : ajoutez Tidebound à l&apos;écran d&apos;accueil.
            <span className={styles.hint}>
              Touchez <strong>Partager</strong> › <strong>Sur l&apos;écran d&apos;accueil</strong>.
            </span>
          </p>
          <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Fermer">
            ×
          </button>
        </div>
      </div>
    );
  }

  // Android : sans invite (navigateur qui ne la propose pas, ou déjà refusée)
  // ni plein écran possible, il n'y a rien à offrir.
  if (!installEvent && !offerFullscreen) return null;

  return (
    <div className={styles.anchor} role="note">
      <div className={styles.card}>
        <p className={styles.text}>
          Tidebound se joue mieux sans la barre du navigateur.
          {installEvent && <span className={styles.hint}>Installée, l&apos;app s&apos;ouvre en plein écran.</span>}
        </p>
        {installEvent && (
          <button type="button" className={styles.primary} onClick={() => void install()}>
            Installer Tidebound
          </button>
        )}
        {fullscreenButton}
        <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Fermer">
          ×
        </button>
      </div>
    </div>
  );
}
