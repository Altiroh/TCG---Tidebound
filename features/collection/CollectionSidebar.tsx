"use client";

import Link from "next/link";
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
import styles from "@/features/collection/CollectionScreen.module.css";
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
 * Colonne de filtres de la Collection.
 *
 * Quatre axes, et quatre seulement : Variante, Type, Statut de collection,
 * Raison. Aucun filtre d'ARCHÉTYPE — l'appartenance à une famille est une
 * donnée de moteur que le joueur n'a jamais à voir
 * (`game/cards/archetypes.ts`).
 *
 * Chaque effectif est calculé en appliquant tous les autres axes mais pas
 * le sien (`countMatching`) : le nombre affiché en face d'une ligne est
 * donc exactement ce qu'on obtiendra en cliquant dessus, et il tombe à 0
 * quand la combinaison ne donne rien.
 */
export function CollectionSidebar({ filters, onChange, onReset, owned, showOwnership }: CollectionSidebarProps) {
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
        {hasActiveFilters(filters) && (
          <button type="button" className={styles.resetLink} onClick={onReset}>
            Réinitialiser
          </button>
        )}
      </div>

      <section className={styles.filterSection}>
        <h2 className={styles.sectionTitle}>Variante</h2>
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
                  ? def.subtype === "abyssal"
                  : def.subtype !== "abyssal"
            )}
            onClick={() => onChange({ variant: variant.value })}
          />
        ))}
      </section>

      <section className={styles.filterSection}>
        <h2 className={styles.sectionTitle}>Type</h2>
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
            icon={`/assets/cards/icons/TYPE_${type.toUpperCase()}_STANDARD.webp`}
            active={filters.type === type}
            count={countFor("type", (def) => def.type === type)}
            onClick={() => onChange({ type: filters.type === type ? null : type })}
          />
        ))}
      </section>

      {showOwnership && (
        <section className={styles.filterSection}>
          <h2 className={styles.sectionTitle}>Statut de collection</h2>
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
        </section>
      )}

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

      <Link href="/decks/nouveau" className={styles.createDeck} onClick={() => playButtonClick()}>
        <span aria-hidden>+</span> Créer un deck
      </Link>
    </div>
  );
}
