"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProfileSummary } from "@/features/progression/profileActions";
import { ProfileView, waitingCounts, type ProfileTab } from "@/features/progression/ProfileView";
import type { ProfilePanel } from "@/features/progression/profileTabs";
import sceneStyles from "@/features/progression/ProfileScreen.module.css";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

interface ProfileScreenProps {
  profile: ProfileSummary;
  initialTab?: ProfileTab;
  /** Fenêtre du hub à ouvrir d'emblée (`?panneau=`). */
  initialPanel?: ProfilePanel;
}

/**
 * Page `/profil` — la SEULE porte du profil (25/09/2026 : plus de panneau
 * par-dessus l'écran en cours). Le bandeau, les raccourcis et les alertes
 * y mènent sur le bon onglet (`profileHref`).
 */
/** Onglets de la page, dans le bandeau commun (à gauche, le logo reste au centre). */
const PAGE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "carnet", label: "Profil" },
  { id: "recompenses", label: "Récompenses" },
  { id: "quetes", label: "Quêtes" },
  { id: "exploits", label: "Exploits" },
];

export function ProfileScreen({ profile, initialTab, initialPanel }: ProfileScreenProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ProfileTab>(initialTab ?? "carnet");
  // Déjà sur la page, un raccourci du bandeau change l'URL : l'onglet suit.
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  if (!profile.isSignedIn) {
    return (
      <GameScreen active={null} nav="minimal">
        <div className={game.content}>
          <div className={game.contentWide}>
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Connecte-toi pour suivre ta progression</p>
              <p className={game.muted}>Niveau, quêtes, exploits et récompenses de connexion vivent sur ton compte.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()}>
                Se connecter
              </Link>
            </div>
          </div>
        </div>
      </GameScreen>
    );
  }

  const waiting = waitingCounts(profile);
  const badgeFor = (id: ProfileTab) =>
    id === "carnet" ? waiting.login : id === "recompenses" ? waiting.levels : id === "quetes" ? waiting.quests : waiting.achievements;

  return (
    <GameScreen
      active={null}
      nav="minimal"
      className={tab === "recompenses" ? sceneStyles.screenPort : sceneStyles.screen}
      tabs={PAGE_TABS.map((entry) => {
        const badge = badgeFor(entry.id);
        return {
          id: entry.id,
          active: tab === entry.id,
          onSelect: () => setTab(entry.id),
          label: (
            <>
              {entry.label}
              {badge > 0 && (
                <span className={sceneStyles.tabBadge} aria-label={`${badge} à réclamer`}>
                  {badge}
                </span>
              )}
            </>
          ),
        };
      })}
    >
      <ProfileView profile={profile} layout="page" tab={tab} onTabChange={setTab} onRefresh={() => router.refresh()} initialPanel={initialPanel} />
    </GameScreen>
  );
}
