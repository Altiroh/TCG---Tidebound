"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@/game";
import { cardArtworkThumbUrl } from "@/features/decks/cardArtUrl";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { ShowcaseTile } from "@/features/friends/ShowcaseShelf";
import type { ShowcaseCard } from "@/features/friends/showcaseRules";
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
  /** Sa propre fiche : le « + » d'un emplacement vide mène à la Collection, où l'on expose ses cartes. */
  onAddCard?: () => void;
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
export function PlayerProfileCard({ player, onAddCard, actions, badge }: PlayerProfileCardProps) {
  /** La carte de vitrine regardée en grand (un toucher), ou `null`. */
  const [viewed, setViewed] = useState<ShowcaseCard | null>(null);
  const cardBack = useCardBackSrc();
  const self = player.relation === "self";
  const { stats } = player;

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        {/* La PHOTO du profil (`ProfileScene`) : le cadre peint, l'illustration
            choisie inclinée dans sa fenêtre, le nom et le titre sur le papier. */}
        <div className={styles.photo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- cadre local */}
          <img className={styles.photoFrame} src="/assets/profile/photo-frame.webp" alt="" draggable={false} />
          <span
            className={styles.photoWindow}
            style={player.avatarCardId ? { backgroundImage: `url("${cardArtworkThumbUrl(player.avatarCardId, player.avatarArtwork)}")` } : undefined}
            data-empty={player.avatarCardId ? undefined : ""}
            aria-hidden
          />
          <span className={styles.photoCaption}>
            <span className={styles.photoName}>{player.name}</span>
            {player.titleName && <span className={styles.photoTitle}>{player.titleName}</span>}
          </span>
          <span className={styles.level} aria-label={`Niveau ${player.level}`}>
            {player.level}
          </span>
        </div>

        <div className={styles.identity}>
          <h3 className={styles.name}>{player.name}</h3>
          {player.friendCode && <p className={styles.code}>#{player.friendCode}</p>}
          <p className={styles.motto}>
            Niveau {player.level}
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
                ? "Six cartes de ta collection, dans l'édition de ton choix — on les expose depuis la Collection. Tes amis et tes adversaires les voient."
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
                  onClick={() => {
                    playButtonClick();
                    setViewed(card);
                  }}
                />
              ) : (
                <span className={styles.emptySlot}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte équipé */}
                  <img src={cardBack} alt="" draggable={false} />
                  {onAddCard && (
                    <button
                      type="button"
                      className={styles.plus}
                      aria-label={`Exposer une carte à l'emplacement ${slot + 1} — depuis la Collection`}
                      onClick={() => {
                        playButtonClick();
                        onAddCard();
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
      {viewed && <ShowcaseCardView card={viewed} onClose={() => setViewed(null)} />}
    </div>
  );
}

/**
 * Une carte de vitrine en GRAND, rien d'autre : ni fiche, ni texte ajouté —
 * la carte elle-même, dans son édition. Un toucher n'importe où, ou Échap,
 * la referme.
 */
function ShowcaseCardView({ card, onClose }: { card: ShowcaseCard; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Le panneau Amis, dessous, ne doit pas se fermer avec.
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className={styles.viewer} role="dialog" aria-modal aria-label={getCardDefinition(card.cardId).name} data-variant="vitrine" onClick={onClose}>
      <div className={styles.viewerCard}>
        <ShowcaseTile card={card} />
      </div>
    </div>,
    document.body
  );
}
