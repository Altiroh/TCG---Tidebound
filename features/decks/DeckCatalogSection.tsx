"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ownershipLabel } from "@/game";
import type { CatalogDeckView, DeckCatalogView } from "@/features/decks/catalogService";
import { chooseBorrowedDeck, unlockPreconstructedDeck } from "@/features/decks/catalogActions";
import { DeckSheet } from "@/features/decks/DeckSheet";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { ArtPlate } from "@/features/shell/ArtPlate";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { PreconToken } from "@/features/shell/GameIcons";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DeckCatalog.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckCatalogSectionProps {
  catalog: DeckCatalogView;
  /** `borrowed` : le rayon d'emprunt ; `precon` : les préconstruits à Jeton. */
  kind: "borrowed" | "precon";
}

function difficultyStars(difficulty: number): string {
  return "★".repeat(difficulty) + "☆".repeat(Math.max(0, 5 - difficulty));
}

/**
 * Un rayon de decks fournis par le jeu — emprunt ou préconstruits.
 *
 * Chaque tuile dit ce qu'il faut pour décider SANS ouvrir la fiche : le
 * Navire, le style, la difficulté, et surtout la part réellement possédée
 * du deck (« 18 possédées · 12 prêtées »). Un préconstruit verrouillé est
 * affiché comme les autres — la spec insiste : ils « doivent rester
 * visibles » et « consultables avant achat ».
 */
export function DeckCatalogSection({ catalog, kind }: DeckCatalogSectionProps) {
  const router = useRouter();
  const decks = kind === "borrowed" ? catalog.borrowed : catalog.precon;
  const [open, setOpen] = useState<CatalogDeckView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function unlock(entry: CatalogDeckView) {
    playButtonClick();
    setError(null);
    startTransition(async () => {
      const result = kind === "borrowed" ? await chooseBorrowedDeck(entry.deck.id) : await unlockPreconstructedDeck(entry.deck.id);
      if (!result.ok) {
        setError(result.error ?? "Action impossible.");
        return;
      }
      notifyProgressionChanged();
      setOpen(null);
      router.refresh();
    });
  }

  /** « Essayer » : une partie contre le bot avec le deck entièrement prêté. */
  function tryDeck(entry: CatalogDeckView) {
    playButtonClick();
    router.push(`/partie?essai=${encodeURIComponent(entry.deck.id)}`);
  }

  if (decks.length === 0) {
    return (
      <div className={`${game.panel} ${game.empty}`}>
        <p className={game.emptyTitle}>Rien à montrer ici</p>
      </div>
    );
  }

  return (
    <>
      {kind === "precon" && (
        <p className={game.muted}>
          <PreconToken size={16} />{" "}
          {catalog.preconTokens > 0
            ? `${catalog.preconTokens} Jeton${catalog.preconTokens > 1 ? "s" : ""} de Préconstruit à dépenser — le jeton n'impose aucun deck, prends le temps de comparer.`
            : "Les gros paliers de niveau donnent un Jeton de Préconstruit tous les 10 niveaux. En attendant, tu peux tout consulter et essayer."}
        </p>
      )}
      {kind === "borrowed" && (
        <p className={game.muted}>
          {catalog.borrowedDeckId
            ? "Ton deck d'emprunt est choisi. Les cartes que tu ne possèdes pas restent prêtées : chaque booster en remplace une par une carte bien à toi."
            : "Choisis le deck que tu emprunteras pour tes premières parties. Gratuit, une seule fois — et tu le possèderas petit à petit."}
        </p>
      )}

      <div className={styles.grid}>
        {decks.map((entry) => {
          const { deck, ownership, unlocked } = entry;
          const ratio = ownership.total === 0 ? 0 : ownership.owned / ownership.total;
          return (
            <article key={deck.id} className={`${game.panelRaised} ${styles.tile}`} aria-label={deck.name}>
              <ArtPlate artUrl={nameplateArtUrl(deck.cardIds, deck.shipId)} className={styles.tilePlate}>
                <span className={styles.tileName}>{deck.name}</span>
                <span className={styles.tileShip}>{shipNameOf(deck.shipId)}</span>
              </ArtPlate>
              <div className={styles.tileBody}>
                <span className={styles.tileStyle}>
                  {deck.style} · <span className={styles.difficulty}>{difficultyStars(deck.difficulty)}</span>
                </span>
                <span className={styles.ownLabel}>{ownershipLabel(ownership)}</span>
                <span className={styles.ownBar} aria-hidden>
                  <span className={ownership.complete ? styles.ownFillComplete : styles.ownFill} style={{ width: `${ratio * 100}%` }} />
                </span>
                <span className={styles.tileFoot}>
                  {unlocked ? (
                    <span className={game.tagSuccess}>{kind === "borrowed" ? "Emprunté" : "Débloqué"}</span>
                  ) : kind === "precon" ? (
                    <span className={catalog.preconTokens > 0 ? game.tagBrass : game.tag}>
                      <PreconToken size={13} /> 1 Jeton
                    </span>
                  ) : catalog.borrowedDeckId ? (
                    <span className={game.tag}>Non choisi</span>
                  ) : (
                    <span className={game.tagCyan}>Gratuit</span>
                  )}
                  <button
                    type="button"
                    className={game.link}
                    onClick={() => {
                      playButtonClick();
                      setError(null);
                      setOpen(entry);
                    }}
                  >
                    Voir la fiche →
                  </button>
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {open && (
        <DeckSheet
          deck={open.deck}
          ownership={open.ownership}
          unlocked={open.unlocked}
          kind={kind}
          tokens={catalog.preconTokens}
          borrowedAlreadyChosen={catalog.borrowedDeckId !== null}
          busy={isPending}
          error={error}
          onUnlock={() => unlock(open)}
          onTry={() => tryDeck(open)}
          onClose={() => {
            setOpen(null);
            setError(null);
          }}
        />
      )}
    </>
  );
}

/** Nom du Navire d'un deck — réexporté pour l'écran Decks, qui l'affiche aussi. */
export { shipNameOf };
