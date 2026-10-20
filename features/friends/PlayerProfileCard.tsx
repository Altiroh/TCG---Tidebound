"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@/game";
import { cardArtworkThumbUrl } from "@/features/decks/cardArtUrl";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { ShowcaseTile } from "@/features/friends/ShowcaseShelf";
import { clearShowcaseSlot, moveShowcaseCard, type Showcase, type ShowcaseCard } from "@/features/friends/showcaseRules";
import type { ShowcaseSaveStatus } from "@/features/friends/useShowcaseEditing";
import { PreconToken, TideCoin } from "@/features/shell/GameIcons";
import { editionRecycleValueOf } from "@/features/collection/recycleValue";
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
  /**
   * Sa propre vitrine, à arranger sur place : déplacer (glisser-déposer, ou
   * toucher puis toucher la nouvelle place), retirer. Le parent l'applique
   * tout de suite et l'enregistre (`useShowcaseEditing`).
   */
  onShowcaseChange?: (next: Showcase) => void;
  /** Où en est l'enregistrement du dernier geste. */
  saveStatus?: ShowcaseSaveStatus;
  saveError?: string | null;
}

/**
 * FICHE DE CAPITAINE (maquette du 20/10/2026) : le portrait dans son anneau
 * de laiton, le niveau en médaillon, le pseudo, quatre chiffres (parties,
 * victoires, préconstruits, cartes) et la VITRINE — six cartes possédées,
 * dans l'édition choisie. Une place vide montre le dos de carte. Une carte
 * se touche pour la voir en grand ; sur SA fiche, elle s'arrange sur place
 * (déplacer, retirer) et le « + » d'une place vide mène à la Collection.
 */
export function PlayerProfileCard({ player, onAddCard, actions, badge, onShowcaseChange, saveStatus = "idle", saveError = null }: PlayerProfileCardProps) {
  /** La carte de vitrine regardée en grand (un toucher), ou `null`. */
  const [viewed, setViewed] = useState<ShowcaseCard | null>(null);
  const editable = Boolean(onShowcaseChange);
  const showcase = player.showcase;
  /** Arrangement : la carte touchée (elle attend sa nouvelle place), celle qu'on glisse, la place survolée. */
  const [selected, setSelected] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);
  const selectedCard = selected !== null ? (showcase[selected] ?? null) : null;
  /** Valeur de revente cumulée des cartes exposées, édition comprise. */
  const showcaseValue = showcase.reduce((sum, card) => sum + (card ? (editionRecycleValueOf(card.cardId, card) ?? 0) : 0), 0);

  function view(card: ShowcaseCard) {
    playButtonClick();
    setViewed(card);
  }

  function move(from: number, to: number) {
    if (from === to) return;
    playButtonClick();
    onShowcaseChange?.(moveShowcaseCard(showcase, from, to));
  }

  /** Toucher un emplacement de sa vitrine : choisir une carte, puis sa nouvelle place. */
  function touch(slot: number) {
    if (selected === null) {
      if (!showcase[slot]) return;
      playButtonClick();
      setSelected(slot);
      return;
    }
    if (selected !== slot) move(selected, slot);
    setSelected(null);
  }
  const cardBack = useCardBackSrc();
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
          <h4 className={styles.showcaseTitle}>Vitrine</h4>
        </div>
        <div className={styles.slots}>
          {showcase.map((card, slot) => (
            <div
              key={slot}
              className={styles.slot}
              data-selected={selected === slot || undefined}
              data-drop={editable && dropOver === slot && dragFrom !== slot ? "" : undefined}
              onDragOver={
                editable && dragFrom !== null
                  ? (event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dropOver !== slot) setDropOver(slot);
                    }
                  : undefined
              }
              onDragLeave={editable ? () => setDropOver((current) => (current === slot ? null : current)) : undefined}
              onDrop={
                editable
                  ? (event) => {
                      event.preventDefault();
                      if (dragFrom !== null) move(dragFrom, slot);
                      setDragFrom(null);
                      setDropOver(null);
                    }
                  : undefined
              }
            >
              {card ? (
                <>
                  <ShowcaseTile
                    card={card}
                    onClick={() => (editable ? touch(slot) : view(card))}
                    onDragStart={
                      editable
                        ? (event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", String(slot));
                            setSelected(null);
                            setDragFrom(slot);
                          }
                        : undefined
                    }
                  />
                  {/* Ce qu'elle vaut — c'est fait pour frimer. */}
                  <span className={styles.slotValue} title="Valeur de revente de cette édition">
                    <TideCoin size={14} />
                    {formatCount(editionRecycleValueOf(card.cardId, card) ?? 0)}
                  </span>
                </>
              ) : (
                <span className={styles.emptySlot} onClick={editable && selected !== null ? () => touch(slot) : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte équipé */}
                  <img src={cardBack} alt="" draggable={false} />
                  {editable && (
                    <button
                      type="button"
                      className={styles.plus}
                      aria-label={selected !== null ? `Déplacer la carte à l'emplacement ${slot + 1}` : `Exposer une carte à l'emplacement ${slot + 1} — depuis la Collection`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (selected !== null) touch(slot);
                        else {
                          playButtonClick();
                          onAddCard?.();
                        }
                      }}
                    >
                      {selected !== null ? "↓" : "+"}
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
        {showcaseValue > 0 && (
          <p className={styles.showcaseTotal}>
            <span>Valeur de la vitrine</span>
            <span className={styles.showcaseTotalValue}>
              <TideCoin size={20} />
              {formatCount(showcaseValue)}
            </span>
          </p>
        )}
        {editable && (
          <div className={styles.showcaseTools} aria-live="polite">
            {selectedCard ? (
              <>
                <span className={styles.showcaseHint}>Touche un autre emplacement pour l&apos;y déplacer.</span>
                <span className={styles.showcaseButtons}>
                  <button type="button" className={styles.toolButton} onClick={() => view(selectedCard)}>
                    Voir en grand
                  </button>
                  <button
                    type="button"
                    className={styles.toolButton}
                    onClick={() => {
                      playButtonClick();
                      onShowcaseChange!(clearShowcaseSlot(showcase, selected!));
                      setSelected(null);
                    }}
                  >
                    Retirer
                  </button>
                  <button type="button" className={styles.toolButton} onClick={() => setSelected(null)}>
                    Annuler
                  </button>
                </span>
              </>
            ) : (
              <span className={styles.showcaseHint}>Glisse une carte, ou touche-la puis touche sa nouvelle place.</span>
            )}
            {saveStatus === "saving" && (
              <span className={styles.saveStatus} data-status="saving">
                <span className={styles.spinner} aria-hidden /> Enregistrement…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className={styles.saveStatus} data-status="saved">
                Vitrine enregistrée ✓
              </span>
            )}
            {saveStatus === "error" && saveError && (
              <span className={styles.saveStatus} data-status="error">
                {saveError}
              </span>
            )}
          </div>
        )}
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
