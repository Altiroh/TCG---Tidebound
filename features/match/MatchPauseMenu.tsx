"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { AUTH_LINK_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";
import { AudioSettingsSection } from "@/features/settings/AudioSettingsSection";
import { playButtonClick } from "@/lib/sound";

interface MatchPauseMenuProps {
  onResume: () => void;
  /** Abandon : concède la partie (l'adversaire gagne). */
  onConcede: () => void;
  /** Abandon soumis au serveur, réponse pas encore revenue. */
  concedePending?: boolean;
  /**
   * Sortie sans concéder — partie LOCALE seulement : rien n'y est enregistré
   * et aucun adversaire n'attend. En ligne, il n'y a pas de porte de sortie
   * silencieuse : on abandonne, ou on reprend.
   */
  onQuit?: () => void;
  /** Menu principal, pour revenir au calme depuis la pause (partie locale). */
  homeHref?: Route | string;
}

/**
 * Menu de pause ouvert par ÉCHAP pendant une partie.
 *
 * Ordre voulu : les options d'abord (c'est ce qu'on vient régler neuf fois
 * sur dix — baisser le son), l'abandon tout en bas, derrière une
 * confirmation. "Abandonner le navire" est une vraie action de jeu : elle
 * concède la partie à l'adversaire, elle ne se contente pas de fermer
 * l'écran.
 */
export function MatchPauseMenu({ onResume, onConcede, concedePending = false, onQuit, homeHref }: MatchPauseMenuProps) {
  const [confirmingConcede, setConfirmingConcede] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onResume}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Partie en pause"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[85vh] w-full max-w-sm overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-glass)] shadow-[var(--shadow-floating)] backdrop-blur-2xl"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />

        <div className="relative max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Partie en pause</h2>
            <span className="text-[11px] text-[var(--text-secondary)]">Échap pour reprendre</span>
          </div>

          <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Audio</h3>
          <AudioSettingsSection />

          <div aria-hidden className="my-4 h-px bg-[var(--border-subtle)]" />

          <button
            type="button"
            onClick={() => {
              playButtonClick();
              onResume();
            }}
            className={AUTH_PRIMARY_BUTTON_CLASS}
          >
            Reprendre la partie
          </button>

          {confirmingConcede ? (
            <div className="mt-3 flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--danger)]/35 bg-[var(--danger)]/[0.07] p-3">
              <div>
                <p className="text-sm text-[var(--text-primary)]">Abandonner le navire ?</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  La partie s&apos;arrête immédiatement et compte comme une défaite. Ton adversaire l&apos;emporte.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onConcede}
                  disabled={concedePending}
                  className="flex-1 rounded-[var(--radius-sm)] bg-[var(--danger)] px-4 py-2 text-sm font-medium text-[#f6efe6] transition duration-150 ease-out hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                >
                  {concedePending ? "Abandon…" : "Abandonner"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingConcede(false)}
                  className={`text-xs ${AUTH_LINK_CLASS} hover:underline`}
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                playButtonClick();
                setConfirmingConcede(true);
              }}
              className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--danger)]/40 px-4 py-2 text-sm font-medium text-[var(--danger)] transition duration-150 ease-out hover:bg-[var(--danger)]/10 active:scale-[0.98]"
            >
              Abandonner le navire
            </button>
          )}

          {(onQuit || homeHref) && (
            <div className="mt-4 flex justify-center gap-4 text-xs">
              {onQuit && (
                <button type="button" onClick={onQuit} className={`${AUTH_LINK_CLASS} hover:underline`}>
                  Quitter sans terminer
                </button>
              )}
              {homeHref && (
                <Link href={homeHref as Route} className={`${AUTH_LINK_CLASS} hover:underline`}>
                  Menu principal
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
