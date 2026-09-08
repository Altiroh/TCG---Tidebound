"use client";

import { useState } from "react";
import Link from "next/link";
import { sendMagicLink } from "@/app/connexion/actions";
import { Button } from "@/components/ui/Button";

export default function ConnexionPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("sending");
    setError(null);
    const result = await sendMagicLink(formData);
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(result.error ?? "Une erreur est survenue.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Connexion</h1>
      {status === "sent" ? (
        <p className="text-sm text-slate-300">
          Lien envoyé ! Vérifie ta boîte mail et clique dessus pour te connecter.
        </p>
      ) : (
        <form action={handleSubmit} className="flex w-full flex-col gap-3">
          <input
            type="email"
            name="email"
            required
            placeholder="toi@exemple.com"
            className="rounded-md border border-slate-700 bg-board-surface px-3 py-2 text-sm text-slate-100"
          />
          <Button type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Envoi..." : "Recevoir un lien de connexion"}
          </Button>
        </form>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <p className="text-xs text-slate-500">Pas de mot de passe : un lien à usage unique est envoyé par email.</p>
      <Link href="/" className="text-sm text-board-accent hover:underline">
        ← Menu
      </Link>
    </main>
  );
}
