"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CardDefinition, CardInstance } from "@/game";
import styles from "@/features/collection/CollectionScreen.module.css";
import { CardTile } from "@/features/match/CardTile";

/** Nombre de cartes montées par lot — ajusté pour couvrir large sans jamais monter la collection entière d'un coup. */
const BATCH_SIZE = 24;
/** Nombre de cartes (en tête du lot courant) qui reçoivent un léger décalage d'apparition — jamais toute la grille. */
const STAGGER_COUNT = 12;
/** Délai cosmétique avant d'ajouter le lot suivant — juste assez pour que l'indicateur de chargement soit perceptible. */
const LOAD_DELAY_MS = 180;

/** Instance factice, pour afficher une carte hors de toute partie (stats de base, aucun état vivant). */
function displayInstance(cardId: string): CardInstance {
  return {
    instanceId: cardId,
    cardId,
    ownerId: "collection",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}

interface CardGridProps {
  cards: CardDefinition[];
  onCardClick: (cardId: string) => void;
  hasAnyCards: boolean;
}

/**
 * Grille scrollable — seule zone qui défile (le reste de l'écran est fixe).
 * Ne monte jamais `cards` en entier : un lot de `BATCH_SIZE` au départ, puis
 * `BATCH_SIZE` de plus à chaque fois que le sentinel en bas de la grille
 * devient visible (`IntersectionObserver`, pas de listener `scroll`). Le
 * padding-top laisse la place au `SortControl` ancré au-dessus.
 *
 * `cards` change de référence exactement quand le filtre/la recherche/le tri
 * changent (`useMemo` dans `CollectionScreen`) — c'est ce changement de
 * référence qui déclenche le retour en haut + la réinitialisation du lot,
 * sans plomberie supplémentaire côté parent.
 */
export function CardGrid({ cards, onCardClick, hasAnyCards }: CardGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Change à chaque reset (nouveau filtre/recherche/tri) — préfixé sur les clés des cellules pour forcer leur
  // remontage et rejouer la microanimation d'apparition, plutôt que de la déclencher sur des cellules réutilisées.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
    setIsLoadingMore(false);
    setGeneration((g) => g + 1);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
    scrollRef.current?.scrollTo({ top: 0 });
  }, [cards]);

  useEffect(() => () => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
  }, []);

  const hasMore = visibleCount < cards.length;
  const visibleCards = useMemo(() => cards.slice(0, visibleCount), [cards, visibleCount]);

  // Réobserve à chaque lot chargé (`visibleCount` en dépendance, pas seulement `hasMore`) : démarrer une
  // nouvelle observation redonne toujours un état initial frais, même si le sentinel restait déjà dans la
  // marge de 400px après le lot précédent (pas de nouvelle transition à détecter dans ce cas — sans ce
  // réarmement, un lot qui ne repousse pas le sentinel hors de la marge bloquerait le suivant).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setIsLoadingMore((alreadyLoading) => {
          if (alreadyLoading) return alreadyLoading;
          loadTimeoutRef.current = setTimeout(() => {
            setVisibleCount((count) => Math.min(count + BATCH_SIZE, cards.length));
            setIsLoadingMore(false);
          }, LOAD_DELAY_MS);
          return true;
        });
      },
      { root, rootMargin: "400px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, cards.length, visibleCount]);

  return (
    <div ref={scrollRef} className={styles.cardGridScroll}>
      {cards.length === 0 ? (
        <div className={styles.emptyState}>
          <p>
            {hasAnyCards
              ? "Aucune carte ne correspond à ces filtres."
              : "Tu ne possèdes encore aucune carte : joue avec un deck préconstruit en attendant d'ouvrir des boosters."}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.cardGrid}>
            {visibleCards.map((def, index) => (
              <div
                key={`${generation}:${def.id}`}
                className={styles.cardCell}
                style={index < STAGGER_COUNT ? { animationDelay: `${index * 15}ms` } : undefined}
              >
                <CardTile
                  instance={displayInstance(def.id)}
                  tideState="calme"
                  widthClassName="w-full"
                  scaleOnHover={false}
                  liftOnHover
                  onClick={() => onCardClick(def.id)}
                />
              </div>
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} className={styles.loadMoreSentinel} aria-hidden>
              <span className={`${styles.loadDot} ${isLoadingMore ? styles.loadDotActive : ""}`} />
              <span className={`${styles.loadDot} ${isLoadingMore ? styles.loadDotActive : ""}`} />
              <span className={`${styles.loadDot} ${isLoadingMore ? styles.loadDotActive : ""}`} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
