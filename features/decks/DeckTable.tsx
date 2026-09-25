"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RULES, ownershipLabel } from "@/game";
import { cardIllustrationThumbUrl } from "@/features/decks/nameplateArt";
import { cardName, sortedCards, type BrowserDeck } from "@/features/decks/deckEntries";
import { DECK_SORTS, type DeckSortId } from "@/features/decks/deckFilters";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { PreconToken } from "@/features/shell/GameIcons";
import styles from "@/features/decks/DeckTable.module.css";
import { playButtonClick } from "@/lib/sound";

const ASSETS = "/assets/decks/liste";

/** Les quatre onglets de la table. */
export type TableTab = "mine" | "precon" | "favorites" | "recent";

const TABS: Array<{ id: TableTab; label: string; icon: string }> = [
  { id: "mine", label: "Mes decks", icon: "icone-mes-decks" },
  { id: "precon", label: "Préconstruits", icon: "icone-preconstruits" },
  { id: "favorites", label: "Favoris", icon: "icone-favoris" },
  { id: "recent", label: "Récemment joués", icon: "icone-recemment-joues" },
];

/** Decks visibles d'un coup sur la table : deux rangées de six. */
const PER_PAGE = 12;
/** Inclinaisons et décalages des piles, comme posées à la main sur la carte (ordre de la rangée). */
const TILTS = [-4.5, 1.5, 3.5, -2.8, 4, -1.6, 2.6, -3.4, 0.8, 3.8, -2.2, 1.9];
const LIFTS = [2.2, -1.2, 1.4, 2.8, 0.4, -0.8, 1.6, -0.4, 2.4, 0.2, 1.8, -1];
/** Coins libres du livre où l'encre peut tomber (en % de la scène). */
const INK_ZONES = [
  { x: 8, y: 82, w: 12, h: 8 },
  { x: 52, y: 82, w: 9, h: 9 },
  { x: 30, y: 6, w: 12, h: 5 },
  { x: 48, y: 24, w: 4, h: 3 },
];

/** Lignes de la liste de cartes dans la fiche. */
const FICHE_CARDS = 6;

export interface DeckTableActions {
  busy: boolean;
  onRename: (deck: BrowserDeck) => void;
  onDuplicate: (deck: BrowserDeck) => void;
  onTrash: (deck: BrowserDeck) => void;
  onRestore: (deck: BrowserDeck) => void;
  onPurge: (deck: BrowserDeck) => void;
  onOpenCatalogSheet: (deck: BrowserDeck) => void;
  onTryCatalog: (deck: BrowserDeck) => void;
  onCopy?: (deck: BrowserDeck) => void;
}

interface DeckTableProps extends DeckTableActions {
  tab: TableTab;
  onTab: (tab: TableTab) => void;
  decks: BrowserDeck[];
  current: BrowserDeck | null;
  onSelect: (id: string) => void;
  sort: DeckSortId;
  onSort: (sort: DeckSortId) => void;
  search: string;
  onSearch: (search: string) => void;
  favorites: ReadonlySet<string>;
  onToggleFavorite: (id: string) => void;
  /** Montrer la pile « Nouveau deck » (onglet Mes decks, connecté). */
  canCreate: boolean;
  /** Le deck affiché est dans la corbeille. */
  trashed: boolean;
  /** Bascule vers la corbeille (« Récemment supprimés ») et retour. */
  trash: { count: number; active: boolean; onToggle: () => void } | null;
  emptyLabel: string;
}

function stars(difficulty: number): string {
  const filled = Math.min(5, Math.max(0, Math.round(difficulty)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}


/**
 * LA TABLE DES DECKS — nouvelle liste des decks (maquette du 25/09/2026).
 *
 * Tout est posé sur le livre de bord (`fond.webp`) : les onglets sur une
 * bande de parchemin, le tri et la recherche à droite, les decks en PILES
 * inclinées comme posées à la main, et la fiche du deck choisi dans son
 * cadre de bois. Même logique que l'ancien écran (`DecksScreen` fournit les
 * decks triés/filtrés et toutes les actions) : seule la présentation change.
 *
 * Mise en page en pourcentages d'une scène à ratio fixe (`cqw`) : les
 * alignements et les inclinaisons de la maquette tiennent à toutes les
 * tailles, comme le hub des Récompenses.
 */
export function DeckTable(props: DeckTableProps) {
  const { decks, current, onSelect } = props;
  const slots = props.canCreate ? [null, ...decks] : decks;
  const currentIndex = current ? slots.findIndex((deck) => deck?.id === current.id) : -1;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(slots.length / PER_PAGE));

  // La page suit le deck choisi (changement d'onglet, deck ouvert ailleurs).
  useEffect(() => {
    if (currentIndex >= 0) setPage(Math.floor(currentIndex / PER_PAGE));
  }, [currentIndex]);
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  const visible = slots.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  // Encrier : trois taches, pas une de plus.
  const [blots, setBlots] = useState<Array<{ id: number; x: number; y: number; size: number; variant: number; turn: number }>>([]);
  const [shaking, setShaking] = useState(false);
  /** L'encrier ne contient que trois gouttes. */
  const [drops, setDrops] = useState(0);
  function spill() {
    if (drops >= 3) return;
    setDrops((value) => value + 1);
    setShaking(true);
    setTimeout(() => setShaking(false), 420);
    setBlots((current) => {
      const id = (current.at(-1)?.id ?? 0) + 1;
      // Dans un coin LIBRE du livre (ni sous les piles, ni sous la fiche), un autre à chaque fois.
      const zone = INK_ZONES[id % INK_ZONES.length]!;
      const blot = {
        id,
        x: zone.x + Math.random() * zone.w,
        y: zone.y + Math.random() * zone.h,
        size: 7 + Math.random() * 6,
        variant: 1 + Math.floor(Math.random() * 3),
        turn: Math.round(Math.random() * 360),
      };
      return [...current, blot].slice(-3);
    });
  }

  return (
    <div className={styles.page}>
      <span className={styles.lanternGlow} aria-hidden />
      <div className={styles.stage}>
        {/* ── Décor posé sur la table ── */}
        {/* eslint-disable @next/next/no-img-element -- décor peint, positionné à la main */}
        <img className={styles.quill} src={`${ASSETS}/plume.webp`} alt="" draggable={false} />
        <img className={styles.candle} src={`${ASSETS}/bougie.webp`} alt="" draggable={false} />
        <img className={styles.bottle} src={`${ASSETS}/bouteille.webp`} alt="" draggable={false} />
        {/* eslint-enable @next/next/no-img-element */}
        <span className={styles.candleGlow} aria-hidden />
        <span className={styles.candleCast} aria-hidden />

        {/* Les taches d'encre renversées (trois au plus). */}
        {blots.map((blot) => (
          <span
            key={blot.id}
            className={styles.blot}
            style={{
              left: `${blot.x}%`,
              top: `${blot.y}%`,
              width: `${blot.size}%`,
              backgroundImage: `url("${ASSETS}/encre-${blot.variant}.webp")`,
              ["--turn" as string]: `${blot.turn}deg`,
            }}
            aria-hidden
          />
        ))}
        {/* L'encrier : un toucher le fait trembler, et l'encre éclabousse le livre. */}
        <button
          type="button"
          className={styles.inkwell}
          data-shaking={shaking || undefined}
          onClick={spill}
          disabled={drops >= 3}
          aria-label={drops >= 3 ? "L'encrier est vide" : "Renverser un peu d'encre"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- décor peint */}
          <img src={`${ASSETS}/encrier.webp`} alt="" draggable={false} />
        </button>

        {/* ── Onglets ── */}
        <nav className={styles.tabs} role="tablist" aria-label="Rayons">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={props.tab === tab.id}
              className={styles.tab}
              data-active={props.tab === tab.id || undefined}
              onClick={() => {
                playButtonClick();
                props.onTab(tab.id);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- icône peinte */}
              <img src={`${ASSETS}/${tab.icon}.webp`} alt="" draggable={false} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* ── Tri et recherche ── */}
        <label className={styles.sort}>
          <span className={styles.sortLabel}>Trier par :</span>
          <select className={styles.sortSelect} value={props.sort} onChange={(event) => props.onSort(event.target.value as DeckSortId)} aria-label="Trier les decks">
            {DECK_SORTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.search}>
          <span className={styles.visuallyHidden}>Rechercher un deck</span>
          <input type="search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Rechercher un deck…" />
        </label>
        {props.trash && (
          <button type="button" className={styles.trashLink} data-active={props.trash.active || undefined} onClick={props.trash.onToggle}>
            {props.trash.active ? "← Retour à mes decks" : `Récemment supprimés (${props.trash.count})`}
          </button>
        )}

        {/* ── Les piles ── */}
        <button
          type="button"
          className={`${styles.bigArrow} ${styles.bigArrowLeft}`}
          aria-label="Decks précédents"
          disabled={page === 0}
          onClick={() => {
            playButtonClick();
            setPage((value) => Math.max(0, value - 1));
          }}
        />
        <ul className={styles.stacks} role="listbox" aria-label="Decks">
          {visible.length === 0 && <li className={styles.empty}>{props.emptyLabel}</li>}
          {visible.map((deck, index) => {
            const tilt = TILTS[index % TILTS.length]!;
            const lift = LIFTS[index % LIFTS.length]!;
            if (!deck) {
              return (
                <li key="nouveau" className={styles.slot} style={{ ["--tilt" as string]: `${tilt}deg`, ["--lift" as string]: `${lift}%` }}>
                  <Link href="/decks/nouveau" className={`${styles.stack} ${styles.stackNew}`} onClick={() => playButtonClick()}>
                    <span className={styles.stackWindow}>
                      <span className={styles.newPlus} aria-hidden>
                        +
                      </span>
                    </span>
                    <span className={styles.banner}>
                      <span className={styles.bannerName}>Nouveau deck</span>
                      <span className={styles.bannerShip}>Choisir un Navire</span>
                    </span>
                  </Link>
                </li>
              );
            }
            const selected = deck.id === current?.id;
            return (
              <li key={deck.id} className={styles.slot} style={{ ["--tilt" as string]: `${tilt}deg`, ["--lift" as string]: `${lift}%` }}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={styles.stack}
                  data-selected={selected || undefined}
                  onClick={() => {
                    playButtonClick();
                    onSelect(deck.id);
                  }}
                >
                  <span className={styles.stackWindow} style={deck.artUrl ? { backgroundImage: `url("${deck.artUrl}")` } : undefined} />
                  {props.favorites.has(deck.id) && (
                    <span className={styles.stackFavorite} aria-label="Favori">
                      ★
                    </span>
                  )}
                  {selected && <span className={styles.selectedChip}>Sélectionné</span>}
                  <span className={styles.banner}>
                    <span className={styles.bannerName} style={{ ["--len" as string]: Math.max(10, deck.name.length) }}>
                      {deck.name}
                    </span>
                    <span className={styles.bannerShip}>{shipNameOf(deck.shipId)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className={`${styles.bigArrow} ${styles.bigArrowRight}`}
          aria-label="Decks suivants"
          disabled={page >= pages - 1}
          onClick={() => {
            playButtonClick();
            setPage((value) => Math.min(pages - 1, value + 1));
          }}
        />

        {/* ── La fiche ── */}
        <DeckFiche {...props} deck={current} />
      </div>
    </div>
  );
}

function DeckFiche(props: DeckTableProps & { deck: BrowserDeck | null }) {
  const { deck } = props;
  const cards = useMemo(() => (deck ? sortedCards(deck.cards) : []), [deck]);

  if (!deck) {
    return (
      <aside className={styles.fiche} aria-label="Fiche du deck">
        <div className={styles.ficheBody}>
          <p className={styles.ficheEmpty}>Choisis un deck : sa fiche s&apos;affiche ici.</p>
        </div>
      </aside>
    );
  }

  const mine = deck.mine;
  const catalog = deck.catalog;
  const favorite = props.favorites.has(deck.id);

  return (
    <aside className={styles.fiche} aria-label={`Fiche de ${deck.name}`} aria-live="polite">
      <span className={styles.ficheArt} style={deck.artUrl ? { backgroundImage: `url("${deck.artUrl}")` } : undefined} />
      <span className={styles.ficheRope} aria-hidden />
      <button
        type="button"
        className={styles.ficheFavorite}
        data-active={favorite || undefined}
        aria-pressed={favorite}
        aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        onClick={() => {
          playButtonClick();
          props.onToggleFavorite(deck.id);
        }}
      >
        ★
      </button>

      <div className={styles.ficheBody}>
        <h2 className={styles.ficheName}>{deck.name}</h2>
        <p className={styles.ficheShip}>{shipNameOf(deck.shipId)}</p>

        <div className={styles.ficheTags}>
          {mine &&
            (props.trashed ? (
              <span className={styles.chipDanger}>Supprimé</span>
            ) : mine.isValid ? (
              <span className={styles.chipOk}>Jouable</span>
            ) : (
              <span className={styles.chipDanger}>{deck.cardCount < RULES.DECK_SIZE_MIN ? `Min. ${RULES.DECK_SIZE_MIN}` : "Non valide"}</span>
            ))}
          {catalog?.unlocked && <span className={styles.chipOk}>Débloqué</span>}
          <span className={styles.chip}>
            {deck.cardCount} / {RULES.DECK_SIZE_MAX} cartes
          </span>
          {deck.style && <span className={styles.chip}>{deck.style}</span>}
          {deck.style && (
            <span className={styles.ficheStars} title={`Difficulté ${Math.round(deck.difficulty)} sur 5`}>
              {stars(deck.difficulty)}
            </span>
          )}
        </div>

        {deck.description && <p className={styles.ficheText}>{deck.description}</p>}
        {catalog && <p className={styles.ficheOwn}>{ownershipLabel(catalog.ownership)}</p>}

        <div className={styles.ficheActions}>
          {mine ? (
            props.trashed ? (
              <>
                <button type="button" className={styles.btnPrimary} onClick={() => props.onRestore(deck)} disabled={props.busy}>
                  Restaurer
                </button>
                <button type="button" className={styles.btnDanger} onClick={() => props.onPurge(deck)} disabled={props.busy}>
                  Effacer
                </button>
              </>
            ) : (
              <>
                <Link href={`/decks/${deck.id}`} className={styles.btnPrimary} onClick={() => playButtonClick()}>
                  <span aria-hidden>▶</span> Ouvrir
                </Link>
                <button type="button" className={styles.btnWood} onClick={() => props.onRename(deck)} disabled={props.busy}>
                  Renommer
                </button>
                <button type="button" className={styles.btnWood} onClick={() => props.onDuplicate(deck)} disabled={props.busy}>
                  Dupliquer
                </button>
                <button type="button" className={styles.btnDanger} onClick={() => props.onTrash(deck)} disabled={props.busy}>
                  Supprimer
                </button>
              </>
            )
          ) : (
            <>
              <button type="button" className={styles.btnPrimary} onClick={() => props.onOpenCatalogSheet(deck)} disabled={props.busy}>
                <span aria-hidden>▶</span> Voir la fiche
              </button>
              <button type="button" className={styles.btnWood} onClick={() => props.onTryCatalog(deck)} disabled={props.busy}>
                Essayer
              </button>
              {props.onCopy && (
                <button type="button" className={styles.btnWood} onClick={() => props.onCopy?.(deck)} disabled={props.busy}>
                  Copier
                </button>
              )}
              {deck.kind === "precon" && !catalog?.unlocked && (
                <span className={styles.chip}>
                  <PreconToken size={12} /> 1 Jeton
                </span>
              )}
            </>
          )}
        </div>

        <div className={styles.ficheSection}>
          <span>
            Cartes ({cards.length} / {RULES.DECK_SIZE_MAX})
          </span>
          {mine && !props.trashed ? (
            <Link href={`/decks/${deck.id}`} className={styles.ficheLink} onClick={() => playButtonClick()}>
              Voir toutes les cartes →
            </Link>
          ) : catalog ? (
            <button type="button" className={styles.ficheLink} onClick={() => props.onOpenCatalogSheet(deck)}>
              Voir toutes les cartes →
            </button>
          ) : null}
        </div>

        {cards.length === 0 ? (
          <p className={styles.ficheEmpty}>Ce deck est vide : ouvre-le pour y mettre des cartes.</p>
        ) : (
          <ol className={styles.cardList}>
            {cards.slice(0, FICHE_CARDS).map((card, index) => (
              <li key={card.cardId} className={styles.cardRow}>
                <span className={styles.cardRank}>{index + 1}</span>
                <span className={styles.cardName}>{cardName(card.cardId)}</span>
                <span className={styles.cardStrip} style={{ backgroundImage: `url("${cardIllustrationThumbUrl(card.cardId)}")` }} aria-hidden />
                <span className={styles.cardCount}>x{card.quantity}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
