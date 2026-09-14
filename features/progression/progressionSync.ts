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
