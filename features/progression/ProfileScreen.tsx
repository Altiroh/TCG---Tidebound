"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProfileSummary } from "@/features/progression/profileActions";
import { ProfileView, type ProfileTab } from "@/features/progression/ProfileView";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

interface ProfileScreenProps {
  profile: ProfileSummary;
  initialTab?: ProfileTab;
}

/**
 * Page `/profil` — le même contenu que le panneau ouvert depuis le bandeau
 * (`ProfileDrawer`), pour les liens directs et les retours arrière. Le
 * bandeau, lui, ouvre le panneau sans quitter l'écran en cours.
 */
export function ProfileScreen({ profile, initialTab }: ProfileScreenProps) {
  const router = useRouter();

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

  return (
    <GameScreen active={null} nav="minimal">
      <ProfileView profile={profile} initialTab={initialTab} onRefresh={() => router.refresh()} />
    </GameScreen>
  );
}
