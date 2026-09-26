/**
 * Onglets du profil — aussi les valeurs acceptées par `/profil?onglet=`.
 * Module à part : la page serveur les lit, et un module `"use client"` ne
 * lui livrerait qu'une référence, pas le tableau.
 */
export const PROFILE_TABS = ["carnet", "recompenses", "quetes", "exploits"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export function parseProfileTab(value: unknown): ProfileTab | undefined {
  return PROFILE_TABS.find((tab) => tab === value);
}

/** Fenêtres du hub des Récompenses ouvrables par l'URL (`/profil?onglet=recompenses&panneau=mecenes`). */
export const PROFILE_PANELS = { mecenes: "sponsors", maitrises: "masteries" } as const;
export type ProfilePanel = (typeof PROFILE_PANELS)[keyof typeof PROFILE_PANELS];

export function parseProfilePanel(value: unknown): ProfilePanel | undefined {
  return typeof value === "string" && value in PROFILE_PANELS ? PROFILE_PANELS[value as keyof typeof PROFILE_PANELS] : undefined;
}

/** Lien vers la page du profil, sur le bon onglet (et la bonne fenêtre du hub). */
export function profileHref(tab: ProfileTab, panel?: keyof typeof PROFILE_PANELS): string {
  return `/profil?onglet=${tab}${panel ? `&panneau=${panel}` : ""}`;
}

/**
 * SIGNAL « ouvre le profil ici » — envoyé par les raccourcis du bandeau EN
 * PLUS de la navigation (`profileHref`). Déjà sur la page, l'URL ne suffit
 * pas : si elle ne change pas (fenêtre refermée puis redemandée, onglet
 * changé à la main entre-temps), la page ne réagissait pas et le raccourci
 * « ne renvoyait à rien ». La page et le hub écoutent ce signal : ils
 * changent d'onglet et ouvrent la fenêtre à chaque clic.
 */
export const PROFILE_OPEN_EVENT = "tidebound:profil-ouvrir";

export interface ProfileOpenRequest {
  tab: ProfileTab;
  panel?: ProfilePanel;
}

export function requestProfileOpen(tab: ProfileTab, panel?: keyof typeof PROFILE_PANELS): void {
  if (typeof window === "undefined") return;
  const detail: ProfileOpenRequest = { tab, panel: panel ? PROFILE_PANELS[panel] : undefined };
  window.dispatchEvent(new CustomEvent<ProfileOpenRequest>(PROFILE_OPEN_EVENT, { detail }));
}

/** S'abonne aux demandes d'ouverture ; rend la fonction de désabonnement (pour un `useEffect`). */
export function onProfileOpenRequest(listener: (request: ProfileOpenRequest) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<ProfileOpenRequest>).detail);
  window.addEventListener(PROFILE_OPEN_EVENT, handler);
  return () => window.removeEventListener(PROFILE_OPEN_EVENT, handler);
}
