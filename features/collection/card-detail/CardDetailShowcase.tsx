"use client";

import { useEffect, useState } from "react";
import { editionKey, editionLabel, isClassicEdition, type CardEdition } from "@/game/cosmetics/editions";
import { fetchMyShowcase } from "@/features/friends/showcaseActions";
import { clearShowcaseSlot, emptyShowcase, placeShowcaseCard, type Showcase } from "@/features/friends/showcaseRules";
import { ShowcaseShelf } from "@/features/friends/ShowcaseShelf";
import { socialLocked } from "@/features/friends/socialLock";
import { useShowcaseEditing } from "@/features/friends/useShowcaseEditing";
import { useDevMode } from "@/features/admin/useDevMode";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/collection/card-detail/CardDetail.module.css";
import social from "@/features/friends/ProfileCard.module.css";
import { playButtonClick } from "@/lib/sound";

interface CardDetailShowcaseProps {
  cardId: string;
  /** L'édition montrée par la fiche : c'est elle qu'on expose. */
  edition: CardEdition;
  /** Exemplaires possédés de cette édition : sans exemplaire, rien à exposer. */
  owned: number;
}

/**
 * « MA VITRINE » dans la fiche d'une carte de la Collection : c'est d'ici
 * qu'on expose une carte (le « + » de sa fiche de capitaine y mène). Les six
 * emplacements, en petit : un toucher pose l'édition montrée dans
 * l'emplacement — À L'INSTANT, l'enregistrement suit (`useShowcaseEditing`).
 * Une même édition ne s'expose qu'une fois : elle change de place.
 * « Retirer » l'en sort. Volet social réservé au mode Dev.
 */
export function CardDetailShowcase({ cardId, edition, owned }: CardDetailShowcaseProps) {
  const locked = socialLocked(useDevMode());
  const [loaded, setLoaded] = useState<Showcase | null>(null);
  const { showcase, status, error, commit } = useShowcaseEditing(loaded);

  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    fetchMyShowcase()
      .then((current) => !cancelled && setLoaded(current ?? emptyShowcase()))
      .catch(() => !cancelled && setLoaded(emptyShowcase()));
    return () => {
      cancelled = true;
    };
  }, [locked]);

  if (locked || owned < 1) return null;

  if (!showcase) {
    return (
      <section className={styles.showcaseSection} aria-label="Ma vitrine" aria-busy>
        <h3 className={styles.sectionLabel}>Ma vitrine</h3>
        <span className={social.saveStatus}>
          <span className={social.spinner} aria-hidden /> Ouverture de ta vitrine…
        </span>
      </section>
    );
  }

  const key = editionKey(edition);
  const exposedAt = showcase.findIndex((entry) => entry !== null && entry.cardId === cardId && editionKey(entry) === key);

  return (
    <section className={styles.showcaseSection} aria-label="Ma vitrine">
      <h3 className={styles.sectionLabel}>Ma vitrine</h3>
      <p className={game.caption}>
        {exposedAt >= 0
          ? `Exposée à l'emplacement ${exposedAt + 1}. Touche un autre emplacement pour l'y déplacer.`
          : `Touche un emplacement pour y exposer ${isClassicEdition(edition) ? "cette carte" : `l'édition ${editionLabel(edition)}`}.`}
      </p>
      <ShowcaseShelf
        showcase={showcase}
        compact
        selectedSlot={exposedAt >= 0 ? exposedAt : null}
        onSelectSlot={(slot) => {
          playButtonClick();
          void commit(placeShowcaseCard(showcase, { cardId, ...edition }, slot));
        }}
        emptyLabel="+"
      />
      <div className={social.showcaseTools} aria-live="polite">
        {exposedAt >= 0 ? (
          <button
            type="button"
            className={game.ghost}
            onClick={() => {
              playButtonClick();
              void commit(clearShowcaseSlot(showcase, exposedAt));
            }}
          >
            Retirer de ma vitrine
          </button>
        ) : (
          <span />
        )}
        {status === "saving" && (
          <span className={social.saveStatus} data-status="saving">
            <span className={social.spinner} aria-hidden /> Enregistrement…
          </span>
        )}
        {status === "saved" && (
          <span className={social.saveStatus} data-status="saved">
            Vitrine enregistrée ✓
          </span>
        )}
        {status === "error" && error && (
          <span className={social.saveStatus} data-status="error">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
