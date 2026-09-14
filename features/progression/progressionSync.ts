/**
 * Synchronisation du BANDEAU après une écriture qui touche au compte
 * (achat, réclamation de quête…).
 *
 * `HeaderPlayer` lit la progression une fois au montage, et la coquille
 * n'est pas remontée par `router.refresh()` : sans signal, le solde du
 * bandeau resterait figé sur sa première lecture pendant que l'écran, lui,
 * se met à jour. Un événement de fenêtre suffit — l'émetteur ne connaît
 * pas le bandeau, le bandeau ne connaît pas les écrans.
 *
 * L'événement ne transporte AUCUNE valeur : le bandeau relit la base. Un
 * solde calculé côté client n'aurait pas plus d'autorité ici qu'ailleurs.
 */
import type { ProgressionSummary } from "@/features/progression/actions";

const PROGRESSION_CHANGED = "tidebound:progression-changed";

/** À appeler après toute écriture serveur réussie qui modifie Tides, XP ou niveau. */
export function notifyProgressionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PROGRESSION_CHANGED));
}

/** Abonnement ; renvoie la fonction de désabonnement (prête pour un `useEffect`). */
export function onProgressionChanged(listener: () => void): () => void {
  window.addEventListener(PROGRESSION_CHANGED, listener);
  return () => window.removeEventListener(PROGRESSION_CHANGED, listener);
}

/**
 * Dernière progression lue, partagée entre les bandeaux successifs (chaque
 * écran monte le sien) pour qu'ils l'affichent sans attendre leur propre
 * lecture. Jamais celle d'un visiteur déconnecté.
 */
let lastProgression: ProgressionSummary | null = null;

export function rememberedProgression(): ProgressionSummary | null {
  return lastProgression;
}

export function rememberProgression(summary: ProgressionSummary): void {
  lastProgression = summary.isSignedIn ? summary : null;
}

/** À la déconnexion : le prochain bandeau ne doit pas afficher, même un instant, le compte précédent. */
export function forgetProgression(): void {
  lastProgression = null;
}
