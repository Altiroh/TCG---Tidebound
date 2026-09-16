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
  lastReadAt = 0;
}

/** Instant de la dernière lecture réussie, pour `readProgression`. */
let lastReadAt = 0;
/** Lecture en cours, partagée : deux bandeaux montés coup sur coup n'en font qu'une. */
let inflight: Promise<ProgressionSummary> | null = null;

/**
 * Au-delà, une lecture au montage repart au serveur. En deçà, le bandeau se
 * contente de la dernière — un changement d'écran monte DEUX bandeaux
 * (l'écran de chargement, puis la page), et chacun relisait tout.
 */
const FRESH_FOR_MS = 15_000;

/**
 * Progression du bandeau, dédoublonnée. `force` : relecture obligatoire —
 * c'est le cas après un achat, une quête réclamée… (`notifyProgressionChanged`).
 * Sans `force`, une lecture récente ou déjà en route est réutilisée.
 */
export function readProgression(fetcher: () => Promise<ProgressionSummary>, force = false): Promise<ProgressionSummary> {
  if (!force && lastProgression && Date.now() - lastReadAt < FRESH_FOR_MS) return Promise.resolve(lastProgression);
  if (!force && inflight) return inflight;
  const request = fetcher().then((summary) => {
    rememberProgression(summary);
    lastReadAt = Date.now();
    return summary;
  });
  inflight = request;
  void request.finally(() => {
    if (inflight === request) inflight = null;
  }).catch(() => undefined);
  return request;
}
