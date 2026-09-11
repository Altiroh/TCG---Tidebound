"use client";

import { useState } from "react";
import { signUpWithPassword } from "@/app/connexion/actions";
import { AUTH_INPUT_CLASS, AUTH_LINK_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";
import { EmailField } from "@/components/auth/EmailField";
import { PasswordField } from "@/components/auth/PasswordField";
import { evaluatePasswordStrength, MIN_SIGNUP_PASSWORD_SCORE } from "@/components/auth/passwordStrength";

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
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const strength = evaluatePasswordStrength(password);
  const strengthTooLow = password.length > 0 && strength.score < MIN_SIGNUP_PASSWORD_SCORE;

  async function handleSubmit(formData: FormData) {
    if (strength.score < MIN_SIGNUP_PASSWORD_SCORE) {
      setStatus("error");
      setError(`Mot de passe trop faible : au moins "${evaluatePasswordStrength("a".repeat(8)).label}" est requis.`);
      return;
    }
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
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Vérifie ta boîte mail</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Un email de confirmation vient de t&apos;être envoyé. Clique sur le lien qu&apos;il contient pour activer
          ton compte, puis reviens te connecter.
        </p>
        <button type="button" onClick={onSwitchToLogin} className={`text-sm ${AUTH_LINK_CLASS} hover:underline`}>
          ← Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <div className="mb-1 flex flex-col items-center gap-1 text-center">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Créer un compte</h2>
        <p className="text-xs text-[var(--text-secondary)]">Rejoins Tidebound en quelques secondes.</p>
      </div>
      <input
        type="text"
        name="displayName"
        placeholder="Nom d'affichage (optionnel)"
        autoComplete="nickname"
        className={AUTH_INPUT_CLASS}
      />
      <EmailField name="email" placeholder="toi@exemple.com" autoComplete="email" className={AUTH_INPUT_CLASS} />
      <PasswordField
        name="password"
        placeholder="Mot de passe (8 caractères min.)"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        showStrength
      />
      <PasswordField
        name="confirmPassword"
        placeholder="Confirmer le mot de passe"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <button
        type="submit"
        disabled={status === "loading" || strengthTooLow}
        title={strengthTooLow ? "Mot de passe trop faible" : undefined}
        className={AUTH_PRIMARY_BUTTON_CLASS}
      >
        {status === "loading" ? "Création..." : "Créer mon compte"}
      </button>
      <p className="text-center text-xs text-[var(--text-secondary)]">
        Aucune carte au départ : tu pourras jouer avec les decks préconstruits en attendant d&apos;ouvrir des
        boosters.
      </p>
      <button
        type="button"
        onClick={onSwitchToLogin}
        className={`text-center text-xs ${AUTH_LINK_CLASS} hover:underline`}
      >
        Déjà un compte ? Se connecter
      </button>
    </form>
  );
}
