"use client";

import { usePathname } from "next/navigation";
import type { ProgressionSummary } from "@/features/progression/actions";
import type { PROFILE_PANELS, ProfileTab } from "@/features/progression/profileTabs";
import { useInterfaceSettings } from "@/lib/settings";
import styles from "@/features/shell/RewardShortcuts.module.css";

interface Shortcut {
  id: string;
  /** Ce qui attend, en toutes lettres (survol, lecteurs d'écran). */
  label: string;
  /** Deux ou trois mots sous le chiffre, comme les losanges du profil. */
  caption: string;
  count: number;
  tab: ProfileTab;
  /** Fenêtre du hub à ouvrir en arrivant (colis de mécène → la fenêtre des mécènes). */
  panel?: keyof typeof PROFILE_PANELS;
  /** Visuel peint de la récompense. */
  icon: string;
}

/**
 * Raccourcis FLOTTANTS vers ce qui attend d'être réclamé, empilés sous le
 * bloc du compte en haut à droite — dans le LOSANGE des statistiques du
 * profil (`stat-diamond.webp`) : le visuel de la récompense, son compte, et
 * deux mots. La lueur chaude du menu principal au survol ; un clic ouvre le
 * profil sur le bon onglet.
 *
 * Partout, sauf en partie (la table n'a pas ce bandeau). Options ›
 * Interface › « Afficher les informations de récompenses rapides ».
 */
export function RewardShortcuts({
  summary,
  onOpen,
}: {
  summary: ProgressionSummary;
  onOpen: (tab: ProfileTab, panel?: keyof typeof PROFILE_PANELS) => void;
}) {
  const pathname = usePathname();
  const { rewardShortcuts } = useInterfaceSettings();
  const b = summary.claimableBreakdown;
  const giftFrom = summary.sponsorGiftFrom[0];

  const all: Shortcut[] = [
    {
      id: "chest",
      label: "Le coffre de la semaine est plein",
      caption: "Coffre",
      count: summary.weeklyChestReady ? 1 : 0,
      tab: "recompenses",
      icon: "/assets/rewards/coffre/coffre-ferme.webp",
    },
    {
      id: "sponsorGifts",
      label: b.sponsorGifts > 1 ? `${b.sponsorGifts} colis de mécènes à ouvrir` : "Un mécène vous a envoyé un colis",
      caption: b.sponsorGifts > 1 ? "Colis" : "Colis",
      count: b.sponsorGifts,
      tab: "recompenses",
      panel: "mecenes",
      // L'insigne du mécène qui l'envoie ; plusieurs : le premier.
      icon: giftFrom ? `/assets/mecenes/${giftFrom}-insigne.webp` : "/assets/mecenes/coffret/coffret-ferme.webp",
    },
    {
      id: "levels",
      label: b.levels > 1 ? `${b.levels} paliers de niveau à réclamer` : "Un palier de niveau à réclamer",
      caption: "Palier",
      count: b.levels,
      tab: "recompenses",
      // Un niveau franchi : l'étoile de laiton.
      icon: "/assets/decks/liste/icone-favoris.webp",
    },
    {
      id: "cards",
      label: b.cardChoices > 1 ? `${b.cardChoices} cartes à choisir` : "Une carte à choisir",
      caption: "Carte",
      count: b.cardChoices,
      tab: "recompenses",
      icon: "/assets/quests/icon-cat-card.webp",
    },
    {
      id: "login",
      label: "L'escale du jour vous attend",
      caption: "Escale",
      count: b.login,
      tab: "carnet",
      icon: "/assets/profile/icon-streak.webp",
    },
    {
      id: "quests",
      label: b.quests > 1 ? `${b.quests} quêtes terminées` : "Une quête terminée",
      caption: "Quêtes",
      count: b.quests,
      tab: "quetes",
      icon: "/assets/quests/icon-cat-partie.webp",
    },
    {
      id: "achievements",
      label: b.achievements > 1 ? `${b.achievements} exploits à réclamer` : "Un exploit à réclamer",
      caption: "Exploits",
      count: b.achievements,
      tab: "exploits",
      icon: "/assets/quests/icon-cat-stat.webp",
    },
  ];
  const shortcuts = all.filter((shortcut) => shortcut.count > 0);

  // En partie, la table n'a pas ce bandeau ; ailleurs, partout.
  if (!rewardShortcuts || shortcuts.length === 0 || pathname?.startsWith("/partie")) return null;

  return (
    <nav className={styles.stack} aria-label="Récompenses à réclamer">
      {shortcuts.map((shortcut, index) => (
        <button
          key={shortcut.id}
          type="button"
          className={styles.shortcut}
          style={{ animationDelay: `${index * 70}ms` }}
          onClick={() => onOpen(shortcut.tab, shortcut.panel)}
          aria-label={shortcut.label}
          title={shortcut.label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- visuel peint de la récompense */}
          <img className={styles.icon} src={shortcut.icon} alt="" draggable={false} />
          <span className={styles.count}>{shortcut.count}</span>
          <span className={styles.caption}>{shortcut.caption}</span>
        </button>
      ))}
    </nav>
  );
}
