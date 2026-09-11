"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePassword } from "@/app/connexion/actions";
import { AUTH_INPUT_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";

/** Choix du nouveau mot de passe, atterri depuis le lien email (session "recovery" temporaire déjà posée par `/auth/callback`). */
export function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
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
      <input
        type="password"
        name="password"
        required
        minLength={8}
        placeholder="Nouveau mot de passe (8 caractères min.)"
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
        {status === "loading" ? "Mise à jour..." : "Mettre à jour"}
      </button>
    </form>
  );
}
