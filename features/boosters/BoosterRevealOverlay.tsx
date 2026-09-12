"use client";

import { useEffect, useMemo, useState } from "react";
import { getCardDefinition } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import shell from "@/features/shell/ScreenShell.module.css";
import styles from "@/features/boosters/Boosters.module.css";
import type { OpenedCard } from "@/features/boosters/actions";

/** Décalage entre deux révélations de carte. */
const REVEAL_STEP_MS = 260;

interface BoosterRevealOverlayProps {
  cards: OpenedCard[];
  abyssalPulled: boolean;
  onClose: () => void;
}

/**
 * Révélation d'un booster ouvert : les cartes apparaissent une par une, dans
 * l'ordre des slots — les quatre Communes d'abord, le slot Profondeur en
 * dernier. C'est le moment de tension de la boucle (cf. cadrage : « Le slot
 * 8 constitue le moment de tension principal de l'ouverture »), donc la
 * seule chose visible à l'écran pendant qu'il dure.
 *
 * L'ouverture est DÉJÀ faite et persistée quand ce composant est monté : il
 * ne fait que mettre en scène un résultat acquis. Fermer l'overlay ou
 * quitter la page ne peut donc jamais faire perdre les cartes.
 */
export function BoosterRevealOverlay({ cards, abyssalPulled, onClose }: BoosterRevealOverlayProps) {
  const ordered = useMemo(() => [...cards].sort((a, b) => a.slotIndex - b.slotIndex), [cards]);
  const [allRevealed, setAllRevealed] = useState(false);

  const totalDelay = ordered.length * REVEAL_STEP_MS;

  useEffect(() => {
    const timeout = setTimeout(() => setAllRevealed(true), totalDelay);
    return () => clearTimeout(timeout);
  }, [totalDelay]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const newCount = ordered.filter((card) => card.isNew).length;

  return (
    <div className={styles.revealOverlay} role="dialog" aria-modal aria-label="Booster ouvert">
      <p className={styles.revealTitle}>
        {abyssalPulled ? "Une Abyssale remonte des profondeurs" : "Contenu du booster"}
      </p>

      <div className={styles.revealRow}>
        {ordered.map((card, index) => (
          <div
            key={`${card.slotIndex}-${card.cardId}`}
            className={card.rarity === "abyssal" ? styles.revealCardAbyssal : styles.revealCard}
            style={{ ["--reveal-delay" as string]: `${index * REVEAL_STEP_MS}ms` }}
          >
            <CardTile
              instance={{
                instanceId: `booster_${card.slotIndex}_${card.cardId}`,
                cardId: card.cardId,
                ownerId: "booster",
                damageMarked: 0,
                modifiers: [],
                summoningSick: false,
                hasAttackedThisTurn: false,
              }}
              tideState="calme"
              widthClassName="w-full"
              scaleOnHover={false}
              liftOnHover
            />
            {card.isNew && (
              <span className={styles.revealNew} title={getCardDefinition(card.cardId).name}>
                Nouvelle
              </span>
            )}
          </div>
        ))}
      </div>

      <div
        className={styles.revealActions}
        style={{ ["--reveal-actions-delay" as string]: `${totalDelay}ms` }}
      >
        <span className={styles.revealTitle} style={{ fontSize: "0.8em", opacity: 0.8 }}>
          {newCount > 0
            ? `${newCount} nouvelle${newCount > 1 ? "s" : ""} carte${newCount > 1 ? "s" : ""} dans ta collection`
            : "Aucune nouveauté — les doublons sont recyclables"}
        </span>
        <button type="button" className={shell.primaryAction} onClick={onClose} disabled={!allRevealed}>
          Terminer
        </button>
      </div>
    </div>
  );
}
