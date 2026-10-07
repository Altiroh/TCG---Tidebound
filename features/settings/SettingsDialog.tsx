"use client";

import Link from "next/link";
import { AUTH_LINK_CLASS } from "@/components/auth/AuthGlassPanel";
import { appVersionLabel } from "@/features/settings/appVersion";
import { AudioSettingsSection } from "@/features/settings/AudioSettingsSection";
import { InterfaceSettingsSection } from "@/features/settings/InterfaceSettingsSection";
import { ChangePasswordSection } from "@/features/settings/ChangePasswordSection";
import { DeleteAccountSection } from "@/features/settings/DeleteAccountSection";
import { Dialog } from "@/features/shell/Dialog";
import styles from "@/features/settings/Settings.module.css";
import { playButtonClick } from "@/lib/sound";

interface SettingsDialogProps {
  isSignedIn: boolean;
  onClose: () => void;
}

/**
 * Dialogue des Options, atteignable depuis l'engrenage du bandeau (tous
 * les écrans) et depuis le menu principal.
 *
 * Monté sur le `Dialog` commun plutôt que sur sa propre fenêtre de verre :
 * c'est la même fenêtre flottante que « Choisir le Navire » ou
 * « Modifications non sauvegardées », donc le même cadre, le même filet
 * cyan en tête, la même croix, les mêmes sorties (Échap, voile, croix). Il
 * ne restait de l'ancienne version qu'une matière de plus à entretenir.
 *
 * Sections (Audio, Interface, Tutoriel, Atelier, Compte) séparées par un filet : tout ce
 * qui se règle aujourd'hui tient sur un écran, sans onglets ni page dédiée.
 */
export function SettingsDialog({ isSignedIn, onClose }: SettingsDialogProps) {
  return (
    <Dialog title="Options" onClose={onClose} width={460}>
      <div className={styles.settings}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Audio</h3>
          <AudioSettingsSection />
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Interface</h3>
          <InterfaceSettingsSection />
        </section>

        <hr className={styles.divider} />

        {isSignedIn && (
          <>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Tutoriel</h3>
              <p className={styles.signedOut}>
                Rejouer la partie guidée. Chaque étape peut se passer si elle bloque.{" "}
                <Link
                  href="/tutoriel?lancer=1"
                  className={`${AUTH_LINK_CLASS} hover:underline`}
                  onClick={() => {
                    playButtonClick();
                    onClose();
                  }}
                >
                  Lancer le tutoriel
                </Link>
              </p>
            </section>

            <hr className={styles.divider} />
          </>
        )}

        {/* Temporaire, comme le diagnostic d'écran : ouvrir le plateau hors
            partie (`/game/board-preview`, sans moteur ni base) le temps de
            finir l'espace de jeu. Route publique : visible connecté ou non. */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Atelier</h3>
          <p className={styles.signedOut}>
            Le plateau seul, sans partie ni adversaire, pour régler l&apos;espace de jeu.{" "}
            <Link
              href="/game/board-preview"
              className={`${AUTH_LINK_CLASS} hover:underline`}
              onClick={() => {
                playButtonClick();
                onClose();
              }}
            >
              Ouvrir le plateau
            </Link>
          </p>
        </section>

        <hr className={styles.divider} />

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Compte</h3>
          {isSignedIn ? (
            <>
              <ChangePasswordSection />
              <DeleteAccountSection onDeleted={onClose} />
            </>
          ) : (
            <p className={styles.signedOut}>
              Aucun compte connecté.{" "}
              <Link href="/connexion" className={`${AUTH_LINK_CLASS} hover:underline`} onClick={() => playButtonClick()}>
                Se connecter
              </Link>{" "}
              pour gérer son mot de passe et son compte.
            </p>
          )}
        </section>

        {/*
         * La version, tout en bas et en petit : ce n'est pas un réglage.
         * Elle sert à répondre à « quelle version as-tu ? » sans avoir à
         * faire ouvrir une console à qui que ce soit — une capture de ce
         * pied de dialogue suffit.
         */}
        <p className={styles.version}>{appVersionLabel()}</p>
        {/* Temporaire : mesurer l'écran depuis l'app installée, qui n'a pas
            de barre d'adresse (bande en bas sur iPhone, 01/10). À retirer
            avec `app/diagnostic-ecran`. */}
        <p className={styles.version}>
          <Link
            href="/diagnostic-ecran"
            className={`${AUTH_LINK_CLASS} inline-flex min-h-11 items-center hover:underline`}
            onClick={() => {
              playButtonClick();
              onClose();
            }}
          >
            Diagnostic d&apos;écran
          </Link>
        </p>
      </div>
    </Dialog>
  );
}
