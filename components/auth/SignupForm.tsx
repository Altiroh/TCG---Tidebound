"use client";

import { useState } from "react";
import { signUpWithPassword } from "@/app/connexion/actions";
import { AUTH_INPUT_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";

interface SignupFormProps {
  /** Appelé seulement si une session est immédiatement ouverte (confirmation email désactivée côté projet Supabase). */
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

/**
 * Création de compte — email/mot de passe/nom d'affichage. Un compte flambant
 * neuf ne possède aucune carte (`player_cards` reste vide tant qu'aucun
 * booster n'a été ouvert) : seuls les decks préconstruits sont jouables en
 * attendant, d'où le rappel explicite ci-dessous plutôt qu'une surprise
 * silencieuse dans la Collection.
 */
export function SignupForm({ onSuccess, onSwitchToLogin }: SignupFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "check-email">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setStatus("error");
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setStatus("loading");
    setError(null);
    const result = await signUpWithPassword(formData);
    if (!result.ok) {
      setStatus("error");
      setError(result.error ?? "Une erreur est survenue.");
      return;
    }

    if (result.needsEmailConfirmation) {
      setStatus("check-email");
    } else {
      onSuccess();
    }
  }

  if (status === "check-email") {
    return (
      <div className="flex flex-col gap-3 text-center">
        <h2 className="text-xl font-semibold text-white">Vérifie ta boîte mail</h2>
        <p className="text-sm text-slate-300">
          Un email de confirmation vient de t&apos;être envoyé. Clique sur le lien qu&apos;il contient pour activer
          ton compte, puis reviens te connecter.
        </p>
        <button type="button" onClick={onSwitchToLogin} className="text-sm text-board-accent hover:underline">
          ← Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-white">Créer un compte</h2>
      <input
        type="text"
        name="displayName"
        placeholder="Nom d'affichage (optionnel)"
        autoComplete="nickname"
        className={AUTH_INPUT_CLASS}
      />
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
        minLength={8}
        placeholder="Mot de passe (8 caractères min.)"
        autoComplete="new-password"
        className={AUTH_INPUT_CLASS}
      />
      <input
        type="password"
        name="confirmPassword"
        required
        minLength={8}
        placeholder="Confirmer le mot de passe"
        autoComplete="new-password"
        className={AUTH_INPUT_CLASS}
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button type="submit" disabled={status === "loading"} className={AUTH_PRIMARY_BUTTON_CLASS}>
        {status === "loading" ? "Création..." : "Créer mon compte"}
      </button>
      <p className="text-center text-xs text-slate-400">
        Aucune carte au départ : tu pourras jouer avec les decks préconstruits en attendant d&apos;ouvrir des
        boosters.
      </p>
      <button
        type="button"
        onClick={onSwitchToLogin}
        className="text-center text-xs text-slate-300 hover:text-board-accent hover:underline"
      >
        Déjà un compte ? Se connecter
      </button>
    </form>
  );
}
