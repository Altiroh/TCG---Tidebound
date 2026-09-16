"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_LINK_CLASS } from "@/components/auth/AuthGlassPanel";
import { PasswordField } from "@/components/auth/PasswordField";
import { deleteAccount } from "@/features/settings/actions";
import { forgetProgression } from "@/features/progression/progressionSync";
import game from "@/features/shell/GameScreen.module.css";

interface DeleteAccountSectionProps {
  /** Refermer le dialogue une fois le compte supprimé — plus rien à y régler côté compte. */
  onDeleted: () => void;
}

/**
 * Suppression définitive du compte : deux verrous volontaires — déplier la
 * zone rouge, puis saisir son mot de passe (vérifié côté serveur) avant que
 * le bouton de confirmation ne devienne actif. Aucune suppression ne peut
 * partir d'un seul clic malheureux.
 */
export function DeleteAccountSection({ onDeleted }: DeleteAccountSectionProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("loading");
    setError(null);
    const result = await deleteAccount(formData);
    if (result.ok) {
      forgetProgression();
      onDeleted();
      // Le rendu serveur du menu repasse en "non connecté" (la session
      // vient d'être détruite côté serveur).
      router.refresh();
    } else {
      setStatus("idle");
      setError(result.error ?? "Une erreur est survenue.");
    }
  }

  if (!confirming) {
    return (
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <p className={game.controlRowLabel}>Supprimer le compte</p>
          <p className={game.controlRowText}>Efface définitivement le compte et toute sa progression.</p>
        </div>
        <button type="button" onClick={() => setConfirming(true)} className={`${game.dangerGhost} ${game.buttonSm} shrink-0`}>
          Supprimer
        </button>
      </div>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="mt-2 flex flex-col gap-3 p-3"
      style={{ border: "1px solid var(--tb-danger-line)", borderRadius: "var(--tb-radius-sm)", background: "var(--tb-danger-soft)" }}
    >
      <div>
        <p className={game.controlRowLabel}>Supprimer définitivement le compte ?</p>
        <p className={game.controlRowText}>
          Collection, decks, boosters, quêtes et progression seront perdus. Cette action est irréversible.
        </p>
      </div>
      <PasswordField
        name="password"
        placeholder="Mot de passe pour confirmer"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />
      {error && <p className={game.error}>{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={status === "loading" || password.length === 0} className={`${game.danger} flex-1`}>
          {status === "loading" ? "Suppression…" : "Supprimer définitivement"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPassword("");
            setError(null);
            setConfirming(false);
          }}
          className={`text-xs ${AUTH_LINK_CLASS} hover:underline`}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
