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
