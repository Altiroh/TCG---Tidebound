/**
 * SIGNAL « ouvre le panneau Amis » — les amis n'ont plus de page : tout vit
 * dans le panneau qu'ouvre l'icône du bandeau (`HeaderPlayer`). Ailleurs
 * (alerte d'échange, profil, écran Partie), un lien l'ouvre par ce signal.
 */
export const FRIENDS_PANEL_EVENT = "tidebound:amis-ouvrir";

export function requestFriendsPanel(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FRIENDS_PANEL_EVENT));
}

/** S'abonne aux demandes d'ouverture ; rend la fonction de désabonnement (pour un `useEffect`). */
export function onFriendsPanelRequest(listener: () => void): () => void {
  window.addEventListener(FRIENDS_PANEL_EVENT, listener);
  return () => window.removeEventListener(FRIENDS_PANEL_EVENT, listener);
}
