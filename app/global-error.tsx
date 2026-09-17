"use client";

import { useEffect } from "react";

/**
 * Dernier filet : une erreur survenue dans le layout racine lui-même, donc
 * AVANT que la coquille du jeu (polices, thème, bandeau) n'existe.
 *
 * Ce composant remplace le document entier — il doit donc porter ses propres
 * `<html>` et `<body>`, et ne peut rien importer du design system, qui vit
 * précisément dans ce layout cassé. D'où les styles en ligne, seule fois
 * dans le projet.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global] Layout racine interrompu :", error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#061019",
          color: "#dbe7f2",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "0.02em" }}>Tidebound n&apos;a pas pu démarrer</h1>
          <p style={{ margin: 0, color: "#8fa6bd", lineHeight: 1.5 }}>
            L&apos;incident est survenu avant le chargement de l&apos;interface. Recharge la page ; si ça persiste, c&apos;est de
            notre côté.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              alignSelf: "center",
              padding: "9px 18px",
              border: "1px solid rgba(88, 200, 216, 0.6)",
              borderRadius: 999,
              background: "rgba(10, 28, 42, 0.9)",
              color: "#dff6fa",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Recharger
          </button>
          {error.digest && <p style={{ margin: 0, fontSize: 12, color: "#5f748a" }}>Référence : {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
