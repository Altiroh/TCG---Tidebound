"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { isAbyssalVariant } from "@/game";
import { BOOSTER_EXTENSIONS, boostersContaining } from "@/game/boosters";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { TYPE_FILTERS } from "@/features/collection/cardFilters";
import {
  COST_BUCKETS,
  COST_OVERFLOW_BUCKET,
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
}

/** Une ligne de filtre : libellé à gauche, effectif à droite. */
function FilterRow({
  label,
  count,
  active,
  onClick,
  dotClassName,
  icon,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  dotClassName?: string;
  icon?: string;
}) {
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
      {dotClassName && <span className={`${styles.dot} ${dotClassName}`} aria-hidden />}
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element -- icône locale de type, taille fixe
        <img src={icon} alt="" className={styles.filterIcon} />
      )}
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
}: CollectionSidebarProps) {
  const canReset = hasActiveFilters(filters);
  const countFor = (ignore: keyof CollectionFilterState, extra: Parameters<typeof countMatching>[3]) =>
    countMatching(filters, owned, ignore, extra);

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

      {showCreateDeck && (
        <Link href="/decks/nouveau" className={`${game.primary} ${styles.createDeck}`} onClick={() => playButtonClick()}>
          <span aria-hidden>+</span> Créer un deck
        </Link>
      )}
    </div>
  );
}
