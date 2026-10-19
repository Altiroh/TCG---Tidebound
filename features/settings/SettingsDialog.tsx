"use client";

import Link from "next/link";
import { AUTH_LINK_CLASS } from "@/components/auth/AuthGlassPanel";
import { appVersionLabel } from "@/features/settings/appVersion";
import { AudioSettingsSection } from "@/features/settings/AudioSettingsSection";
import { InterfaceSettingsSection } from "@/features/settings/InterfaceSettingsSection";
import { ChangePasswordSection } from "@/features/settings/ChangePasswordSection";
import { DeleteAccountSection } from "@/features/settings/DeleteAccountSection";
import { DevModeSection } from "@/features/settings/DevModeSection";
import { SidePanel } from "@/features/shell/SidePanel";
import styles from "@/features/settings/Settings.module.css";
import { playButtonClick } from "@/lib/sound";

interface SettingsDialogProps {
  isSignedIn: boolean;
  /** Rôle Admin : l'Atelier et le diagnostic d'écran (labos) ne s'affichent qu'à lui. */
  isAdmin?: boolean;
  /** Admin en vue joueur (mode Dev coupé) : ses labos sont masqués, l'interrupteur reste. */
  vueJoueur?: boolean;
  onClose: () => void;
}

/**
 * Dialogue des Options, atteignable depuis l'engrenage du bandeau (tous
 * les écrans) et depuis le menu principal.
 *
 * PANNEAU LATÉRAL (15/10/2026), comme le Courrier : il glisse depuis la
 * droite (`SidePanel`), l'écran reste deviné à gauche ; mêmes sorties
 * qu'avant (Échap, voile, croix).
 *
 * Sections (Audio, Interface, Développement pour les Admins, raccourcis Tutoriel / Atelier, Compte) séparées par un filet : tout ce
 * qui se règle aujourd'hui tient sur un écran, sans onglets ni page dédiée.
 */
export function SettingsDialog({ isSignedIn, isAdmin = false, vueJoueur = false, onClose }: SettingsDialogProps) {
  const adminTools = isAdmin && !vueJoueur;
  return (
    <SidePanel title="Options" onClose={onClose}>
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

        {isAdmin && (
          <>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Développement</h3>
              <DevModeSection vueJoueur={vueJoueur} />
            </section>

            <hr className={styles.divider} />
          </>
        )}

        {/* Tutoriel et Atelier (labo réservé aux Admins, 14/10/2026) : deux
            ICÔNES cliquables sur une ligne (16/10/2026) plutôt que deux
            sections de texte — la place va aux réglages. Leur libellé reste
            lisible au survol (`title`) et pour les lecteurs d'écran. */}
        {(isSignedIn || adminTools) && (
          <>
            <nav className={styles.shortcuts} aria-label="Raccourcis">
              {isSignedIn && (
                <ShortcutIcon
                  href="/tutoriel?lancer=1"
                  label="Tutoriel"
                  hint="Rejouer la partie guidée — chaque étape peut se passer si elle bloque."
                  onClose={onClose}
                >
                  <path d="M12 3.5 2.5 8 12 12.5 21.5 8z" />
                  <path d="M6.5 10v4.5c1.4 1.4 3.4 2 5.5 2s4.1-.6 5.5-2V10" />
                  <path d="M21.5 8v5.5" />
                </ShortcutIcon>
              )}
              {adminTools && (
                <ShortcutIcon
                  href="/game/board-preview"
                  label="Atelier"
                  hint="Le plateau seul, sans partie ni adversaire, pour régler l'espace de jeu."
                  onClose={onClose}
                >
                  <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.4-.6-.6-2.4z" />
                </ShortcutIcon>
              )}
            </nav>

            <hr className={styles.divider} />
          </>
        )}

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
      </div>
    </SidePanel>
  );
}

/** Un raccourci en icône : le libellé s'affiche dessous, l'explication au survol. */
function ShortcutIcon({
  href,
  label,
  hint,
  onClose,
  children,
}: {
  href: string;
  label: string;
  hint: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={styles.shortcut}
      title={hint}
      aria-label={`${label} — ${hint}`}
      onClick={() => {
        playButtonClick();
        onClose();
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
      <span>{label}</span>
    </Link>
  );
}
