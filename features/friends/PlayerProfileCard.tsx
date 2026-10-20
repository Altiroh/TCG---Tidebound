"use client";

import { useState, type ReactNode } from "react";
import { cardArtworkThumbUrl } from "@/features/decks/cardArtUrl";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { ShowcaseTile } from "@/features/friends/ShowcaseShelf";
import { PreconToken } from "@/features/shell/GameIcons";
import styles from "@/features/friends/ProfileCard.module.css";
import { playButtonClick } from "@/lib/sound";

function formatCount(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8L3 8Z" fill="currentColor" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M5 20.5h14" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="11" height="15" rx="1.8" stroke="currentColor" strokeWidth={1.6} transform="rotate(-8 9.5 12.5)" />
      <rect x="9" y="4" width="11" height="15" rx="1.8" fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

interface PlayerProfileCardProps {
  player: PlayerCardView;
  /** Sa propre fiche : un emplacement de vitrine se touche pour le remplir ou le changer. */
  onEditSlot?: (slot: number) => void;
  /** Les gestes possibles avec ce joueur (ajouter, combat, échange), sous l'identité. */
  actions?: ReactNode;
  /** Pastille posée près du nom (« Ami », « Demande envoyée »). */
  badge?: string | null;
}

/**
 * FICHE DE CAPITAINE (maquette du 20/10/2026) : le portrait dans son anneau
 * de laiton, le niveau en médaillon, le pseudo, quatre chiffres (parties,
 * victoires, préconstruits, cartes) et la VITRINE — six cartes possédées,
 * dans l'édition choisie. Une place vide montre le dos de carte ; sur sa
 * propre fiche, elle porte un « + » qui ouvre le choix.
 */
export function PlayerProfileCard({ player, onEditSlot, actions, badge }: PlayerProfileCardProps) {
  const [broken, setBroken] = useState(false);
  const cardBack = useCardBackSrc();
  const self = player.relation === "self";
  const { stats } = player;

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        <span className={styles.portrait}>
          <span className={styles.portraitFrame}>
            {player.avatarCardId && !broken ? (
              // eslint-disable-next-line @next/next/no-img-element -- vignette d'illustration locale
              <img src={cardArtworkThumbUrl(player.avatarCardId, player.avatarArtwork)} alt="" draggable={false} onError={() => setBroken(true)} />
            ) : (
              <span className={styles.portraitInitial} aria-hidden>
                {player.name.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span className={styles.level} aria-label={`Niveau ${player.level}`}>
            {player.level}
          </span>
        </span>

        <div className={styles.identity}>
          <h3 className={styles.name}>{player.name}</h3>
          {player.friendCode && <p className={styles.code}>#{player.friendCode}</p>}
          <p className={styles.motto}>
            {player.titleName ?? (self ? "Aucun titre porté" : "Capitaine")}
            {badge && <span className={styles.badge}>{badge}</span>}
          </p>
        </div>
      </header>

      {actions && <div className={styles.actions}>{actions}</div>}

      <dl className={styles.stats}>
        <div className={styles.stat}>
          {/* eslint-disable-next-line @next/next/no-img-element -- icône locale */}
          <img className={styles.statIcon} src="/assets/profile/icon-parties.webp" alt="" draggable={false} />
          <dd className={styles.statValue}>{formatCount(stats.matchesPlayed)}</dd>
          <dt className={styles.statLabel}>Parties jouées</dt>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}>
            <CrownIcon />
          </span>
          <dd className={styles.statValue}>{formatCount(stats.wins)}</dd>
          <dt className={styles.statLabel}>Victoires</dt>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}>
            <PreconToken size={26} />
          </span>
          <dd className={styles.statValue}>{formatCount(stats.preconsOwned)}</dd>
          <dt className={styles.statLabel}>Préconstruits possédés</dt>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}>
            <CardsIcon />
          </span>
          <dd className={styles.statValue}>{formatCount(stats.cardsCollected)}</dd>
          <dt className={styles.statLabel}>Cartes collectées</dt>
        </div>
      </dl>

      <section className={styles.showcase} aria-label="Vitrine">
        <div className={styles.showcaseHead}>
          <span className={styles.showcaseIcon}>
            <CardsIcon />
          </span>
          <div>
            <h4 className={styles.showcaseTitle}>Vitrine</h4>
            <p className={styles.showcaseText}>
              {self
                ? "Six cartes de ta collection, dans l'édition de ton choix. Tes amis et tes adversaires les voient."
                : `Les cartes que ${player.name} met en avant.`}
            </p>
          </div>
        </div>
        <div className={styles.slots}>
          {player.showcase.map((card, slot) => (
            <div key={slot} className={styles.slot}>
              {card ? (
                <ShowcaseTile
                  card={card}
                  onClick={
                    onEditSlot
                      ? () => {
                          playButtonClick();
                          onEditSlot(slot);
                        }
                      : undefined
                  }
                />
              ) : (
                <span className={styles.emptySlot}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte équipé */}
                  <img src={cardBack} alt="" draggable={false} />
                  {onEditSlot && (
                    <button
                      type="button"
                      className={styles.plus}
                      aria-label={`Exposer une carte à l'emplacement ${slot + 1}`}
                      onClick={() => {
                        playButtonClick();
                        onEditSlot(slot);
                      }}
                    >
                      +
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
