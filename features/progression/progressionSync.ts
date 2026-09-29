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
 * L'événement ne transporte AUCUN solde : le bandeau relit la base. Un
 * solde calculé côté client n'aurait pas plus d'autorité ici qu'ailleurs.
 * Il peut seulement dire CE QUI vient d'être réclamé, pour que le raccourci
 * correspondant disparaisse à l'instant plutôt qu'à la fin de la relecture.
 */
import type { ProgressionSummary } from "@/features/progression/actions";

const PROGRESSION_CHANGED = "tidebound:progression-changed";

/**
 * Ce qui vient d'être réclamé, par raccourci du bandeau (`claimableBreakdown`,
 * plus le coffre de la semaine). Ce n'est PAS un solde : juste de quoi
 * retirer tout de suite le raccourci et la pastille, sans attendre la
 * relecture — qui suit de toute façon et fait autorité.
 */
export type ClaimedRewards = Partial<Record<keyof ProgressionSummary["claimableBreakdown"] | "chest", number>>;

/**
 * À appeler après toute écriture serveur réussie qui modifie Tides, XP ou
 * niveau. `claimed` : ce que l'écriture a réclamé, pour que le bandeau le
 * retire à l'instant (`withoutClaimed`).
 */
export function notifyProgressionChanged(claimed?: ClaimedRewards): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ClaimedRewards | undefined>(PROGRESSION_CHANGED, { detail: claimed }));
}

/** Abonnement ; renvoie la fonction de désabonnement (prête pour un `useEffect`). */
export function onProgressionChanged(listener: (claimed?: ClaimedRewards) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<ClaimedRewards | undefined>).detail ?? undefined);
  window.addEventListener(PROGRESSION_CHANGED, handler);
  return () => window.removeEventListener(PROGRESSION_CHANGED, handler);
}

/**
 * La progression affichée, moins ce qui vient d'être réclamé : les raccourcis
 * concernés tombent (compte à zéro), la pastille de l'avatar baisse d'autant.
 * Jamais sous zéro — une réclamation que le bandeau ne comptait pas ne
 * retire rien d'autre.
 */
export function withoutClaimed(summary: ProgressionSummary, claimed: ClaimedRewards): ProgressionSummary {
  const breakdown = { ...summary.claimableBreakdown };
  let removed = 0;
  for (const key of Object.keys(breakdown) as Array<keyof typeof breakdown>) {
    const taken = Math.min(breakdown[key], Math.max(0, claimed[key] ?? 0));
    breakdown[key] -= taken;
    removed += taken;
  }
  return {
    ...summary,
    claimableBreakdown: breakdown,
    claimableRewards: Math.max(0, summary.claimableRewards - removed),
    claimableQuests: Math.min(summary.claimableQuests, breakdown.quests),
    weeklyChestReady: summary.weeklyChestReady && !((claimed.chest ?? 0) > 0),
    loginClaimable: summary.loginClaimable && breakdown.login > 0,
  };
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
