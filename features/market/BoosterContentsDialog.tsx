"use client";

import { useEffect, useMemo, useState } from "react";
import { getCardDefinition } from "@/game";
import { RARITY_ORDER, type CardRarity } from "@/game/boosters/types";
import { boosterArtworkEntries } from "@/game/boosters/boosterArtworks";
import { CARD_ARTWORK_LABELS } from "@/game/cosmetics/artworks";
import { CARD_ARTWORK_ODDS, type CardEdition } from "@/game/cosmetics/editions";
import { cardArtworkThumbUrl } from "@/features/decks/cardArtUrl";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";
import type { BoosterInventoryEntry } from "@/features/boosters/actions";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import { CARD_RARITY_LABELS } from "@/features/match/cardDisplay";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/market/BoosterContents.module.css";
import { playButtonClick } from "@/lib/sound";
import { StatusTag } from "@/features/shell/StatusTag";

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
 *
 * Un PANNEAU à droite, pas une fenêtre au centre (29/09/2026) : ce qu'on
 * regardait — le présentoir du Market, l'étagère des boosters — reste
 * visible à gauche. Échap, « × » ou un clic sur cette partie gauche le
 * ferment. Même panneau au Market (« Contenu ») et aux Boosters
 * (« Cartes de l'extension »).
 */
export function BoosterContentsDialog({ booster, owned, onClose }: BoosterContentsDialogProps) {
  // Mémorisés sur l'appareil : d'un booster à l'autre, on cherche la même chose.
  const [rarity, setRarity] = usePersistedState<CardRarity | null>("contenu-booster:rarete", null, {
    decode: (raw) => oneOf<CardRarity | null>([null, ...RARITY_ORDER], raw),
  });
  const [missingOnly, setMissingOnly] = usePersistedState<boolean>("contenu-booster:manquantes", false, {
    decode: (raw) => (typeof raw === "boolean" ? raw : undefined),
  });
  const [detail, setDetail] = useState<{ cardId: string; edition?: CardEdition } | null>(null);

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

  // ILLUSTRATIONS obtenables dans CE booster (Collection visuelle V2) : la
  // Styled et la Full-Art des cartes qui y sont réparties, au pied de la
  // liste — elles sortent APRÈS la carte, à leur propre chance.
  const illustrations = useMemo(
    () =>
      boosterArtworkEntries(booster.boosterId)
        .map((entry) => ({ ...entry, name: safeName(entry.cardId), rarity: unique.find((card) => card.cardId === entry.cardId)?.rarity }))
        .filter((entry) => entry.rarity !== undefined)
        .sort((a, b) => (a.artwork === b.artwork ? a.name.localeCompare(b.name, "fr") : a.artwork === "styled" ? -1 : 1)),
    [booster.boosterId, unique]
  );
  const shownIllustrations = missingOnly ? [] : illustrations.filter((entry) => !rarity || entry.rarity === rarity);

  const ownedCount = unique.filter((card) => card.owned).length;
  const rarities = RARITY_ORDER.filter((entry) => unique.some((card) => card.rarity === entry));
  const shown = unique
    .filter((card) => (!rarity || card.rarity === rarity) && (!missingOnly || !card.owned))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name, "fr"));

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div className={`${game.cabinFrame} ${styles.dialog}`} role="dialog" aria-modal="true" aria-label={`Contenu — ${booster.name}`} onClick={(event) => event.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <p className={`${game.cabinEyebrow} ${styles.eyebrow}`}>Contenu du booster</p>
            <h2 className={`${game.cabinTitle} ${styles.title}`}>{booster.name}</h2>
            <p className={styles.sub}>
              {booster.cardCount} cartes par booster · <b>{ownedCount}</b> / {unique.length} déjà possédées
              {illustrations.length > 0 && ` · ${illustrations.length} illustration${illustrations.length > 1 ? "s" : ""} Styled / Full-Art`}
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
              <li key={card.cardId} className={styles.cell}>
                <button
                  type="button"
                  className={styles.card}
                  data-rarity={card.rarity}
                  data-owned={card.owned ? "true" : "false"}
                  onClick={() => {
                    playButtonClick();
                    setDetail({ cardId: card.cardId });
                  }}
                  title={card.owned ? `${card.name} — déjà dans ta collection` : `${card.name} — pas encore possédée`}
                >
                  <span className={styles.art} style={{ backgroundImage: `url("${cardIllustrationUrl(card.cardId)}")` }} aria-hidden />
                  <span className={styles.name}>{card.name}</span>
                  <span className={styles.rarity}>{CARD_RARITY_LABELS[card.rarity]}</span>
                </button>
                {/* Hors du bouton (qui rogne son contenu) : le halo doit en sortir. */}
                <span className={styles.status}>
                  {card.owned ? <StatusTag tone="owned">Possédée</StatusTag> : <StatusTag tone="new" />}
                </span>
              </li>
            ))}
            {shownIllustrations.map((entry) => (
              <li key={`${entry.cardId}/${entry.artwork}`} className={styles.cell}>
                <button
                  type="button"
                  className={styles.card}
                  data-rarity={entry.rarity}
                  data-artwork={entry.artwork}
                  onClick={() => {
                    playButtonClick();
                    setDetail({ cardId: entry.cardId, edition: { artwork: entry.artwork, finish: "classique" } });
                  }}
                  title={`${entry.name} — ${CARD_ARTWORK_LABELS[entry.artwork]} : 1 tirage de cette carte sur ${Math.round(1 / CARD_ARTWORK_ODDS[entry.artwork])}`}
                >
                  <span className={styles.art} style={{ backgroundImage: `url("${cardArtworkThumbUrl(entry.cardId, entry.artwork)}")` }} aria-hidden />
                  <span className={styles.name}>{entry.name}</span>
                  <span className={styles.rarity}>{CARD_ARTWORK_LABELS[entry.artwork]}</span>
                </button>
                <span className={styles.status}>
                  <span className={styles.artworkTag}>1 / {Math.round(1 / CARD_ARTWORK_ODDS[entry.artwork])}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail && (
        <div onClick={(event) => event.stopPropagation()}>
          <CardDetailModal cardId={detail.cardId} initialEdition={detail.edition} onClose={() => setDetail(null)} />
        </div>
      )}
    </div>
  );
}
