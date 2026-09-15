"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ownershipLabel } from "@/game";
import type { DeckCatalogView } from "@/features/decks/catalogService";
import { chooseBorrowedDeck } from "@/features/decks/catalogActions";
import { Dialog } from "@/features/shell/Dialog";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { ArtPlate } from "@/features/shell/ArtPlate";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DeckCatalog.module.css";
import { playButtonClick } from "@/lib/sound";

interface BorrowedDeckPromptProps {
  catalog: DeckCatalogView;
}

function difficultyStars(difficulty: number): string {
  return "★".repeat(difficulty) + "☆".repeat(Math.max(0, 5 - difficulty));
}

/**
 * Choix du PREMIER DECK, dans la Collection.
 *
 * Étape 5 du flow de la spec (Notion « Progression joueur » §2/§3) : après
 * le tutoriel — fait ou passé —, le joueur est conduit ici pour choisir un
 * deck d'emprunt gratuit et pouvoir jouer immédiatement.
 *
 * Deux règles que cet écran incarne, et qu'il faut lire ensemble :
 *   - « Le premier deck jouable ne doit PAS être un déblocage du niveau 1 » :
 *     rien à atteindre, le deck est donné ;
 *   - « Le deck d'emprunt permet de jouer immédiatement SANS donner
 *     artificiellement toutes ses cartes au joueur » : d'où le compteur
 *     possédées/prêtées affiché dès le choix, pour que le prêt soit clair
 *     avant de commencer, pas découvert plus tard.
 *
 * Volontairement non refermable sans choisir : c'est la dernière étape
 * avant de jouer, et le choix est gratuit.
 */
export function BorrowedDeckPrompt({ catalog }: BorrowedDeckPromptProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function choose(deckId: string) {
    playButtonClick();
    setError(null);
    setChosen(deckId);
    startTransition(async () => {
      const result = await chooseBorrowedDeck(deckId);
      if (!result.ok) {
        setError(result.error ?? "Choix impossible.");
        setChosen(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Dialog title="Choisis ton premier équipage" onClose={() => undefined} width={860} hideCloseButton>
      <p className={game.muted} style={{ marginBottom: "clamp(10px, 1.6vh, 18px)" }}>
        Ce deck t&apos;est prêté : tu peux jouer tout de suite. Les cartes que tu ne possèdes pas encore restent marquées
        « prêtées » — chaque booster en remplace une par une carte bien à toi.
      </p>

      <div className={styles.grid}>
        {catalog.borrowed.map(({ deck, ownership }) => (
          <article key={deck.id} className={`${game.panelRaised} ${styles.tile}`} aria-label={deck.name}>
            <ArtPlate artUrl={nameplateArtUrl(deck.cardIds, deck.shipId)} size="lg" className={styles.tilePlate}>
              <span className={styles.tileName}>{deck.name}</span>
            </ArtPlate>
            <div className={styles.tileBody}>
              <span className={styles.tileStyle}>
                {shipNameOf(deck.shipId)} · <span className={styles.difficulty}>{difficultyStars(deck.difficulty)}</span>
              </span>
              <span className={styles.tileStyle}>{deck.style}</span>
              <ul className={styles.mechanics}>
                {deck.mechanics.map((mechanic) => (
                  <li key={mechanic} className={styles.mechanic}>
                    {mechanic}
                  </li>
                ))}
              </ul>
              <span className={styles.ownLabel}>{ownershipLabel(ownership)}</span>
              <span className={styles.tileFoot}>
                <button type="button" className={game.primary} onClick={() => choose(deck.id)} disabled={isPending}>
                  {isPending && chosen === deck.id ? "…" : "Emprunter"}
                </button>
              </span>
            </div>
          </article>
        ))}
      </div>

      {error && <p className={game.error}>{error}</p>}
    </Dialog>
  );
}
