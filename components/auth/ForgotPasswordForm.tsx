"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/app/connexion/actions";
import { AUTH_INPUT_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

/** Demande d'un lien de réinitialisation par email — le lien ramène sur `/reinitialiser-mot-de-passe` via `/auth/callback`. */
export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("loading");
    setError(null);
    const result = await requestPasswordReset(formData);
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(result.error ?? "Une erreur est survenue.");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-3 text-center">
        <h2 className="text-xl font-semibold text-white">Email envoyé</h2>
        <p className="text-sm text-slate-300">
          Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient d&apos;être
          envoyé.
        </p>
        <button type="button" onClick={onBackToLogin} className="text-sm text-board-accent hover:underline">
          ← Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-white">Mot de passe oublié</h2>
      <p className="text-sm text-slate-300">On t&apos;envoie un lien pour en choisir un nouveau.</p>
      <input
        type="email"
        name="email"
        required
        placeholder="toi@exemple.com"
        autoComplete="email"
        className={AUTH_INPUT_CLASS}
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button type="submit" disabled={status === "loading"} className={AUTH_PRIMARY_BUTTON_CLASS}>
        {status === "loading" ? "Envoi..." : "Envoyer le lien"}
      </button>
      <button
        type="button"
        onClick={onBackToLogin}
        className="text-center text-xs text-slate-300 hover:text-board-accent hover:underline"
      >
        ← Retour à la connexion
      </button>
    </form>
  );
}
