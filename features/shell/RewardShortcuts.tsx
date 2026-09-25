"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { ProgressionSummary } from "@/features/progression/actions";
import type { PROFILE_PANELS, ProfileTab } from "@/features/progression/profileTabs";
import { useInterfaceSettings } from "@/lib/settings";
import styles from "@/features/shell/RewardShortcuts.module.css";

interface Shortcut {
  id: string;
  label: string;
  count: number;
  tab: ProfileTab;
  /** Fenêtre du hub à ouvrir en arrivant (colis de mécène → la fenêtre des mécènes). */
  panel?: keyof typeof PROFILE_PANELS;
  icon: ReactNode;
}

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Picture({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- icône locale
  return <img src={src} alt="" draggable={false} />;
}

/**
 * Raccourcis FLOTTANTS vers ce qui attend d'être réclamé, empilés sous le
 * bloc du compte en haut à droite : une icône par endroit (palier, escale,
 * carte à choisir, quêtes, exploits), chacune avec la pastille jaune et son
 * compte. Un clic ouvre le profil sur le bon onglet. Rien à réclamer : rien
 * n'apparaît. Jamais en partie (la table n'a pas ce bandeau), ni sur la
 * page du profil, où tout est déjà sous les yeux.
 */
export function RewardShortcuts({
  summary,
  onOpen,
}: {
  summary: ProgressionSummary;
  onOpen: (tab: ProfileTab, panel?: keyof typeof PROFILE_PANELS) => void;
}) {
  const pathname = usePathname();
  // Options › Interface › « Afficher les informations de récompenses rapides ».
  const { rewardShortcuts } = useInterfaceSettings();
  const b = summary.claimableBreakdown;
  const all: Shortcut[] = [
    {
      id: "levels",
      label: b.levels > 1 ? `${b.levels} paliers de niveau à réclamer` : "Un palier de niveau à réclamer",
      count: b.levels,
      tab: "recompenses",
      icon: <Glyph d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9L12 3z" />,
    },
    {
      id: "cards",
      label: b.cardChoices > 1 ? `${b.cardChoices} cartes à choisir` : "Une carte à choisir",
      count: b.cardChoices,
      tab: "recompenses",
      icon: <Glyph d="M7 4h8a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zM9 9h4M9 13h4" />,
    },
    { id: "login", label: "L'escale du jour vous attend", count: b.login, tab: "carnet", icon: <Picture src="/assets/profile/icon-streak.webp" /> },
    {
      id: "quests",
      label: b.quests > 1 ? `${b.quests} quêtes terminées` : "Une quête terminée",
      count: b.quests,
      tab: "quetes",
      icon: <Picture src="/assets/quests/icon-cat-partie.webp" />,
    },
    {
      id: "sponsorGifts",
      label: b.sponsorGifts > 1 ? `${b.sponsorGifts} colis de mécènes à ouvrir` : "Un mécène vous a envoyé un colis",
      count: b.sponsorGifts,
      tab: "recompenses",
      panel: "mecenes",
      icon: <Glyph d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1s3 1 5 1zm0 0c1.5-3 5-3.5 5-1s-3 1-5 1z" />,
    },
    {
      id: "achievements",
      label: b.achievements > 1 ? `${b.achievements} exploits à réclamer` : "Un exploit à réclamer",
      count: b.achievements,
      tab: "exploits",
      icon: <Glyph d="M8 4h8v4a4 4 0 01-8 0V4zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 12v4M9 20h6M10 16h4v4h-4z" />,
    },
  ];
  const shortcuts = all.filter((shortcut) => shortcut.count > 0);

  // Sur la page du profil, tout est déjà sous les yeux : la colonne ferait doublon.
  if (!rewardShortcuts || shortcuts.length === 0 || pathname?.startsWith("/profil")) return null;

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
        >
          <span className={styles.diamond} aria-hidden />
          <span className={styles.icon}>{shortcut.icon}</span>
          <span className={styles.dot} aria-hidden>
            {shortcut.count > 1 ? shortcut.count : ""}
          </span>
          <span className={styles.label} aria-hidden>
            {shortcut.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
