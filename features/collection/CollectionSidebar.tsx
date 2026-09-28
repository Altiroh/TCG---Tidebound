"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { isAbyssalVariant, type CardDefinition } from "@/game";
import { useCardShelf } from "@/features/collection/shelf/CardShelfProvider";
import { FAVORITES_FILTER, notebookFilter } from "@/features/collection/shelf/shelf";
import { BOOSTER_EXTENSIONS, boostersContaining, rarityForCardId } from "@/game/boosters";
import type { CardRarity } from "@/game/boosters/types";
import { CARD_RARITY_LABELS, CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { TYPE_FILTERS } from "@/features/collection/cardFilters";
import {
  COST_BUCKETS,
  COST_OVERFLOW_BUCKET,
  RARITY_FILTERS,
  countMatching,
  hasActiveFilters,
  type CollectionFilterState,
  type OwnershipFilter,
  type VariantFilter,
} from "@/features/collection/collectionFilters";
import styles from "@/features/collection/CardBrowser.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

const VARIANTS: Array<{ value: VariantFilter; label: string; dotClassName?: string }> = [
  { value: "all", label: "Toutes" },
  { value: "standard", label: "Standard", dotClassName: styles.dotStandard },
  { value: "abyssal", label: "Abyssal", dotClassName: styles.dotAbyssal },
];

const OWNERSHIPS: Array<{ value: OwnershipFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "owned", label: "Possédées" },
  { value: "missing", label: "Manquantes" },
];

interface CollectionSidebarProps {
  filters: CollectionFilterState;
  onChange: (patch: Partial<CollectionFilterState>) => void;
  onReset: () => void;
  owned: ReadonlySet<string>;
  /** La possession n'a de sens que pour un compte connecté — sinon la section entière disparaît. */
  showOwnership: boolean;
  /** Le Deck Builder n'a pas à proposer d'en créer un autre depuis sa colonne de filtres. Défaut : `true`. */
  showCreateDeck?: boolean;
  /** Cartes du favori ou du carnet choisi (`useCardBrowser`) — les compteurs des autres axes en tiennent compte. */
  shelfCards?: ReadonlySet<string> | null;
  /**
   * `collection` (défaut) : TOUS les axes, carnets en tête, Raison en bas.
   * `editeur` : la maquette de l'Éditeur (26/09/2026) — pas de filtre de
   * Raison, « Favoris & carnets » en bas.
   */
  order?: "collection" | "editeur";
}

/** Couleur de chaque gemme de rareté — celles du récapitulatif de boosters. */
const RARITY_GEM_COLORS: Record<CardRarity, string> = {
  common: "#aeb8c2",
  uncommon: "#3fbf6a",
  rare: "#2f9fe0",
  epic: "#9b5cf0",
  legendary: "#f2b634",
  abyssal: "#c9a2ff",
};

/** Une gemme taillée, de la couleur de sa rareté. */
function RarityGem({ rarity }: { rarity: CardRarity }) {
  const color = RARITY_GEM_COLORS[rarity];
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
      <path d="M12 2.5l7.5 5.2-2.3 11.3L12 21.5l-5.2-2.5L4.5 7.7z" fill={color} stroke="rgba(30,18,8,0.75)" strokeWidth={1.1} strokeLinejoin="round" />
      <path d="M12 2.5l-3 6.2 3 12.8 3-12.8zM4.5 7.7l4.5 1 6 0 4.5-1" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M9 8.7l3-6.2 3 6.2z" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
}

/** Une ligne de filtre : libellé à gauche, effectif à droite. */
function FilterRow({
  label,
  count,
  active,
  onClick,
  dotClassName,
  icon,
  glyph,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  dotClassName?: string;
  icon?: string;
  /** Petit pictogramme dessiné (cœur des favoris, carnet). */
  glyph?: ReactNode;
}) {
  const mark = (
    <>
      {dotClassName && <span className={`${styles.dot} ${dotClassName}`} aria-hidden />}
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element -- icône locale de type, taille fixe
        <img src={icon} alt="" className={styles.filterIcon} />
      )}
      {glyph && (
        <span className={styles.filterGlyph} aria-hidden>
          {glyph}
        </span>
      )}
      {!dotClassName && !icon && !glyph && <CompassGlyph />}
    </>
  );
  return (
    <button
      type="button"
      className={`${styles.filterRow} ${active ? styles.filterRowActive : ""}`}
      aria-pressed={active}
      onClick={() => {
        playButtonClick();
        onClick();
      }}
    >
      {/* La case : ce qui est coché se lit dans la colonne avant même le
          libellé — une liste de filtres, pas une liste de liens. */}
      <span className={styles.filterCheck} aria-hidden />
      {/* L'icône, la pastille ou le pictogramme, posés dans un MÉDAILLON de
          laiton en tête de plaque (une ligne = un objet, pas une case à
          cocher) ; sans marque propre, une rose des vents. */}
      <span className={styles.filterMedallion} aria-hidden>
        {mark}
      </span>
      <span className={styles.filterLabel}>{label}</span>
      {count !== undefined && <span className={styles.filterCount}>{count}</span>}
    </button>
  );
}

/**
 * Au-delà de ce nombre de lignes, une section défile SEULE (hauteur bornée
 * à ce même nombre de lignes) au lieu d'allonger la colonne. C'est ce qui
 * permet à la colonne entière de ne jamais défiler : toutes les sections
 * restent visibles, seule celle qui déborde se parcourt.
 */
const MAX_ROWS_BEFORE_SCROLL = 4;

/**
 * Les lignes d'une section. Au-delà de `MAX_ROWS_BEFORE_SCROLL`, elles
 * défilent dans leur propre boîte (`data-scroll`), bornée par la CSS à la
 * hauteur de `MAX_ROWS_BEFORE_SCROLL` lignes — un demi-rang reste visible
 * en bas, ce qui signale qu'il y a la suite.
 */
function FilterList({ rowCount, children }: { rowCount: number; children: ReactNode }) {
  const scrolls = rowCount > MAX_ROWS_BEFORE_SCROLL;
  return (
    <div className={styles.filterList} data-scroll={scrolls ? "true" : "false"}>
      {children}
    </div>
  );
}

/** Une rose des vents à quatre pointes : la marque par défaut d'un médaillon. */
function CompassGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="rgba(0,0,0,0.45)" />
    </svg>
  );
}

/** Le cœur des favoris, dessiné (même tracé que `FavoriteToggle`). */
export function HeartGlyph({ filled = true }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.4 0 5.7 3.3 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Un carnet, dessiné : couverture et reliure. */
export function NotebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <rect x="5" y="3.5" width="14" height="17" rx="1.6" stroke="currentColor" strokeWidth={1.7} />
      <path d="M8.5 3.5v17M11.5 8h4.5M11.5 11.5h4.5" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
    </svg>
  );
}

/**
 * FAVORIS & CARNETS — l'axe du joueur lui-même, en tête de colonne : ce
 * qu'il aime et ce qu'il a rangé (`features/collection/shelf/`). N'apparaît
 * que s'il a une étagère (connecté, dans un écran qui la fournit).
 *
 * Un seul choix à la fois : tout le catalogue, les favoris, ou UN carnet —
 * comme ouvrir un tableau Pinterest. Le mur des carnets les montre tous.
 */
function ShelfSection({
  filters,
  onChange,
  countFor,
}: {
  filters: CollectionFilterState;
  onChange: (patch: Partial<CollectionFilterState>) => void;
  countFor: (ignore: keyof CollectionFilterState, extra: (def: CardDefinition) => boolean) => number;
}) {
  const shelf = useCardShelf();
  if (!shelf?.available) return null;
  const favorites = new Set(shelf.shelf.favorites);
  const notebooks = shelf.shelf.notebooks;
  return (
    <section className={styles.filterSection}>
      <h2 className={styles.sectionTitle}>
        Favoris &amp; carnets
        <Link href="/collection/carnets" className={styles.sectionLink} onClick={() => playButtonClick()}>
          Mur des carnets
        </Link>
      </h2>
      <FilterList rowCount={notebooks.length + 2}>
        <FilterRow label="Tout le catalogue" active={filters.shelf === null} count={countFor("shelf", () => true)} onClick={() => onChange({ shelf: null })} />
        <FilterRow
          label="Favoris"
          glyph={<HeartGlyph />}
          active={filters.shelf === FAVORITES_FILTER}
          count={countFor("shelf", (def) => favorites.has(def.id))}
          onClick={() => onChange({ shelf: filters.shelf === FAVORITES_FILTER ? null : FAVORITES_FILTER })}
        />
        {notebooks.map((notebook) => {
          const filter = notebookFilter(notebook.id);
          const cards = new Set(notebook.cardIds);
          return (
            <FilterRow
              key={notebook.id}
              label={notebook.name}
              glyph={<NotebookGlyph />}
              active={filters.shelf === filter}
              count={countFor("shelf", (def) => cards.has(def.id))}
              onClick={() => onChange({ shelf: filters.shelf === filter ? null : filter })}
            />
          );
        })}
      </FilterList>
    </section>
  );
}

/**
 * Colonne de filtres de la Collection.
 *
 * Cinq axes : Variante, Type, Statut de collection, Raison, et Extension
 * depuis le 22/09/2026. Aucun filtre d'ARCHÉTYPE — l'appartenance à une
 * famille est une donnée de moteur que le joueur n'a jamais à voir
 * (`game/cards/archetypes.ts`). Une extension, elle, est un PRODUIT : le
 * joueur l'a achetée, il a le droit de savoir ce qu'il y reste à trouver.
 *
 * Chaque effectif est calculé en appliquant tous les autres axes mais pas
 * le sien (`countMatching`) : le nombre affiché en face d'une ligne est
 * donc exactement ce qu'on obtiendra en cliquant dessus, et il tombe à 0
 * quand la combinaison ne donne rien.
 */
export function CollectionSidebar({
  filters,
  onChange,
  onReset,
  owned,
  showOwnership,
  showCreateDeck = true,
  shelfCards = null,
  order = "collection",
}: CollectionSidebarProps) {
  /** Ordre et axes de la maquette de l'Éditeur : carnets en bas, pas de Raison. */
  const editorOrder = order === "editeur";
  const canReset = hasActiveFilters(filters);
  const countFor = (ignore: keyof CollectionFilterState, extra: Parameters<typeof countMatching>[3]) =>
    countMatching(filters, owned, ignore, extra, shelfCards);

  return (
    <div className={styles.sidebarInner}>
      <div className={styles.sidebarHead}>
        <span className={styles.sidebarTitle}>
          <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
          Filtres
        </span>
        {/* Toujours présent, éteint quand il n'y a rien à effacer : un lien
            qui apparaît et disparaît fait sauter la mise en page. */}
        <button type="button" className={styles.resetLink} onClick={onReset} disabled={!canReset}>
          Réinitialiser
        </button>
      </div>

      {!editorOrder && <ShelfSection filters={filters} onChange={onChange} countFor={countFor} />}

      <section className={styles.filterSection}>
        <h2 className={styles.sectionTitle}>Variante</h2>
        <FilterList rowCount={VARIANTS.length}>
          {VARIANTS.map((variant) => (
            <FilterRow
              key={variant.value}
              label={variant.label}
              dotClassName={variant.dotClassName}
              active={filters.variant === variant.value}
              count={countFor("variant", (def) =>
                variant.value === "all"
                  ? true
                  : variant.value === "abyssal"
                    ? isAbyssalVariant(def)
                    : !isAbyssalVariant(def)
              )}
              onClick={() => onChange({ variant: variant.value })}
            />
          ))}
        </FilterList>
      </section>

      <section className={styles.filterSection}>
        <h2 className={styles.sectionTitle}>Type</h2>
        <FilterList rowCount={TYPE_FILTERS.length + 1}>
          <FilterRow
            label="Tous"
            active={filters.type === null}
            count={countFor("type", () => true)}
            onClick={() => onChange({ type: null })}
          />
          {TYPE_FILTERS.map((type) => (
            <FilterRow
              key={type}
              label={CARD_TYPE_LABELS[type]}
              icon={`/assets/cards/icons/type-${type}.webp`}
              active={filters.type === type}
              count={countFor("type", (def) => def.type === type)}
              onClick={() => onChange({ type: filters.type === type ? null : type })}
            />
          ))}
        </FilterList>
      </section>

      {showOwnership && (
        <section className={styles.filterSection}>
          <h2 className={styles.sectionTitle}>Statut de collection</h2>
          <FilterList rowCount={OWNERSHIPS.length}>
            {OWNERSHIPS.map((status) => (
              <FilterRow
                key={status.value}
                label={status.label}
                active={filters.ownership === status.value}
                count={countFor("ownership", (def) =>
                  status.value === "all" ? true : status.value === "owned" ? owned.has(def.id) : !owned.has(def.id)
                )}
                onClick={() => onChange({ ownership: status.value })}
              />
            ))}
          </FilterList>
        </section>
      )}

      <section className={styles.filterSection}>
        <h2 className={styles.sectionTitle}>Extension</h2>
        <FilterList rowCount={BOOSTER_EXTENSIONS.length + 1}>
          <FilterRow
            label="Toutes"
            active={filters.boosters.length === 0}
            count={countFor("boosters", () => true)}
            onClick={() => onChange({ boosters: [] })}
          />
          {BOOSTER_EXTENSIONS.map((extension) => {
            const active = filters.boosters.includes(extension.boosterId);
            return (
              <FilterRow
                key={extension.boosterId}
                label={extension.name}
                active={active}
                // Le compteur ignore l'axe Extension : il annonce ce que
                // CE booster donnerait, pas ce que la sélection courante
                // laisse passer — sinon cocher un sachet mettrait tous les
                // autres à zéro.
                count={countFor("boosters", (def) => boostersContaining(def.id).includes(extension.boosterId))}
                onClick={() =>
                  onChange({
                    boosters: active
                      ? filters.boosters.filter((id) => id !== extension.boosterId)
                      : [...filters.boosters, extension.boosterId],
                  })
                }
              />
            );
          })}
        </FilterList>
      </section>

      <section className={styles.filterSection}>
        <h2 className={styles.sectionTitle}>Rareté</h2>
        <FilterList rowCount={1}>
          <FilterRow
            label="Toutes"
            active={filters.rarities.length === 0}
            count={countFor("rarities", () => true)}
            onClick={() => onChange({ rarities: [] })}
          />
        </FilterList>
        <div className={styles.rarityRow}>
          {RARITY_FILTERS.map((rarity) => {
            const active = filters.rarities.includes(rarity);
            return (
              <button
                key={rarity}
                type="button"
                aria-pressed={active}
                aria-label={CARD_RARITY_LABELS[rarity]}
                title={`${CARD_RARITY_LABELS[rarity]} (${countFor("rarities", (def) => rarityForCardId(def.id) === rarity)})`}
                className={`${styles.rarityGem} ${active ? styles.rarityGemActive : ""}`}
                onClick={() => {
                  playButtonClick();
                  // Multi-sélection : chaque palier s'ajoute ou se retire.
                  onChange({ rarities: active ? filters.rarities.filter((r) => r !== rarity) : [...filters.rarities, rarity] });
                }}
              >
                <RarityGem rarity={rarity} />
              </button>
            );
          })}
        </div>
      </section>

      {editorOrder && <ShelfSection filters={filters} onChange={onChange} countFor={countFor} />}

      {!editorOrder && (
      <section className={styles.filterSection}>
        <h2 className={styles.sectionTitle}>Raison</h2>
        <div className={styles.costRow}>
          {COST_BUCKETS.map((cost) => {
            const active = filters.costs.includes(cost);
            return (
              <button
                key={cost}
                type="button"
                aria-pressed={active}
                aria-label={`Raison ${cost === COST_OVERFLOW_BUCKET ? `${cost} ou plus` : cost}`}
                className={`${styles.costChip} ${active ? styles.costChipActive : ""}`}
                onClick={() => {
                  playButtonClick();
                  // Multi-sélection : chaque palier s'ajoute ou se retire.
                  onChange({
                    costs: active ? filters.costs.filter((c) => c !== cost) : [...filters.costs, cost],
                  });
                }}
              >
                {cost === COST_OVERFLOW_BUCKET ? `${cost}+` : cost}
              </button>
            );
          })}
        </div>
      </section>
      )}

      {showCreateDeck && (
        <Link href="/decks/nouveau" className={`${game.primary} ${styles.createDeck}`} onClick={() => playButtonClick()}>
          <span aria-hidden>+</span> Créer un deck
        </Link>
      )}
    </div>
  );
}
