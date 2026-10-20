"use client";

import { useEffect, useState } from "react";
import { isInstalledApp, isIosDevice, promptInstall, useInstallEvent } from "@/components/InstallPrompt";
import styles from "@/components/InstallGuide.module.css";

/**
 * AJOUTER TIDEBOUND À L'ÉCRAN D'ACCUEIL — le guide de l'écran « Tournez
 * votre appareil » (`OrientationGate`), retour du 20/10/2026.
 *
 * Installée, l'app s'ouvre en plein écran et en paysage : c'est la vraie
 * réponse au voile de rotation. On l'explique donc là, SEULEMENT dans un
 * navigateur (jamais dans l'app installée), avec les gestes du système et du
 * navigateur du joueur. Là où le navigateur propose l'invite native
 * (Chromium, `beforeinstallprompt`), un bouton la lance directement.
 */
type Guide =
  | "ios-safari"
  | "ios-autre"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "android-autre";

function detectGuide(): Guide | null {
  if (isInstalledApp()) return null;
  const ua = navigator.userAgent;
  if (isIosDevice()) {
    // Chrome, Firefox, Edge… sur iOS : même moteur, mais le bouton Partager n'est pas au même endroit.
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-autre" : "ios-safari";
  }
  if (!/Android/i.test(ua)) return null;
  if (/SamsungBrowser/i.test(ua)) return "android-samsung";
  if (/Firefox/i.test(ua)) return "android-firefox";
  if (/Chrome/i.test(ua) && !/EdgA|OPR|YaBrowser/i.test(ua)) return "android-chrome";
  return "android-autre";
}

const STEPS: Record<Guide, { systeme: string; etapes: string[] }> = {
  "ios-safari": {
    systeme: "iPhone · Safari",
    etapes: ["Touchez Partager (le carré avec une flèche vers le haut), en bas de l'écran.", "Choisissez « Sur l'écran d'accueil ».", "Touchez « Ajouter »."],
  },
  "ios-autre": {
    systeme: "iPhone",
    etapes: ["Touchez Partager (le carré avec une flèche), dans la barre d'adresse.", "Choisissez « Sur l'écran d'accueil ».", "Touchez « Ajouter »."],
  },
  "android-chrome": {
    systeme: "Android · Chrome",
    etapes: ["Touchez le menu ⋮, en haut à droite.", "Choisissez « Installer l'application » (ou « Ajouter à l'écran d'accueil »).", "Confirmez avec « Installer »."],
  },
  "android-samsung": {
    systeme: "Android · Samsung Internet",
    etapes: ["Touchez le menu ≡, en bas à droite.", "Choisissez « Ajouter la page à » › « Écran d'accueil ».", "Confirmez avec « Ajouter »."],
  },
  "android-firefox": {
    systeme: "Android · Firefox",
    etapes: ["Touchez le menu ⋮.", "Choisissez « Installer ».", "Confirmez avec « Ajouter »."],
  },
  "android-autre": {
    systeme: "Android",
    etapes: ["Ouvrez le menu du navigateur.", "Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».", "Confirmez."],
  },
};

export function InstallGuide() {
  // Lu après montage : le serveur ne connaît ni l'appareil ni le mode d'affichage.
  const [guide, setGuide] = useState<Guide | null>(null);
  const installEvent = useInstallEvent();
  useEffect(() => setGuide(detectGuide()), []);
  if (!guide) return null;
  const { systeme, etapes } = STEPS[guide];

  return (
    <section className={styles.guide} aria-label="Ajouter Tidebound à l'écran d'accueil">
      <h2 className={styles.title}>Jouez en plein écran</h2>
      <p className={styles.lead}>Ajoutez Tidebound à l&apos;écran d&apos;accueil : l&apos;app s&apos;ouvre en grand, sans barre de navigateur.</p>
      {installEvent ? (
        <button type="button" className={styles.install} onClick={() => void promptInstall(installEvent)}>
          Installer Tidebound
        </button>
      ) : (
        <>
          <p className={styles.system}>{systeme}</p>
          <ol className={styles.steps}>
            {etapes.map((etape) => (
              <li key={etape}>{etape}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
