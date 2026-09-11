"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGlassPanel, AUTH_LINK_CLASS, AUTH_PRIMARY_BUTTON_CLASS, AUTH_SECONDARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

const GUEST_DISMISS_KEY = "tidebound:guest-play";

type ModalView = "closed" | "choice" | "login" | "signup" | "forgot";

interface AuthGateModalProps {
  isSignedIn: boolean;
}

/**
 * Modal "verre liquide" affichée à l'arrivée sur le menu tant qu'aucun compte
 * n'est connecté : propose de se connecter, de créer un compte, ou de jouer
 * sans compte. Le choix "jouer sans compte" est mémorisé en localStorage pour
 * ne pas re-harceler le joueur à chaque visite sur ce navigateur — un compte
 * réellement connecté (déduit du rendu serveur de la page d'accueil) ne
 * ré-affiche jamais la modal.
 */
export function AuthGateModal({ isSignedIn }: AuthGateModalProps) {
  const router = useRouter();
  const [view, setView] = useState<ModalView>("closed");

  useEffect(() => {
    if (isSignedIn) return;
    try {
      if (localStorage.getItem(GUEST_DISMISS_KEY) === "1") return;
    } catch {
      // Stockage indisponible (navigation privée stricte, etc.) : on affiche
      // quand même la modal, simplement sans mémorisation possible.
    }
    setView("choice");
  }, [isSignedIn]);

  useEffect(() => {
    if (view === "closed") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismissAsGuest();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function dismissAsGuest() {
    try {
      localStorage.setItem(GUEST_DISMISS_KEY, "1");
    } catch {
      // Pas grave : la modal réapparaîtra simplement au prochain chargement.
    }
    setView("closed");
  }

  function handleAuthenticated() {
    setView("closed");
    router.refresh();
  }

  if (view === "closed") return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={dismissAsGuest}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
        <AuthGlassPanel>
          {view !== "choice" && (
            <button
              type="button"
              onClick={() => setView("choice")}
              aria-label="Retour"
              className={`absolute left-4 top-4 z-10 ${AUTH_LINK_CLASS}`}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {view === "choice" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Bienvenue sur Tidebound</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Connecte-toi pour garder ta progression, ou lance une partie tout de suite sans compte.
              </p>
              <button type="button" onClick={() => setView("login")} className={AUTH_PRIMARY_BUTTON_CLASS}>
                Se connecter
              </button>
              <button type="button" onClick={() => setView("signup")} className={AUTH_SECONDARY_BUTTON_CLASS}>
                Créer un compte
              </button>
              <button type="button" onClick={dismissAsGuest} className={`text-sm ${AUTH_LINK_CLASS} hover:underline`}>
                Jouer sans compte
              </button>
            </div>
          )}

          {view === "login" && (
            <LoginForm
              onSuccess={handleAuthenticated}
              onForgotPassword={() => setView("forgot")}
              onSwitchToSignup={() => setView("signup")}
            />
          )}

          {view === "signup" && (
            <SignupForm onSuccess={handleAuthenticated} onSwitchToLogin={() => setView("login")} />
          )}

          {view === "forgot" && <ForgotPasswordForm onBackToLogin={() => setView("login")} />}
        </AuthGlassPanel>
      </div>
    </div>
  );
}
