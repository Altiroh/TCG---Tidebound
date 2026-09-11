"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CORE_SET } from "@/game";
import { SegmentedControl } from "@/components/game-ui/SegmentedControl";
import { CardCollectionPanel } from "@/features/collection/CardCollectionPanel";

/** Catalogue complet — utilisé quand personne n'est connecté : pas encore de compte, mais on doit quand même pouvoir feuilleter toutes les cartes ("pour l'instant"). */
const ALL_CARD_IDS = CORE_SET.map((def) => def.id);

interface CollectionScreenProps {
  isSignedIn: boolean;
  /** Cartes possédées par le joueur connecté (`player_cards.card_id`, quantité > 0) — la grille n'affiche que celles-ci. Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
}

/**
 * Écran Collection — première vitrine de la refonte "jeu vidéo premium"
 * (cf. tokens `app/globals.css` + `components/game-ui/*`) : plus de cadre
 * parchemin ni de gros rectangle décoratif, un fond anthracite/bleu pétrole
 * en dégradé qui ramène naturellement l'œil vers la grille de cartes — seul
 * élément qui doit dominer l'écran. La nav est réduite à "Retour" + une
 * bascule Collection/Decks en soulignement, quasi invisible tant qu'on n'y
 * touche pas.
 */
export function CollectionScreen({ isSignedIn, ownedCardIds }: CollectionScreenProps) {
  const router = useRouter();
  return (
    <div
      className="fixed inset-0 flex flex-col gap-6 p-6 sm:p-10"
      style={{ background: "radial-gradient(ellipse at 50% -10%, var(--surface-1) 0%, var(--surface-0) 60%)" }}
    >
      <div className="flex shrink-0 items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Retour
        </Link>
        <SegmentedControl
          value="collection"
          options={[
            { value: "collection", label: "Collection" },
            { value: "decks", label: "Decks" },
          ]}
          onChange={(v) => {
            if (v === "decks") router.push("/decks");
          }}
        />
      </div>

      {/* Sans compte, on peut quand même feuilleter tout le catalogue pour l'instant — seul un compte connecté restreint la grille aux cartes réellement possédées. */}
      <div className="min-h-0 flex-1">
        <CardCollectionPanel ownedCardIds={isSignedIn ? ownedCardIds : ALL_CARD_IDS} mode="browse" />
      </div>
    </div>
  );
}
