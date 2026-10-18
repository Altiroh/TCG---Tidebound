import { CARD_FINISHES, CARD_FINISH_DESCRIPTIONS, CARD_FINISH_LABELS, type CardFinish } from "@/game/cosmetics/finishes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CARD_ARTWORK_DESCRIPTIONS, CARD_ARTWORK_LABELS, artworksOf, type CardArtwork } from "@/game/cosmetics/artworks";
import { editionLabel, isClassicEdition, type CardEdition } from "@/game/cosmetics/editions";
import { setCardDisplayedEdition } from "@/features/collection/editionActions";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

/**
 * FINITIONS de la carte (16/10/2026) : les six, de la Classique à la
 * Star Foil. Toucher une finition la montre sur la carte de la fiche —
 * possédée ou non, c'est un aperçu ; celles que le joueur a tirées portent
 * leur marque. Les cinq rares ne sortent que des boosters, très rarement.
 */
export function CardDetailFinishes({
  shown,
  owned,
  onShow,
}: {
  shown: CardFinish;
  /** Finitions rares possédées ; `undefined` : possession inconnue (visiteur). */
  owned?: readonly CardFinish[];
  onShow: (finish: CardFinish) => void;
}) {
  return (
    <section aria-label="Finitions">
      <span className={styles.sectionLabel}>Finitions</span>
      <div className={styles.finishes} role="radiogroup" aria-label="Aperçu de la finition">
        {CARD_FINISHES.map((finish) => {
          const possedee = finish === "classique" || owned?.includes(finish);
          return (
            <button
              key={finish}
              type="button"
              role="radio"
              aria-checked={shown === finish}
              className={styles.finishChip}
              data-finish={finish}
              data-owned={owned && possedee ? "" : undefined}
              title={`${CARD_FINISH_DESCRIPTIONS[finish]}${owned && finish !== "classique" ? (possedee ? " — possédée" : " — aperçu, jamais tirée") : ""}`}
              onClick={() => onShow(finish)}
            >
              {CARD_FINISH_LABELS[finish]}
              {owned && finish !== "classique" && possedee && <span aria-label="possédée"> ✦</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * ILLUSTRATIONS de la carte (Collection visuelle V2, 18/10/2026) : Classique,
 * et Styled / Styled Full-Art quand la carte en a. Même principe que les
 * finitions : toucher une illustration la montre sur la carte de la fiche,
 * en aperçu. Rien pour une carte qui n'a que sa Classique.
 */
export function CardDetailArtworks({
  cardId,
  shown,
  owned,
  onShow,
}: {
  cardId: string;
  shown: CardArtwork;
  /** Éditions rares possédées ; `undefined` : possession inconnue (visiteur). */
  owned?: readonly CardEdition[];
  onShow: (artwork: CardArtwork) => void;
}) {
  const artworks = artworksOf(cardId);
  if (artworks.length < 2) return null;
  return (
    <section aria-label="Illustrations">
      <span className={styles.sectionLabel}>Illustrations</span>
      <div className={styles.finishes} role="radiogroup" aria-label="Aperçu de l'illustration">
        {artworks.map((artwork) => {
          const possedee = artwork === "classique" || owned?.some((e) => e.artwork === artwork);
          return (
            <button
              key={artwork}
              type="button"
              role="radio"
              aria-checked={shown === artwork}
              className={styles.finishChip}
              data-artwork={artwork}
              data-owned={owned && possedee ? "" : undefined}
              title={`${CARD_ARTWORK_DESCRIPTIONS[artwork]}${owned && artwork !== "classique" ? (possedee ? " — possédée" : " — aperçu, jamais tirée") : ""}`}
              onClick={() => onShow(artwork)}
            >
              {CARD_ARTWORK_LABELS[artwork]}
              {owned && artwork !== "classique" && possedee && <span aria-label="possédée"> ✦</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * ÉDITION MONTRÉE EN PARTIE (Collection visuelle V2) : l'édition affichée
 * dans la fiche, si le joueur la possède, devient celle que ses deux camps
 * voient sur la table — Full-Art comprise. Une édition seulement aperçue ne
 * se choisit pas : le bouton le dit au lieu de disparaître.
 */
export function CardDetailDisplayChoice({
  cardId,
  shown,
  owned,
  displayed,
}: {
  cardId: string;
  shown: CardEdition;
  owned: readonly CardEdition[];
  displayed: CardEdition;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(displayed);
  const [error, setError] = useState<string | null>(null);
  // État « en cours » à la main : sous React 18, `isPending` d'une transition
  // ne couvre pas l'`await` de l'action serveur.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setCurrent(displayed);
    setError(null);
  }, [cardId, displayed]);

  const same = (a: CardEdition, b: CardEdition) => a.artwork === b.artwork && a.finish === b.finish;
  const possedee = isClassicEdition(shown) || owned.some((e) => same(e, shown));
  const affichee = same(current, shown);

  const choose = async () => {
    setError(null);
    setPending(true);
    try {
      const result = await setCardDisplayedEdition(cardId, shown);
      if (!result.ok) {
        setError(result.error ?? "Choix impossible.");
        return;
      }
      setCurrent(shown);
      router.refresh();
    } catch {
      setError("Serveur injoignable — réessaie dans un instant.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-label="Édition en partie">
      <span className={styles.sectionLabel}>En partie</span>
      <p className={styles.displayChoice}>
        Montrée : <strong>{editionLabel(current)}</strong>
      </p>
      {!affichee && (
        <button
          type="button"
          className={styles.finishChip}
          data-display-choice
          disabled={!possedee || pending}
          title={possedee ? "Les deux camps verront cette édition sur la table" : "Seule une édition possédée peut être montrée en partie"}
          onClick={() => void choose()}
        >
          {pending ? "…" : possedee ? `Montrer « ${editionLabel(shown)} »` : "Édition non possédée"}
        </button>
      )}
      {error && (
        <p className={styles.displayChoice} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
