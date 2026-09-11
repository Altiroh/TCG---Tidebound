"use client";

import { useState } from "react";
import { signInWithPassword } from "@/app/connexion/actions";
import { AUTH_INPUT_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";

interface LoginFormProps {
  /** Appelé uniquement après une connexion réussie (session posée côté serveur). */
  onSuccess: () => void;
  onForgotPassword: () => void;
  onSwitchToSignup: () => void;
}

/** Connexion classique email/mot de passe — partagée par la modal d'accueil et la page `/connexion`. */
export function LoginForm({ onSuccess, onForgotPassword, onSwitchToSignup }: LoginFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("loading");
    setError(null);
    const result = await signInWithPassword(formData);
    if (result.ok) {
      onSuccess();
    } else {
      setStatus("error");
      setError(result.error ?? "Une erreur est survenue.");
    }
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-white">Connexion</h2>
      <input
        type="email"
        name="email"
        required
        placeholder="toi@exemple.com"
        autoComplete="email"
        className={AUTH_INPUT_CLASS}
      />
      <input
        type="password"
        name="password"
        required
        placeholder="Mot de passe"
        autoComplete="current-password"
        className={AUTH_INPUT_CLASS}
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button type="submit" disabled={status === "loading"} className={AUTH_PRIMARY_BUTTON_CLASS}>
        {status === "loading" ? "Connexion..." : "Se connecter"}
      </button>
      <div className="flex items-center justify-between text-xs text-slate-300">
        <button type="button" onClick={onForgotPassword} className="hover:text-board-accent hover:underline">
          Mot de passe oublié ?
        </button>
        <button type="button" onClick={onSwitchToSignup} className="hover:text-board-accent hover:underline">
          Créer un compte
        </button>
      </div>
    </form>
  );
}
