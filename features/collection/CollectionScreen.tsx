"use client";

import { useCallback, useMemo, useState } from "react";
import { CORE_SET, type CardType } from "@/game";
import { compareCards, normalizeSearch, type SortMode } from "@/features/collection/cardFilters";
import { useDebouncedValue } from "@/features/collection/useDebouncedValue";
import { CardGrid } from "@/features/collection/CardGrid";
import { PaperSurface } from "@/features/shell/PaperSurface";
import { ScreenHeader } from "@/features/shell/ScreenHeader";
import { ScreenShell } from "@/features/shell/ScreenShell";
import { SearchLine } from "@/features/shell/SearchLine";
import { SortControl } from "@/features/shell/SortControl";
import { TypeFilterRow } from "@/features/shell/TypeFilterRow";
import { UtilityBar } from "@/features/shell/UtilityBar";
import shell from "@/features/shell/ScreenShell.module.css";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { playButtonClick } from "@/lib/sound";
import Link from "next/link";

/** Catalogue complet — utilisé quand personne n'est connecté : pas encore de compte, mais on doit quand même pouvoir feuilleter toutes les cartes ("pour l'instant"). */
const ALL_CARD_IDS = CORE_SET.map((def) => def.id);

interface CollectionScreenProps {
  isSignedIn: boolean;
  /** Cartes possédées par le joueur connecté (`player_cards.card_id`, quantité > 0) — la grille n'affiche que celles-ci. Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
}

/**
 * Écran Collection — monté sur la coquille partagée (`features/shell`) :
 * header/panorama, surface de papier, barre utilitaire. Seule la grille de
 * cartes et son chargement progressif lui appartiennent en propre.
 *
 * Les cartes sont la priorité visuelle de l'écran : le décor qui les
 * entoure est délibérément discret (aucun cadre, un papier désaturé, des
 * contrôles sans boîte), et elles sont les seuls objets autorisés à porter
 * du relief et une ombre portée.
 */
export function CollectionScreen({ isSignedIn, ownedCardIds }: CollectionScreenProps) {
  const ownedSet = useMemo(() => new Set(isSignedIn ? ownedCardIds : ALL_CARD_IDS), [isSignedIn, ownedCardIds]);

  const [activeType, setActiveType] = useState<CardType | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  // Le champ de recherche reste réactif à chaque frappe ; seul le filtrage réel (potentiellement coûteux
  // sur un grand catalogue) attend une pause de frappe avant de se recalculer.
  const debouncedSearch = useDebouncedValue(search, 200);

  const filteredCards = useMemo(() => {
    const query = normalizeSearch(debouncedSearch.trim());
    return CORE_SET.filter((def) => {
      if (!ownedSet.has(def.id)) return false;
      if (activeType && def.type !== activeType) return false;
      if (query && !normalizeSearch(def.name).includes(query)) return false;
      return true;
    }).sort((a, b) => compareCards(a, b, sort));
  }, [ownedSet, activeType, debouncedSearch, sort]);

  // La navigation tourne en boucle sur la SÉLECTION COURANTE (filtre +
  // recherche + tri), pas sur le catalogue entier : les flèches suivent ce
  // que le joueur a sous les yeux.
  const showRelative = useCallback(
    (delta: number) => {
      setDetailCardId((currentId) => {
        if (!currentId || filteredCards.length === 0) return currentId;
        const index = filteredCards.findIndex((def) => def.id === currentId);
        if (index === -1) return currentId;
        const next = filteredCards[(index + delta + filteredCards.length) % filteredCards.length];
        return next ? next.id : currentId;
      });
    },
    [filteredCards]
  );

  return (
    <ScreenShell>
      <ScreenHeader active="collection" />

      <PaperSurface>
        <SortControl value={sort} onChange={setSort} />
        <CardGrid
          cards={filteredCards}
          onCardClick={setDetailCardId}
          // Ce que possède le joueur, PAS ce que le filtre laisse passer :
          // `filteredCards.length > 0` valait toujours `false` là où la grille
          // est vide, et une recherche sans résultat affichait donc le message
          // "tu ne possèdes encore aucune carte" à un joueur qui en a.
          hasAnyCards={ownedSet.size > 0}
        />
      </PaperSurface>

      <UtilityBar
        left={
          <Link href="/decks/nouveau" className={shell.primaryAction} onClick={() => playButtonClick()}>
            <span className={shell.plus} aria-hidden>
              +
            </span>
            Créer un deck
          </Link>
        }
        center={<TypeFilterRow activeType={activeType} onChange={setActiveType} />}
        right={<SearchLine value={search} onChange={setSearch} placeholder="Rechercher une carte…" label="Rechercher une carte" />}
      />

      {detailCardId && (
        <CardDetailModal
          cardId={detailCardId}
          onClose={() => setDetailCardId(null)}
          // Pas de flèches quand la sélection ne contient qu'une carte.
          onPrevious={filteredCards.length > 1 ? () => showRelative(-1) : undefined}
          onNext={filteredCards.length > 1 ? () => showRelative(1) : undefined}
          onShowCard={setDetailCardId}
        />
      )}

    </ScreenShell>
  );
}
