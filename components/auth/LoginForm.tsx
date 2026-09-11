"use client";

import { useState } from "react";
import { signInWithPassword } from "@/app/connexion/actions";
import { AUTH_INPUT_CLASS, AUTH_LINK_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";
import { EmailField } from "@/components/auth/EmailField";
import { PasswordField } from "@/components/auth/PasswordField";

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
  const [password, setPassword] = useState("");

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
    <form action={handleSubmit} className="flex flex-col gap-3.5">
      <div className="mb-1 flex flex-col items-center gap-1 text-center">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Connexion</h2>
        <p className="text-xs text-[var(--text-secondary)]">Content de te revoir sur Tidebound.</p>
      </div>
      <EmailField name="email" placeholder="toi@exemple.com" autoComplete="email" className={AUTH_INPUT_CLASS} />
      <PasswordField
        name="password"
        placeholder="Mot de passe"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <button type="submit" disabled={status === "loading"} className={AUTH_PRIMARY_BUTTON_CLASS}>
        {status === "loading" ? "Connexion..." : "Se connecter"}
      </button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" onClick={onForgotPassword} className={`${AUTH_LINK_CLASS} hover:underline`}>
          Mot de passe oublié ?
        </button>
        <button type="button" onClick={onSwitchToSignup} className={`${AUTH_LINK_CLASS} hover:underline`}>
          Créer un compte
        </button>
      </div>
    </form>
  );
}
