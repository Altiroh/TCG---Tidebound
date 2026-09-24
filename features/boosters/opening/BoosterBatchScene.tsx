"use client";

import { useEffect, useMemo, useState } from "react";
import { getCardDefinition, type CardInstance } from "@/game";
import { RARITY_ORDER } from "@/game/boosters";
import { CardTile } from "@/features/match/CardTile";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { playButtonClick } from "@/lib/sound";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/boosters/opening/BoosterBatch.module.css";
import type { BoosterOpeningCard } from "@/features/boosters/opening/types";

/** Cartes alignées à l'écran : au-delà, la rangée devient une frise illisible et le « + » dit le reste. */
const ALIGNED = 10;
/** Indice de lecture sous la rangée : ce que le « + » recouvre, et où le lire. */
const MORE_HINT = "Le détail complet est dans « Voir toutes les cartes reçues »";
/** Écart entre deux apparitions — assez lent pour suivre la rangée des yeux, assez court pour ne pas attendre. */
const STAGGER_MS = 110;

interface BoosterBatchSceneProps {
  /** Toutes les cartes du lot, dans l'ordre de tirage. */
  cards: readonly BoosterOpeningCard[];
  packs: number;
  onShowAll: () => void;
  onClose: () => void;
}

/** Une carte du lot dont l'identité est connue (une carte masquée n'a rien à montrer dans la rangée). */
type KnownCard = BoosterOpeningCard & { cardId: string };

function displayInstance(card: KnownCard): CardInstance {
  return {
    instanceId: `batch_${card.id}`,
    cardId: card.cardId,
    ownerId: "booster",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}

/**
 * Ce qu'un LOT de boosters a rapporté, en une image : une rangée de dix
 * cartes qui se posent l'une après l'autre, et un « + » qui dit tout le
 * reste.
 *
 * Remplace l'ouverture sachet par sachet pour un lot (retour de test du
 * 17/09) : dérouler dix animations complètes ferait attendre pour rien, et
 * une mosaïque de quatre-vingts vignettes ne se regarde pas. Les dix
 * montrées sont les plus intéressantes — nouveautés d'abord, puis par
 * rareté décroissante : c'est ce que le joueur veut voir, pas les dix
 * premières communes tirées.
 *
 * Le détail complet reste à un clic (« Voir toutes les cartes reçues »), et
 * chaque carte de la rangée s'ouvre en fiche au clic comme au doigt.
 */
export function BoosterBatchScene({ cards, packs, onShowAll, onClose }: BoosterBatchSceneProps) {
  /** Carte dont on lit la fiche — ouverte par-dessus la rangée. */
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const total = cards.length;
  const newCount = cards.filter((card) => card.isNew).length;

  const aligned = useMemo(() => {
    const rank = (card: BoosterOpeningCard) => RARITY_ORDER.indexOf(card.rarity);
    return cards
      .filter((card): card is KnownCard => Boolean(card.cardId))
      .sort((a, b) => {
        if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
        return rank(b) - rank(a);
      })
      .slice(0, ALIGNED);
  }, [cards]);

  const remaining = Math.max(0, total - aligned.length);

  // Les cartes se posent une à une : `shown` monte jusqu'au bout de la rangée,
  // puis le « + » et le bouton apparaissent.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= aligned.length) return;
    const id = window.setTimeout(() => setShown((current) => current + 1), shown === 0 ? 220 : STAGGER_MS);
    return () => window.clearTimeout(id);
  }, [shown, aligned.length]);

  const complete = shown >= aligned.length;

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      // La fiche ouverte gère sa propre fermeture : Échap ne ferme qu'elle.
      if (event.key === "Escape" && detailCardId === null) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, detailCardId]);

  return (
    <div className={styles.layer} role="dialog" aria-label={`${packs} boosters ouverts`}>
      <div className={styles.panel}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>{packs} boosters ouverts</p>
          <h2 className={styles.title}>
            {total} carte{total > 1 ? "s" : ""} récupérée{total > 1 ? "s" : ""}
          </h2>
          <p className={styles.sub}>
            dont <b>{newCount}</b> nouvelle{newCount > 1 ? "s" : ""} pour la collection
          </p>
        </header>

        <div className={styles.row}>
          {aligned.map((card, index) => (
            <span
              key={card.id}
              // Une carte se regarde : la toucher ouvre sa fiche (le clic
              // droit n'existe pas au doigt — retour de test iOS du 18/09).
              role="button"
              tabIndex={index < shown ? 0 : -1}
              className={styles.slot}
              data-shown={index < shown || undefined}
              data-new={card.isNew || undefined}
              style={{ zIndex: aligned.length - index }}
              title={`${getCardDefinition(card.cardId).name} — voir sa fiche`}
              aria-label={`${getCardDefinition(card.cardId).name} — voir sa fiche`}
              onClick={() => {
                playButtonClick();
                setDetailCardId(card.cardId);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setDetailCardId(card.cardId);
              }}
            >
              <CardTile
                instance={displayInstance(card)}
                tideState="calme"
                widthClassName="w-full"
                scaleOnHover={false}
                showStatusBadges={false}
              />
              {card.isNew && <span className={styles.newMark}>Nouveau</span>}
            </span>
          ))}

          {remaining > 0 && (
            <span className={styles.more} data-shown={complete || undefined}>
              <span className={styles.morePlus}>+{remaining}</span>
              <span className={styles.moreLabel}>autres cartes</span>
            </span>
          )}
        </div>

        {remaining > 0 && (
          <p className={styles.rowHint} data-shown={complete || undefined}>
            {MORE_HINT}
          </p>
        )}

        <div className={styles.actions} data-shown={complete || undefined}>
          <button
            type="button"
            className={game.primary}
            onClick={() => {
              playButtonClick();
              onShowAll();
            }}
          >
            Voir toutes les cartes reçues
          </button>
          <button
            type="button"
            className={game.link}
            onClick={() => {
              playButtonClick();
              onClose();
            }}
          >
            Fermer
          </button>
        </div>
      </div>

      {detailCardId && <CardDetailModal cardId={detailCardId} onClose={() => setDetailCardId(null)} />}
    </div>
  );
}
