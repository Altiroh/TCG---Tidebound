/**
 * Chemin de redirection INTERNE, ou `/` à défaut.
 *
 * `next` arrive dans l'URL : sans ce filtre, `/auth/callback?next=https://…`
 * (ou `//hote`, ou `/\hote`, que les navigateurs lisent comme une URL
 * absolue) renvoyait le joueur, depuis notre domaine, vers n'importe quel
 * site — une page de connexion imitée, typiquement.
 */
export function safeInternalPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  // Un seul `/` en tête, et aucun caractère qu'un navigateur réinterprète.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    // Dernier garde-fou : résolu contre une origine factice, le chemin doit y rester.
    const url = new URL(next, "https://tidebound.invalid");
    if (url.origin !== "https://tidebound.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
