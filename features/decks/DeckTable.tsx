"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RULES, ownershipLabel } from "@/game";
import { cardIllustrationThumbUrl } from "@/features/decks/nameplateArt";
import { cardName, sortedCards, styleIdOf, type BrowserDeck } from "@/features/decks/deckEntries";
import { DeckStyleIcon } from "@/features/decks/DeckStyleIcon";
import { DECK_SORTS, type DeckSortId } from "@/features/decks/deckFilters";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { CandleToy } from "@/features/shell/CandleToy";
import { DifficultyStars, PreconToken, StarIcon } from "@/features/shell/GameIcons";
import { useImagesReady } from "@/features/shell/useImagesReady";
import styles from "@/features/decks/DeckTable.module.css";
import { playButtonClick } from "@/lib/sound";

const ASSETS = "/assets/decks/liste";

/** Les onglets de la table ; `trash` (« Récemment supprimés ») n'apparaît que s'il a de quoi montrer. */
export type TableTab = "mine" | "precon" | "favorites" | "recent" | "trash";

const TABS: Array<{ id: Exclude<TableTab, "trash">; label: string; icon: string }> = [
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
  onCopy?: (deck: BrowserDeck) => void;
}

interface DeckTableProps extends DeckTableActions {
  tab: TableTab;
  onTab: (tab: TableTab) => void;
  /** Decks dans la corbeille : l'onglet « Récemment supprimés » et son compte. `null` : pas d'onglet. */
  trashCount: number | null;
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
  emptyLabel: string;
}



/**
 * L'icône de la corbeille, dessinée comme les icônes peintes des autres
 * onglets : un médaillon de laiton riveté, un fond de parchemin, et la
 * poubelle à l'encre brune.
 */
function TrashIcon() {
  return (
    <svg className={styles.tabIcon} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <radialGradient id="corbeille-laiton" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#f3d27e" />
          <stop offset="0.5" stopColor="#b98a35" />
          <stop offset="1" stopColor="#5c3e17" />
        </radialGradient>
        <radialGradient id="corbeille-papier" cx="45%" cy="40%" r="70%">
          <stop offset="0" stopColor="#f4e6c6" />
          <stop offset="1" stopColor="#cdb487" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22.5" fill="url(#corbeille-laiton)" stroke="#3b2812" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="16.5" fill="url(#corbeille-papier)" stroke="#4a3216" strokeWidth="1.4" />
      {[
        [24, 4.6],
        [43.4, 24],
        [24, 43.4],
        [4.6, 24],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2" fill="#e7c472" stroke="#3b2812" strokeWidth="0.8" />
      ))}
      <g fill="none" stroke="#3a2616" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15.5 17.5h17M21 17.5v-2.2h6v2.2" />
        <path d="M17.5 17.5l1.3 14.2h10.4l1.3-14.2" fill="#8a6a3e" fillOpacity="0.35" />
        <path d="M21.6 21v7.4M26.4 21v7.4" strokeWidth="1.7" />
      </g>
    </svg>
  );
}

/**
 * LA TABLE DES DECKS — nouvelle liste des decks (maquette du 25/09/2026).
 *
 * Tout est posé sur le livre de bord (`fond.webp`) : les onglets sur une
 * bande de parchemin, le tri et la recherche à droite, les decks en PILES
 * inclinées comme posées à la main, et la fiche du deck choisi dans son
 * cadre de bois. `DecksScreen` fournit les decks triés et cherchés, et
 * toutes les actions : la table ne fait que les présenter.
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
  // Les piles se POSENT une à une (`deckPose`, DeckTable.module.css), mais
  // pas avant que leurs illustrations soient décodées : sinon le cadre
  // arrive vide et l'image se construit dessus. Une autre main (onglet,
  // page, tri) remonte la liste, et la donne se rejoue ; un simple re-rendu
  // (sélection, favori) ne la rejoue pas.
  const stacksReady = useImagesReady(visible.map((deck) => deck?.artUrl));
  const dealKey = `${props.tab}:${page}:${props.sort}`;

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
        <img className={styles.bottle} src={`${ASSETS}/bouteille.webp`} alt="" draggable={false} />
        {/* eslint-enable @next/next/no-img-element */}
        {/* La bougie se souffle et se rallume (`CandleToy`) ; ses deux
            lueurs, posées sur la table, s'éteignent avec elle. */}
        <CandleToy className={styles.candle} />
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
        <nav className={styles.tabs} role="tablist" aria-label="Rayons" data-count={TABS.length + (props.trashCount !== null ? 1 : 0)}>
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
          {/* La corbeille : un onglet comme les autres, son compte en pastille. */}
          {props.trashCount !== null && (
            <button
              type="button"
              role="tab"
              aria-selected={props.tab === "trash"}
              aria-label={`Récemment supprimés (${props.trashCount})`}
              title="Récemment supprimés"
              className={styles.tab}
              data-active={props.tab === "trash" || undefined}
              onClick={() => {
                playButtonClick();
                props.onTab("trash");
              }}
            >
              <TrashIcon />
              <span className={styles.tabLabel}>Corbeille</span>
              <span className={styles.tabCount} aria-hidden>
                {props.trashCount}
              </span>
            </button>
          )}
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

        {/* ── Les piles ── */}
        <button
          type="button"
          className={`${styles.bigArrow} ${styles.bigArrowLeft}`}
          aria-label="Decks précédents"
          // Les pages BOUCLENT : avant la première, la dernière (retour du 27/09/2026).
          disabled={pages <= 1}
          onClick={() => {
            playButtonClick();
            setPage((value) => (value - 1 + pages) % pages);
          }}
        />
        <ul key={dealKey} className={styles.stacks} role="listbox" aria-label="Decks" data-pending={!stacksReady || undefined}>
          {visible.length === 0 && <li className={styles.empty}>{props.emptyLabel}</li>}
          {visible.map((deck, index) => {
            const tilt = TILTS[index % TILTS.length]!;
            const lift = LIFTS[index % LIFTS.length]!;
            if (!deck) {
              return (
                <li key="nouveau" className={styles.slot} style={{ ["--tilt" as string]: `${tilt}deg`, ["--lift" as string]: `${lift}%`, ["--i" as string]: index }}>
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
              <li key={deck.id} className={styles.slot} style={{ ["--tilt" as string]: `${tilt}deg`, ["--lift" as string]: `${lift}%`, ["--i" as string]: index }}>
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
                      <StarIcon filled />
                    </span>
                  )}
                  {/* Le STYLE du deck, sur le fanion de Raison des tuiles de plateau, en haut à droite. */}
                  {styleIdOf(deck) && (
                    <span className={styles.stackPennant}>
                      <DeckStyleIcon styleId={styleIdOf(deck)!} labelled className={styles.stackPennantIcon} />
                    </span>
                  )}
                  {selected && <span className={styles.selectedChip}>Sélectionné</span>}
                  <span className={styles.banner}>
                    {/* Au-delà de 16 lettres, le nom passe sur deux lignes plutôt que de rapetisser. */}
                    <span className={styles.bannerName} data-long={deck.name.length > 16 || undefined}>
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
          disabled={pages <= 1}
          onClick={() => {
            playButtonClick();
            setPage((value) => (value + 1) % pages);
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
  // L'illustration de la fiche attend d'être décodée, puis se lève en fondu.
  const artReady = useImagesReady([deck?.artUrl]);

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
      {/* Illustration et contenu sont remontés à chaque deck : l'ancien s'efface, le nouveau se lève (`ficheSwap`). */}
      <span
        key={`art-${deck.id}`}
        className={styles.ficheArt}
        data-pending={!artReady || undefined}
        style={deck.artUrl ? { backgroundImage: `url("${deck.artUrl}")` } : undefined}
      />
      <span className={styles.ficheRope} aria-hidden>
        {/* L'emblème du STYLE, posé sur le sceau de la corde, à gauche du
            nom — lu dans la phrase (« Midrange / Sentinelles… » → midrange).
            Sans style reconnu, un emplacement vide, réservé au futur type
            de deck généré. */}
        {styleIdOf(deck) ? (
          <DeckStyleIcon styleId={styleIdOf(deck)!} className={styles.ficheStyleIcon} />
        ) : (
          <span className={styles.ficheStyleSlot} />
        )}
      </span>
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
        <StarIcon filled={favorite} />
      </button>

      <div key={`body-${deck.id}`} className={styles.ficheBody} data-swap>
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
          {deck.style && <DifficultyStars value={deck.difficulty} className={styles.ficheStars} />}
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
