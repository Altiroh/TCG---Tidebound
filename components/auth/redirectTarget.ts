import { safeInternalPath } from "@/lib/safeRedirect";

/**
 * Où revenir après la connexion ou l'inscription : la page demandée avant
 * le renvoi du middleware (`?redirect=`), jamais une adresse extérieure.
 * Lue au moment du succès plutôt que par `useSearchParams` (qui imposerait
 * une frontière Suspense aux pages d'authentification, statiques).
 */
export function redirectTarget(): string {
  if (typeof window === "undefined") return "/";
  return safeInternalPath(new URLSearchParams(window.location.search).get("redirect"));
}

/** La requête courante (`?redirect=…`), à transmettre d'une page d'authentification à l'autre. */
export function currentSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search;
}
