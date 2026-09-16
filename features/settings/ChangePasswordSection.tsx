"use client";

import { useState } from "react";
import { AUTH_LINK_CLASS, AUTH_PRIMARY_BUTTON_CLASS } from "@/components/auth/AuthGlassPanel";
import { PasswordField } from "@/components/auth/PasswordField";
import { changePassword } from "@/features/settings/actions";
import game from "@/features/shell/GameScreen.module.css";

/**
 * Changement de mot de passe depuis les Options — repliée par défaut : le
 * dialogue doit se lire d'un coup d'œil, trois champs de mot de passe
 * dépliés en permanence en feraient un formulaire.
 */
export function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  async function handleSubmit(formData: FormData) {
    setStatus("loading");
    setError(null);
    const result = await changePassword(formData);
    if (result.ok) {
      setStatus("done");
      reset();
      setOpen(false);
    } else {
      setStatus("idle");
      setError(result.error ?? "Une erreur est survenue.");
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <p className={game.controlRowLabel}>Mot de passe</p>
          <p className={game.controlRowText}>
            {status === "done" ? "Mot de passe mis à jour." : "Change le mot de passe de ton compte."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setOpen(true);
          }}
          className={`${game.secondary} ${game.buttonSm} shrink-0`}
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3 py-2">
      <p className={game.controlRowLabel}>Changer le mot de passe</p>
      <PasswordField
        name="currentPassword"
        placeholder="Mot de passe actuel"
        autoComplete="current-password"
        value={currentPassword}
        onChange={setCurrentPassword}
      />
      <PasswordField
        name="newPassword"
        placeholder="Nouveau mot de passe"
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
        showStrength
      />
      <PasswordField
        name="confirmPassword"
        placeholder="Confirmer le nouveau mot de passe"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      {error && <p className={game.error}>{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={status === "loading"} className={`${AUTH_PRIMARY_BUTTON_CLASS} flex-1`}>
          {status === "loading" ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className={`text-xs ${AUTH_LINK_CLASS} hover:underline`}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
