"use client";

import { useMemo, useState } from "react";
import { deckProfile, getCardDefinition, isAbyssalVariant, RULES, type DeckStyleId } from "@/game";
import { DeckStyleIcon } from "@/features/decks/DeckStyleIcon";
import { DECK_DESCRIPTION_MAX } from "@/features/decks/constants";
import { deckSizeStatus } from "@/features/decks/deckComposition";
import { nameplateArtUrl, plateArtUrl } from "@/features/decks/nameplateArt";
import styles from "@/features/decks/DeckBuilder.module.css";
import book from "@/features/decks/DeckEditorBook.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckNamePlateProps {
  name: string;
  onNameChange: (name: string) => void;
  /**
   * Résumé libre, affiché sur la fiche du deck à l'écran Jouer. Le RESTE de
   * cette fiche — rôle, difficulté, mécaniques — se déduit des cartes
   * (`deckProfile`) : c'est la seule chose qu'on demande d'écrire, et elle
   * reste facultative.
   */
  description: string;
  onDescriptionChange: (description: string) => void;
  shipId: string;
  /** Contenu du deck — sert d'illustration par défaut, et de choix possibles. */
  cardIds: readonly string[];
  /** Carte choisie explicitement, ou `null` pour laisser le deck décider. */
  artCardId: string | null;
  onPickArt: () => void;
  /**
   * Style choisi par le joueur (« Ma fiche de deck »), ou `null` : le style
   * affiché est alors celui que le jeu lit dans les cartes, recalculé à
   * chaque ajout ou retrait.
   */
  chosenStyleId?: DeckStyleId | null;
  /**
   * `livre` : l'en-tête de la maquette « sur le livre » (26/09/2026) — grande
   * bannière d'illustration, sceau, nom, variantes et statut, effectif,
   * description. `classic` : l'encart compact bleu nuit.
   */
  variant?: "classic" | "livre";
}

/** Variantes présentes dans le deck — un deck vide se lit « Standard ». */
function deckVariants(cardIds: readonly string[]): { standard: boolean; abyssal: boolean } {
  let standard = false;
  let abyssal = false;
  for (const cardId of new Set(cardIds)) {
    try {
      if (isAbyssalVariant(getCardDefinition(cardId))) abyssal = true;
      else standard = true;
    } catch {
      // Carte retirée du catalogue : elle ne dit rien de la variante.
    }
  }
  return { standard: standard || !abyssal, abyssal };
}

const STATUS_LABELS = { valid: "Jouable", over: "Trop de cartes", short: `Minimum ${RULES.DECK_SIZE_MIN}` } as const;

/**
 * ENCART D'IDENTITÉ du deck, en tête du panneau de droite.
 *
 * `classic` : l'illustration à gauche, le nom et son crayon à droite, les
 * variantes en dessous — compact, bleu nuit et liseré cyan ; le nombre de
 * cartes n'y figure pas, la jauge juste en dessous le porte.
 *
 * `livre` : la maquette — l'illustration en bannière (son « + » en change),
 * puis le sceau, le NOM et son crayon, les variantes et le statut
 * (« Jouable »), l'effectif « 40 / 50 cartes », et la description.
 *
 * Toucher l'illustration ouvre le choix d'illustration ; le crayon passe le
 * nom en édition (Entrée ou sortie du champ pour valider, Échap pour annuler).
 */
export function DeckNamePlate({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  shipId,
  cardIds,
  artCardId,
  onPickArt,
  chosenStyleId = null,
  variant = "classic",
}: DeckNamePlateProps) {
  const artUrl = artCardId ? plateArtUrl(artCardId, shipId) : nameplateArtUrl(cardIds, shipId);
  const variants = useMemo(() => deckVariants(cardIds), [cardIds]);
  // Un deck vide n'a pas de style lu : on n'en invente pas (cf. `deckProfile`).
  const styleId = useMemo(() => chosenStyleId ?? deckProfile(cardIds)?.styleId ?? null, [chosenStyleId, cardIds]);
  const [editing, setEditing] = useState(false);
  const [before, setBefore] = useState(name);
  const onBook = variant === "livre";

  const pickArt = () => {
    playButtonClick();
    onPickArt();
  };

  const nameField = editing ? (
    <input
      value={name}
      onChange={(event) => onNameChange(event.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") setEditing(false);
        if (event.key === "Escape") {
          event.stopPropagation();
          onNameChange(before);
          setEditing(false);
        }
      }}
      placeholder="Nom du deck"
      aria-label="Nom du deck"
      className={onBook ? book.headNameInput : styles.idNameInput}
      maxLength={60}
      autoFocus
    />
  ) : (
    <>
      <span className={onBook ? book.headName : styles.idName} title={name || "Deck sans nom"}>
        {name || "Deck sans nom"}
      </span>
      <button
        type="button"
        className={onBook ? book.headPencil : styles.idPencil}
        onClick={() => {
          playButtonClick();
          setBefore(name);
          setEditing(true);
        }}
        title="Renommer le deck"
        aria-label="Renommer le deck"
      >
        <svg viewBox="0 0 24 24" width={onBook ? "100%" : 13} height={onBook ? "100%" : 13} fill="none" aria-hidden>
          <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" />
        </svg>
      </button>
    </>
  );

  const descriptionField = (
    // Une phrase, pas un journal : c'est ce que la fiche montre sous le nom
    // du deck, à côté de ce que les cartes disent d'elles-mêmes.
    <textarea
      className={onBook ? book.headDescription : styles.idDescription}
      value={description}
      onChange={(event) => onDescriptionChange(event.target.value)}
      placeholder="Ce que ce deck cherche à faire (facultatif)"
      aria-label="Description du deck"
      maxLength={DECK_DESCRIPTION_MAX}
      rows={2}
    />
  );

  if (onBook) {
    const count = cardIds.length;
    const status = deckSizeStatus(count);
    return (
      <div className={book.head}>
        <button
          type="button"
          className={book.headArt}
          style={artUrl ? { backgroundImage: `url("${artUrl}")` } : undefined}
          onClick={pickArt}
          title="Choisir l'illustration du deck"
          aria-label="Choisir l'illustration du deck"
        >
          <span className={book.headArtPlus} aria-hidden>
            +
          </span>
        </button>

        <div className={book.headNameRow}>
          {/* À gauche du nom : l'emblème du STYLE du deck ; tant qu'aucun
              n'est connu (deck vide, sans style choisi), un emplacement
              VIDE de même encombrement, réservé au futur type de deck
              généré. L'ancien sceau rouge à l'ancre ne disait rien. */}
          {styleId ? (
            <DeckStyleIcon
              styleId={styleId}
              labelled
              className={book.headStyleIcon}
            />
          ) : (
            <span className={book.styleSlot} aria-hidden />
          )}
          {nameField}
        </div>

        <div className={book.headBadges}>
          {variants.standard && <span className={styles.badgeStandard}>Standard</span>}
          {variants.standard && variants.abyssal && (
            <span className={book.headBadgePlus} aria-hidden>
              +
            </span>
          )}
          {variants.abyssal && <span className={styles.badgeAbyssal}>Abyssal</span>}
          <span className={book.headStatus} data-status={status}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        <p className={book.headCount}>
          <strong>{count}</strong> / {RULES.DECK_SIZE_MAX} cartes
        </p>

        {descriptionField}
      </div>
    );
  }

  return (
    <div className={styles.idCard}>
      <button
        type="button"
        className={styles.idArt}
        style={artUrl ? { backgroundImage: `url("${artUrl}")` } : undefined}
        onClick={pickArt}
        title="Choisir l'illustration du deck"
        aria-label="Choisir l'illustration du deck"
      />

      <div className={styles.idBody}>
        <div className={styles.idNameRow}>{nameField}</div>

        <div className={styles.idBadges}>
          {variants.standard && <span className={styles.badgeStandard}>Standard</span>}
          {variants.abyssal && <span className={styles.badgeAbyssal}>Abyssal</span>}
        </div>

        {descriptionField}
      </div>
    </div>
  );
}
