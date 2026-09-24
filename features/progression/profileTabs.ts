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
