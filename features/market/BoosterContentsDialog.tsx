"use client";

import { useEffect, useMemo, useState } from "react";
import { getCardDefinition } from "@/game";
import { RARITY_ORDER, type CardRarity } from "@/game/boosters/types";
import type { BoosterInventoryEntry } from "@/features/boosters/actions";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import { CARD_RARITY_LABELS } from "@/features/match/cardDisplay";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/market/BoosterContents.module.css";
import { playButtonClick } from "@/lib/sound";

interface BoosterContentsDialogProps {
  booster: BoosterInventoryEntry;
  owned: ReadonlySet<string>;
  onClose: () => void;
}

function safeName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

/**
 * CONTENU d'un booster, avant de l'acheter : toutes les cartes qui peuvent
 * en tomber, rangées par rareté — une coche verte sur celles qu'on a,
 * le badge « Nouveau » sur celles qu'on n'a pas. C'est ce second groupe
 * qu'on cherche devant un rayon, et un petit « + » gris ne le disait pas :
 * il fallait comparer deux icônes de 11 px pour savoir laquelle manquait.
 * Le compte « possédées / tirables » dit d'un coup d'œil si le booster fera
 * encore avancer la collection. Toucher une carte ouvre sa fiche.
 */
export function BoosterContentsDialog({ booster, owned, onClose }: BoosterContentsDialogProps) {
  const [rarity, setRarity] = useState<CardRarity | null>(null);
  const [missingOnly, setMissingOnly] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !detail) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, detail]);

  const unique = useMemo(() => {
    const seen = new Map<string, CardRarity>();
    for (const entry of booster.pool) if (!seen.has(entry.cardId)) seen.set(entry.cardId, entry.rarity);
    return [...seen.entries()].map(([cardId, cardRarity]) => ({ cardId, rarity: cardRarity, name: safeName(cardId), owned: owned.has(cardId) }));
  }, [booster.pool, owned]);

  const ownedCount = unique.filter((card) => card.owned).length;
  const rarities = RARITY_ORDER.filter((entry) => unique.some((card) => card.rarity === entry));
  const shown = unique
    .filter((card) => (!rarity || card.rarity === rarity) && (!missingOnly || !card.owned))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name, "fr"));

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={`Contenu — ${booster.name}`} onClick={(event) => event.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Contenu du booster</p>
            <h2 className={styles.title}>{booster.name}</h2>
            <p className={styles.sub}>
              {booster.cardCount} cartes par booster · <b>{ownedCount}</b> / {unique.length} déjà possédées
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={styles.progress} aria-hidden>
          <span className={styles.progressFill} style={{ width: `${unique.length ? (ownedCount / unique.length) * 100 : 0}%` }} />
        </div>

        <div className={styles.filters}>
          <button type="button" className={styles.chip} aria-pressed={rarity === null} onClick={() => setRarity(null)}>
            Toutes <span>{unique.length}</span>
          </button>
          {rarities.map((entry) => (
            <button
              key={entry}
              type="button"
              className={styles.chip}
              data-rarity={entry}
              aria-pressed={rarity === entry}
              onClick={() => setRarity(rarity === entry ? null : entry)}
            >
              {CARD_RARITY_LABELS[entry]} <span>{unique.filter((card) => card.rarity === entry).length}</span>
            </button>
          ))}
          {/* La case du design system, pas celle du navigateur. */}
          <label className={`${game.choice} ${styles.toggle}`}>
            <input type="checkbox" className={game.choiceInput} checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} />
            <span className={game.choiceBox} aria-hidden />
            Manquantes seulement
          </label>
        </div>

        {unique.length === 0 ? (
          <p className={styles.empty}>Le contenu de ce booster n&apos;est pas disponible pour l&apos;instant.</p>
        ) : (
          <ul className={styles.grid}>
            {shown.map((card) => (
              <li key={card.cardId}>
                <button
                  type="button"
                  className={styles.card}
                  data-rarity={card.rarity}
                  data-owned={card.owned ? "true" : "false"}
                  onClick={() => {
                    playButtonClick();
                    setDetail(card.cardId);
                  }}
                  title={card.owned ? `${card.name} — déjà dans ta collection` : `${card.name} — pas encore possédée`}
                >
                  <span className={styles.art} style={{ backgroundImage: `url("${cardIllustrationUrl(card.cardId)}")` }} aria-hidden />
                  <span className={styles.name}>{card.name}</span>
                  <span className={styles.rarity}>{CARD_RARITY_LABELS[card.rarity]}</span>
                  {card.owned ? (
                    <span className={styles.ownedMark} aria-label="Possédée">
                      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden>
                        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : (
                    <span className={styles.newMark}>Nouveau</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail && (
        <div onClick={(event) => event.stopPropagation()}>
          <CardDetailModal cardId={detail} onClose={() => setDetail(null)} />
        </div>
      )}
    </div>
  );
}
