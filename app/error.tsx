"use client";

import { useEffect } from "react";
import Link from "next/link";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";

/**
 * Incident pendant le rendu d'une route.
 *
 * Next exige ce composant pour récupérer une erreur de rendu pendant une
 * navigation : sans lui, le routeur affiche « missing required error
 * components, refreshing… » et recharge en boucle, ce qui masque l'erreur
 * au lieu de la montrer.
 *
 * `reset()` refait le rendu du segment sans recharger la page : la plupart
 * de ces incidents sont des allers-retours réseau vers Supabase, et réessayer
 * suffit. Le message technique n'est PAS affiché (il partirait chez le
 * joueur) mais reste dans la console pour le développement.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[route] Rendu interrompu :", error);
  }, [error]);

  return (
    <GameScreen active={null} nav="minimal">
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Avarie</p>
              <h1 className={game.title}>Quelque chose a cassé</h1>
            </div>
          </div>
          <div className={`${game.panel} ${game.empty}`}>
            <p className={game.emptyTitle}>Cette page n&apos;a pas pu s&apos;afficher</p>
            <p className={game.muted}>
              Rien n&apos;est perdu : ta collection et tes parties sont enregistrées sur ton compte. Réessaie, ou reviens au port.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
              <button type="button" className={game.primary} onClick={reset}>
                Réessayer
              </button>
              <Link href="/" className={game.link}>
                Retour au port
              </Link>
            </div>
            {error.digest && <p className={game.muted}>Référence : {error.digest}</p>}
          </div>
        </div>
      </div>
    </GameScreen>
  );
}
