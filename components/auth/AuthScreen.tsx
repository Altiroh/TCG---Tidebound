"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { AuthGlassPanel } from "@/components/auth/AuthGlassPanel";
import shell from "@/features/shell/ScreenShell.module.css";
import game from "@/features/shell/GameScreen.module.css";

interface AuthScreenProps {
  children: ReactNode;
}

/**
 * Coquille des pages d'authentification : le décor du port, le logo, et le
 * formulaire dans un panneau centré — RIEN d'autre (28/09/2026).
 *
 * Plus de jeu sans compte : sans session, le middleware renvoie ici toute
 * page du jeu. Ni bandeau (onglets, « Se connecter », options), ni lien
 * « Jouer sans compte » : ils menaient tous vers des pages fermées, donc
 * de nouveau ici. La logique d'auth reste entièrement dans les formulaires.
 */
export function AuthScreen({ children }: AuthScreenProps) {
  return (
    <div className={`${shell.screen} ${game.screen}`} data-backdrop="port" style={{ gridTemplateRows: "minmax(0, 1fr)" }}>
      <main
        className={game.content}
        style={{
          display: "grid",
          // Centrage « sûr » : le panneau se centre par ses marges auto, qui
          // retombent à 0 quand il dépasse. Avec `place-items: center`, un
          // panneau plus haut que l'écran (téléphone couché, clavier ouvert)
          // débordait AUSSI par le haut, hors de portée du défilement.
          justifyItems: "center",
          overflowY: "auto",
          padding: "calc(16px + var(--tb-safe-top)) calc(16px + var(--tb-safe-right)) calc(16px + var(--tb-safe-bottom)) calc(16px + var(--tb-safe-left))",
        }}
      >
        <div style={{ width: "min(100%, 400px)", marginBlock: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(8px, 3dvh, 28px)" }}>
          <Image
            src="/assets/menu/logo/tidebound-logo.webp"
            alt="Tidebound"
            width={1600}
            height={631}
            sizes="320px"
            priority
            // Réduit selon la HAUTEUR : sur un téléphone couché, le formulaire passe avant le logo.
            style={{ width: "min(320px, 70vw, 30dvh)", height: "auto", filter: "drop-shadow(0 6px 18px rgba(0, 0, 0, 0.65))" }}
          />
          <AuthGlassPanel>{children}</AuthGlassPanel>
        </div>
      </main>
    </div>
  );
}
