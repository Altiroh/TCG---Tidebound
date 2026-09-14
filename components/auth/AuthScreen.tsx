"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AUTH_LINK_CLASS, AuthGlassPanel } from "@/components/auth/AuthGlassPanel";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";

interface AuthScreenProps {
  children: ReactNode;
  /** Lien de sortie sous le panneau (défaut : « Jouer sans compte »). `null` pour aucun. */
  escape?: { href: string; label: string } | null;
}

/**
 * Coquille des pages d'authentification : le même décor et le même bandeau
 * que le reste du jeu (aucun onglet actif), le formulaire dans un panneau
 * centré. La logique d'auth reste entièrement dans les formulaires.
 */
export function AuthScreen({ children, escape = { href: "/", label: "← Jouer sans compte" } }: AuthScreenProps) {
  return (
    <GameScreen active={null}>
      <div className={game.content} style={{ display: "grid", placeItems: "center" }}>
        <div style={{ width: "min(100%, 400px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <AuthGlassPanel>{children}</AuthGlassPanel>
          {escape && (
            <Link href={escape.href} className={`text-sm ${AUTH_LINK_CLASS} hover:underline`}>
              {escape.label}
            </Link>
          )}
        </div>
      </div>
    </GameScreen>
  );
}
