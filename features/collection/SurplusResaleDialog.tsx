"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getCardDefinition } from "@/game";
import { recycleSurplus } from "@/features/collection/recycleActions";
import type { SurplusLine } from "@/features/collection/recycleValue";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { TideCoin } from "@/features/shell/GameIcons";
import { Dialog } from "@/features/shell/Dialog";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/collection/SurplusResale.module.css";
import { playButtonClick } from "@/lib/sound";

interface SurplusResaleDialogProps {
  lines: readonly SurplusLine[];
  onClose: () => void;
}

function cardName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

/**
 * « Revendre le surplus » de la Collection : le RÉCAPITULATIF avant tout —
 * combien d'exemplaires partent, pour combien de Tides, et la liste carte
 * par carte (possédés → gardés). Rien ne se vend sans le bouton de
 * confirmation. Les quantités affichées sont un plafond côté serveur.
 */
export function SurplusResaleDialog({ lines, onClose }: SurplusResaleDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tides: number; cards: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalCards = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalTides = lines.reduce((sum, line) => sum + line.tides, 0);

  function confirm() {
    playButtonClick();
    setError(null);
    startTransition(async () => {
      const result = await recycleSurplus(lines.map((line) => ({ cardId: line.cardId, quantity: line.quantity })));
      if (!result.ok) {
        setError(result.error ?? "Revente impossible.");
        return;
      }
      setDone({ tides: result.tidesGained ?? 0, cards: result.cardsSold ?? 0 });
      notifyProgressionChanged();
      router.refresh();
    });
  }

  if (done) {
    return (
      <Dialog
        title="Surplus revendu"
        onClose={onClose}
        actions={
          <button type="button" className={game.primary} onClick={onClose}>
            Fermer
          </button>
        }
      >
        <p className={styles.doneLine}>
          {done.cards} exemplaire{done.cards > 1 ? "s" : ""} revendu{done.cards > 1 ? "s" : ""} ·{" "}
          <span className={styles.tides}>
            <TideCoin size={16} /> +{done.tides} Tides
          </span>
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Revendre le surplus"
      onClose={() => !isPending && onClose()}
      width={560}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={onClose} disabled={isPending}>
            Annuler
          </button>
          <button type="button" className={game.primary} onClick={confirm} disabled={isPending || lines.length === 0}>
            {isPending ? "Revente…" : `Revendre ${totalCards} carte${totalCards > 1 ? "s" : ""} · ${totalTides} Tides`}
          </button>
        </>
      }
    >
      <div className={styles.recap}>
        <span className={styles.recapBig}>{totalCards}</span>
        <span>
          exemplaire{totalCards > 1 ? "s" : ""} en surplus sur {lines.length} carte{lines.length > 1 ? "s" : ""}
        </span>
        <span className={styles.tides}>
          <TideCoin size={16} /> +{totalTides} Tides
        </span>
      </div>
      <p className={styles.hint}>
        Seuls les exemplaires au-delà du maximum d&apos;un deck sont revendus : tu gardes de quoi remplir chacun de tes decks.
      </p>

      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line.cardId} className={styles.line}>
            <span className={styles.art} style={{ backgroundImage: `url("${cardIllustrationThumbUrl(line.cardId)}")` }} aria-hidden />
            <span className={styles.name}>
              {cardName(line.cardId)}
              <span className={styles.keep}>
                {line.owned} possédés → {line.keep} gardé{line.keep > 1 ? "s" : ""}
              </span>
            </span>
            <span className={styles.quantity}>−{line.quantity}</span>
            <span className={styles.lineTides}>+{line.tides}</span>
          </li>
        ))}
      </ul>

      {error && <p className={game.error}>{error}</p>}
    </Dialog>
  );
}
