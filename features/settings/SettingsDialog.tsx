"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AUTH_LINK_CLASS } from "@/components/auth/AuthGlassPanel";
import { AudioSettingsSection } from "@/features/settings/AudioSettingsSection";
import { ChangePasswordSection } from "@/features/settings/ChangePasswordSection";
import { DeleteAccountSection } from "@/features/settings/DeleteAccountSection";

interface SettingsDialogProps {
  isSignedIn: boolean;
  onClose: () => void;
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{children}</h3>;
}

/**
 * Dialogue des Options — même matière "verre liquide" que la modal
 * d'accueil (`AuthGateModal`) : verre fumé des tokens, reflet en haut,
 * ombre flottante. Deux sections seulement (Audio, Compte) séparées par un
 * filet : tout ce qui se règle aujourd'hui tient sur un écran, sans
 * onglets ni page dédiée.
 */
export function SettingsDialog({ isSignedIn, onClose }: SettingsDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Options"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[85vh] w-full max-w-sm overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-glass)] shadow-[var(--shadow-floating)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />

        <div className="relative max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Options</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer les options"
              className={`-mr-1 flex h-8 w-8 items-center justify-center rounded-full ${AUTH_LINK_CLASS} transition duration-150 ease-out hover:bg-white/[0.06]`}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <section className="flex flex-col gap-1">
            <SectionTitle>Audio</SectionTitle>
            <AudioSettingsSection />
          </section>

          <div aria-hidden className="my-5 h-px bg-[var(--border-subtle)]" />

          <section className="flex flex-col gap-1">
            <SectionTitle>Compte</SectionTitle>
            {isSignedIn ? (
              <>
                <ChangePasswordSection />
                <DeleteAccountSection onDeleted={onClose} />
              </>
            ) : (
              <p className="py-2 text-xs text-[var(--text-secondary)]">
                Aucun compte connecté.{" "}
                <Link href="/connexion" className={`${AUTH_LINK_CLASS} hover:underline`}>
                  Se connecter
                </Link>{" "}
                pour gérer son mot de passe et son compte.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
