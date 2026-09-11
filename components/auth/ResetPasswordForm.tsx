"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePassword } from "@/app/connexion/actions";
import { AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";
import { PasswordField } from "@/components/auth/PasswordField";
import { evaluatePasswordStrength, MIN_SIGNUP_PASSWORD_SCORE } from "@/components/auth/passwordStrength";

/** Choix du nouveau mot de passe, atterri depuis le lien email (session "recovery" temporaire déjà posée par `/auth/callback`). */
export function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
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
    const result = await updatePassword(formData);
    if (result.ok) {
      setStatus("done");
      setTimeout(() => router.push("/"), 1500);
    } else {
      setStatus("error");
      setError(result.error ?? "Une erreur est survenue.");
    }
  }

  if (status === "done") {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-xl font-semibold text-white">Mot de passe mis à jour</h2>
        <p className="text-sm text-slate-300">Redirection vers le menu...</p>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-white">Nouveau mot de passe</h2>
      <PasswordField
        name="password"
        placeholder="Nouveau mot de passe (8 caractères min.)"
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
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={status === "loading" || strengthTooLow}
        title={strengthTooLow ? "Mot de passe trop faible" : undefined}
        className={AUTH_PRIMARY_BUTTON_CLASS}
      >
        {status === "loading" ? "Mise à jour..." : "Mettre à jour"}
      </button>
    </form>
  );
}
