"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_LINK_CLASS } from "@/components/auth/AuthGlassPanel";
import { PasswordField } from "@/components/auth/PasswordField";
import { deleteAccount } from "@/features/settings/actions";
import { forgetProgression } from "@/features/progression/progressionSync";

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
          <p className="text-sm text-[var(--text-primary)]">Supprimer le compte</p>
          <p className="text-xs text-[var(--text-secondary)]">Efface définitivement le compte et toute sa progression.</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 whitespace-nowrap text-xs text-[var(--danger)] transition-colors hover:underline"
        >
          Supprimer
        </button>
      </div>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="mt-2 flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--danger)]/35 bg-[var(--danger)]/[0.07] p-3"
    >
      <div>
        <p className="text-sm text-[var(--text-primary)]">Supprimer définitivement le compte ?</p>
        <p className="text-xs text-[var(--text-secondary)]">
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
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "loading" || password.length === 0}
          className="flex-1 rounded-[var(--radius-sm)] bg-[var(--danger)] px-4 py-2 text-sm font-medium text-[#f6efe6] transition duration-150 ease-out hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
        >
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
