"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RULES, ownershipLabel } from "@/game";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import { cardName, sizeLabel, sortedCards, type BrowserDeck } from "@/features/decks/deckEntries";
import { absoluteDate, relativeDate } from "@/features/decks/deckFilters";
import { daysLeftInTrash } from "@/features/decks/deckTrash";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { PreconToken } from "@/features/shell/GameIcons";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DecksList.module.css";
import { playButtonClick } from "@/lib/sound";

/** Plafond du début de liste : au-delà, c'est l'éditeur qu'on ouvre, pas une fiche qu'on lit. */
const PREVIEW_CARDS = 6;

/** Hauteur de repli d'une ligne de carte, le temps de la mesurer pour de vrai. */
const ROW_FALLBACK = 30;

/**
 * COMBIEN DE CARTES TIENNENT dans la place qui reste.
 *
 * La fiche ne défile pas : tout ce qu'elle montre doit être visible d'un
 * seul regard, sinon ce qu'elle cache n'existe pas. Le seul bloc élastique
 * est donc le début de la liste — il prend ce qui reste entre les actions
 * et les statistiques, en lignes ENTIÈRES : une ligne coupée en deux par
 * le bord du panneau serait pire qu'une ligne en moins.
 *
 * La mesure porte sur la place DISPONIBLE, pas sur le contenu (`flex: 1 1 0`
 * côté CSS) : elle ne dépend donc pas du nombre de lignes affichées, et ne
 * peut pas s'emballer d'un rendu à l'autre.
 */
function useVisibleCardCount(total: number): [React.RefObject<HTMLDivElement>, number] {
  const slot = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(Math.min(total, PREVIEW_CARDS));

  useEffect(() => {
    const element = slot.current;
    if (!element) return;

    function measure() {
      const host = slot.current;
      if (!host) return;
      const row = host.querySelector("li");
      const rowHeight = row?.getBoundingClientRect().height || ROW_FALLBACK;
      const gap = Number.parseFloat(getComputedStyle(host.firstElementChild ?? host).gap || "4") || 4;
      const fits = Math.floor((host.clientHeight + gap) / (rowHeight + gap));
      setCount(Math.max(0, Math.min(total, PREVIEW_CARDS, fits)));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [total]);

  return [slot, count];
}

interface DeckPreviewPanelProps {
  deck: BrowserDeck | null;
  busy: boolean;
  /** Le deck affiché est-il dans « Récemment supprimés » ? Les actions changent alors du tout au tout. */
  trashed: boolean;
  onRename: (deck: BrowserDeck) => void;
  onDuplicate: (deck: BrowserDeck) => void;
  onTrash: (deck: BrowserDeck) => void;
  onRestore: (deck: BrowserDeck) => void;
  onPurge: (deck: BrowserDeck) => void;
  onSetDefault: (deck: BrowserDeck) => void;
  onEditArt: (deck: BrowserDeck) => void;
  onEditProfile: (deck: BrowserDeck) => void;
  /** Decks fournis par le jeu : la fiche complète (déblocage compris) reste celle du catalogue. */
  onOpenCatalogSheet: (deck: BrowserDeck) => void;
  onTryCatalog: (deck: BrowserDeck) => void;
}

function difficultyStars(difficulty: number): string {
  const filled = Math.min(5, Math.max(0, Math.round(difficulty)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

/**
 * LA FICHE DU DECK POINTÉ — la troisième colonne de l'écran.
 *
 * Elle reprend ce que la fiche de l'écran Jouer montre déjà (illustration,
 * nom, Navire, profil) et va plus loin, parce qu'ici on ne choisit pas un
 * deck pour une partie : on le GÈRE. D'où les actions, le début de la
 * liste de cartes et les dates.
 *
 * L'illustration est posée en pleine image, SANS dégradé : elle est le
 * portrait du deck, pas une texture de fond. Le texte vit sous elle, sur le
 * panneau, et n'a donc pas à être protégé d'elle.
 */
export function DeckPreviewPanel({
  deck,
  busy,
  trashed,
  onRename,
  onDuplicate,
  onTrash,
  onRestore,
  onPurge,
  onSetDefault,
  onEditArt,
  onEditProfile,
  onOpenCatalogSheet,
  onTryCatalog,
}: DeckPreviewPanelProps) {
  // Avant tout retour anticipé : un Hook ne se saute pas.
  const [slot, visibleCards] = useVisibleCardCount(deck?.cards.length ?? 0);

  if (!deck) {
    return (
      <aside className={`${game.panel} ${styles.preview}`} data-empty="true" aria-label="Fiche du deck">
        <p className={game.emptyTitle}>Choisis un deck</p>
        <p className={game.muted}>Sa fiche s&apos;affiche ici : composition, statistiques et actions.</p>
      </aside>
    );
  }

  const mine = deck.mine;
  const catalog = deck.catalog;
  const cards = sortedCards(deck.cards);
  const daysLeft = mine?.deletedAt ? daysLeftInTrash(mine.deletedAt) : null;

  return (
    <aside className={`${game.panel} ${styles.preview}`} aria-label={`Fiche de ${deck.name}`} aria-live="polite">
      <div className={styles.previewScroll}>
        <div className={styles.previewArt}>
          {deck.artUrl && <img src={deck.artUrl} alt="" className={styles.previewArtImage} draggable={false} />}

          <div className={styles.previewArtTop}>
            {mine?.isDefault && (
              <span className={`${game.badge} ${styles.previewBadge}`}>
                <span aria-hidden>★</span> Deck par défaut
              </span>
            )}
            {catalog?.unlocked && <span className={game.tagSuccess}>{deck.kind === "borrowed" ? "Emprunté" : "Débloqué"}</span>}
            {mine && !trashed && (
              <button
                type="button"
                className={`${game.secondary} ${game.buttonSm} ${styles.previewArtButton}`}
                onClick={() => {
                  playButtonClick();
                  onEditArt(deck);
                }}
                disabled={busy || deck.cards.length === 0}
              >
                Modifier l&apos;illustration
              </button>
            )}
          </div>
        </div>

        <div className={styles.previewBody}>
          <h2 className={styles.previewName}>{deck.name}</h2>
          <p className={styles.previewShip}>{shipNameOf(deck.shipId)}</p>

          <div className={styles.previewTags}>
            {trashed && daysLeft !== null ? (
              <span className={game.tagDanger}>{daysLeft <= 1 ? "Effacé sous 24 h" : `Effacé dans ${daysLeft} j`}</span>
            ) : mine ? (
              mine.isValid ? (
                <span className={game.tagSuccess}>Jouable</span>
              ) : (
                <span className={game.tagDanger}>{deck.cardCount < RULES.DECK_SIZE_MIN ? `Min. ${RULES.DECK_SIZE_MIN}` : "Non valide"}</span>
              )
            ) : null}
            <span className={game.tag}>{sizeLabel(deck.cardCount)}</span>
          </div>

          {deck.description && <p className={styles.previewText}>{deck.description}</p>}

          {/* Le PROFIL : écrit par le jeu pour ses listes, déduit des cartes
              pour un deck monté — et corrigible à la main dans ce cas. */}
          {deck.style && (
            <div className={styles.previewProfile}>
              <span className={styles.previewProfileLine}>
                <span className={game.tagCyan}>{deck.style}</span>
                <span className={styles.previewStars} title={`Difficulté ${Math.round(deck.difficulty)} sur 5`}>
                  {difficultyStars(deck.difficulty)}
                </span>
              </span>
              {deck.mechanics.length > 0 && (
                <ul className={styles.previewMechanics}>
                  {deck.mechanics.map((mechanic) => (
                    <li key={mechanic} className={styles.previewMechanic}>
                      {mechanic}
                    </li>
                  ))}
                </ul>
              )}
              {mine && !trashed && (
                <p className={styles.previewProfileNote}>
                  {deck.profileIsCustom ? "Profil écrit par toi." : "Profil déduit de tes cartes."}{" "}
                  <button
                    type="button"
                    className={game.link}
                    onClick={() => {
                      playButtonClick();
                      onEditProfile(deck);
                    }}
                    disabled={busy}
                  >
                    Modifier
                  </button>
                </p>
              )}
            </div>
          )}

          {catalog && (
            <p className={styles.previewOwn}>
              {ownershipLabel(catalog.ownership)}
              <span className={game.progressTrack} aria-hidden>
                <span
                  className={catalog.ownership.complete ? game.progressFillSuccess : game.progressFill}
                  style={{ width: `${catalog.ownership.total === 0 ? 0 : (catalog.ownership.owned / catalog.ownership.total) * 100}%` }}
                />
              </span>
            </p>
          )}

          {/* ── Les actions ─────────────────────────────────────────── */}
          <div className={styles.previewActions}>
            {mine ? (
              trashed ? (
                <>
                  <button type="button" className={`${game.primary} ${game.buttonSm}`} onClick={() => onRestore(deck)} disabled={busy}>
                    Restaurer
                  </button>
                  <button type="button" className={`${game.dangerGhost} ${game.buttonSm}`} onClick={() => onPurge(deck)} disabled={busy}>
                    Effacer définitivement
                  </button>
                </>
              ) : (
                <>
                  <Link href={`/decks/${deck.id}`} className={`${game.primary} ${game.buttonSm}`} onClick={() => playButtonClick()}>
                    <span aria-hidden>▶</span> Ouvrir
                  </Link>
                  <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => onRename(deck)} disabled={busy}>
                    Renommer
                  </button>
                  <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => onDuplicate(deck)} disabled={busy}>
                    Dupliquer
                  </button>
                  <button type="button" className={`${game.dangerGhost} ${game.buttonSm}`} onClick={() => onTrash(deck)} disabled={busy}>
                    Supprimer
                  </button>
                  {/* Seul un deck jouable peut être celui qu'on joue par défaut. */}
                  {mine.isValid && !mine.isDefault && (
                    <button type="button" className={game.link} onClick={() => onSetDefault(deck)} disabled={busy}>
                      Choisir par défaut
                    </button>
                  )}
                </>
              )
            ) : (
              <>
                <button type="button" className={`${game.primary} ${game.buttonSm}`} onClick={() => onOpenCatalogSheet(deck)} disabled={busy}>
                  Voir la fiche
                </button>
                <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => onTryCatalog(deck)} disabled={busy}>
                  Essayer contre le bot
                </button>
                {deck.kind === "precon" && !catalog?.unlocked && (
                  <span className={`${game.tagBrass} ${styles.previewCost}`}>
                    <PreconToken size={13} /> 1 Jeton
                  </span>
                )}
              </>
            )}
          </div>

          {/* ── Le début de la liste ────────────────────────────────── */}
          <div className={styles.previewSection}>
            <p className={game.sectionTitle}>
              Cartes ({deck.cardCount} / {RULES.DECK_SIZE_MAX})
            </p>
            {mine && !trashed && (
              <Link href={`/decks/${deck.id}`} className={game.link} onClick={() => playButtonClick()}>
                Voir toutes les cartes →
              </Link>
            )}
            {catalog && (
              <button type="button" className={game.link} onClick={() => onOpenCatalogSheet(deck)}>
                Voir toutes les cartes →
              </button>
            )}
          </div>

          {cards.length === 0 ? (
            <p className={game.muted}>Ce deck est vide : ouvre-le pour y mettre des cartes.</p>
          ) : (
            /* LE SEUL BLOC ÉLASTIQUE de la fiche : il prend ce qui reste
               entre les actions et les statistiques, en lignes entières. */
            <div className={styles.cardSlot} ref={slot}>
              <ul className={styles.cardList}>
                {cards.slice(0, visibleCards).map((card, index) => (
                  <li key={card.cardId} className={styles.cardRow}>
                    <span className={styles.cardRank} aria-hidden>
                      {index + 1}
                    </span>
                    <span
                      className={styles.cardStrip}
                      style={{ backgroundImage: `url("${cardIllustrationUrl(card.cardId)}")` }}
                      aria-hidden
                    />
                    <span className={styles.cardName}>{cardName(card.cardId)}</span>
                    <span className={styles.cardCount}>x{card.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Les statistiques ───────────────────────────────────── */}
          <div className={styles.previewSection}>
            <p className={game.sectionTitle}>Statistiques</p>
          </div>
          <div className={styles.previewStats}>
            <span className={styles.previewStat}>
              <span className={styles.previewStatLabel}>Créé le</span>
              <span className={styles.previewStatValue}>{mine ? absoluteDate(mine.createdAt) : "Fourni par le jeu"}</span>
            </span>
            <span className={styles.previewStat}>
              <span className={styles.previewStatLabel}>Dernière modification</span>
              <span className={styles.previewStatValue}>{mine ? relativeDate(mine.updatedAt) : "—"}</span>
            </span>
            <span className={styles.previewStat}>
              <span className={styles.previewStatLabel}>Format</span>
              <span className={styles.previewStatValue}>Standard</span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
