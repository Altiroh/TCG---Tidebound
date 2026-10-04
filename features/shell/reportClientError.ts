"use server";

import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Trace d'un plantage d'affichage, envoyée par une frontière d'erreur
 * (`app/error.tsx`, `app/en-ligne/[matchId]/error.tsx`).
 *
 * Une erreur de rendu CÔTÉ NAVIGATEUR ne laisse aucune trace serveur : la
 * page « Avarie » s'affiche sans « Référence », et rien n'arrive dans les
 * journaux Vercel. Cette action y écrit le message et le haut de la pile,
 * pour qu'un plantage signalé par un joueur se retrouve (04/10/2026 : sorties
 * de partie contre le bot, impossibles à reproduire sans la pile).
 *
 * Rien n'est stocké : une ligne de journal, tronquée. Le compte n'est noté
 * que s'il y a une session (identifiant, jamais l'adresse).
 */
export async function reportClientError(report: { where: string; message: string; stack?: string; digest?: string; path?: string }): Promise<void> {
  const user = await getSessionUser().catch(() => null);
  const clip = (text: string | undefined, max: number) => (text ?? "").slice(0, max);
  console.error(
    "[client-error]",
    JSON.stringify({
      where: clip(report.where, 60),
      path: clip(report.path, 200),
      user: user?.id ?? null,
      digest: clip(report.digest, 60),
      message: clip(report.message, 500),
      stack: clip(report.stack, 2000),
    })
  );
}
