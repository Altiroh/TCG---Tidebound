"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GameScreen } from "@/features/shell/GameScreen";
import { reportClientError } from "@/features/shell/reportClientError";
import game from "@/features/shell/GameScreen.module.css";

/** Dernier rechargement automatique après un plantage de la table (sessionStorage). */
const RELOAD_KEY = "tidebound:match-crash-reload-at";
/** En deçà, un second plantage n'est plus rechargé : il se reproduirait, autant le montrer. */
const RELOAD_GUARD_MS = 30_000;

/**
 * Plantage d'affichage PENDANT une partie arbitrée (en ligne ou contre le bot).
 *
 * Avant, l'erreur remontait jusqu'à `app/error.tsx` : le joueur se retrouvait
 * sur « Quelque chose a cassé », hors de sa partie, alors que celle-ci
 * continuait intacte sur le serveur (04/10/2026). Ici :
 *   1. la trace part dans les journaux serveur (`reportClientError`) ;
 *   2. la page se recharge UNE fois d'elle-même — l'état vit sur le serveur,
 *      la partie reprend là où elle en était ;
 *   3. si ça replante aussitôt, l'écran le dit, propose de reprendre, et
 *      montre le message technique (à transmettre tel quel).
 */
export default function MatchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error("[partie] Affichage interrompu :", error);
    void reportClientError({
      where: "match",
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      path: window.location.pathname,
    }).catch(() => undefined);

    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    } catch {
      // Stockage indisponible : pas de rechargement automatique, l'écran suffit.
      return;
    }
    if (Date.now() - last < RELOAD_GUARD_MS) return;
    try {
      window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    setReloading(true);
    // Laisse partir la trace avant de recharger.
    const timer = window.setTimeout(() => window.location.reload(), 600);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <GameScreen active={null} nav="minimal">
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Avarie</p>
              <h1 className={game.title}>{reloading ? "On remet la table d'aplomb…" : "La table a chaviré"}</h1>
            </div>
          </div>
          <div className={`${game.panel} ${game.empty}`}>
            <p className={game.emptyTitle}>L&apos;affichage de la partie s&apos;est interrompu</p>
            <p className={game.muted}>
              La partie, elle, continue : elle est enregistrée sur le serveur, rien n&apos;est perdu. Reprends-la là où elle en était.
            </p>
            {!reloading && (
              <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
                <button type="button" className={game.primary} onClick={() => window.location.reload()}>
                  Reprendre la partie
                </button>
                <button type="button" className={game.link} onClick={reset}>
                  Réessayer sans recharger
                </button>
                <Link href="/partie" className={game.link}>
                  Quitter la table
                </Link>
              </div>
            )}
            {!reloading && (
              <details className={game.muted} style={{ maxWidth: "100%", textAlign: "left" }}>
                <summary>Détails techniques</summary>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, margin: "6px 0 0" }}>
                  {[error.message, error.digest && `Référence : ${error.digest}`, error.stack?.split("\n").slice(1, 6).join("\n")]
                    .filter(Boolean)
                    .join("\n")}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    </GameScreen>
  );
}
