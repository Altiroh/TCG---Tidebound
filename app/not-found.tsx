import Link from "next/link";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";

/**
 * Page introuvable (404).
 *
 * Next l'exige pour toute réponse 404 rencontrée pendant une navigation :
 * sans elle, le routeur affiche « missing required error components,
 * refreshing… » et recharge en boucle — une page blanche qui ne dit rien
 * et qu'on ne peut pas quitter (constaté le 17/09/2026 sur une partie en
 * ligne dont l'identifiant n'existait plus).
 *
 * Tout `notFound()` du code (une fiche de deck disparue, par exemple)
 * atterrit ici.
 */
export default function NotFound() {
  return (
    <GameScreen active={null} nav="minimal">
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Hors des cartes</p>
              <h1 className={game.title}>Cette page n&apos;existe pas</h1>
            </div>
          </div>
          <div className={`${game.panel} ${game.empty}`}>
            <p className={game.emptyTitle}>Rien à cette adresse</p>
            <p className={game.muted}>
              Le lien est peut-être périmé : une partie terminée, un deck supprimé, ou une adresse saisie à la main.
            </p>
            <Link href="/" className={game.primary} style={{ marginTop: 6 }}>
              Retour au port
            </Link>
          </div>
        </div>
      </div>
    </GameScreen>
  );
}
