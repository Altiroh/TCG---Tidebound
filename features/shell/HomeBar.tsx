"use client";

import { useEffect } from "react";
import { forgetProgression } from "@/features/progression/progressionSync";
import { ScreenHeader } from "@/features/shell/ScreenHeader";
import styles from "@/features/shell/ScreenShell.module.css";

/**
 * Bandeau du menu principal : le même que sur tous les écrans (onglets de
 * la collection, compte, quêtes, options), sans retour ni logo.
 *
 * Remplace la ligne « Connecté en tant que… · Se déconnecter » du bas de
 * l'écran : le compte se lit en haut, comme ailleurs, et la déconnexion vit
 * désormais au pied du Profil.
 *
 * `nav="menu"` n'en garde QUE le compte et les options, à droite, et
 * retire jusqu'au voile du bandeau : un menu qui porte déjà sa navigation
 * (la carte marine et ses parchemins) n'a pas à la répéter en haut.
 */
export function HomeBar({ isSignedIn, nav = "home" }: { isSignedIn: boolean; nav?: "home" | "menu" }) {
  // Le menu est rendu par le serveur : s'il dit « déconnecté », le compte
  // mémorisé par les bandeaux précédents n'a plus à s'afficher, même un instant.
  useEffect(() => {
    if (!isSignedIn) forgetProgression();
  }, [isSignedIn]);

  return (
    <div className={styles.homeBar} data-nav={nav}>
      <ScreenHeader active={null} nav={nav} />
    </div>
  );
}
